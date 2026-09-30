import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { Pool } from "pg"
import { runMigrationsWithClient } from "./migrate"

const databaseUrl = process.env.DATABASE_URL?.trim()

// Mirrors migration 068: two ALTER TABLE statements on two tables and a
// partial unique index, all in the migrator's single transaction. Runs in a
// private schema with its own ledger so the real ledger is never touched.
async function createFixture() {
  const schema = `lock_probe_${randomUUID().replaceAll("-", "").slice(0, 12)}`
  const admin = new Pool({ connectionString: databaseUrl, max: 2 })
  await admin.query(`CREATE SCHEMA ${schema}`)
  await admin.query(`CREATE TABLE ${schema}.sessions (id TEXT PRIMARY KEY)`)
  await admin.query(`CREATE TABLE ${schema}.accounts (id TEXT PRIMARY KEY)`)
  const directory = await mkdtemp(join(tmpdir(), "blumi-lock-probe-"))
  await writeFile(join(directory, "001_probe.sql"), `
    ALTER TABLE ${schema}.sessions ADD COLUMN IF NOT EXISTS family_expires_at TIMESTAMPTZ;
    ALTER TABLE ${schema}.accounts ADD COLUMN IF NOT EXISTS firebase_uid TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ${schema}_uid_key
      ON ${schema}.accounts(firebase_uid) WHERE firebase_uid IS NOT NULL;
    CREATE TABLE ${schema}.observed AS
      SELECT current_setting('lock_timeout') AS lock_timeout;
  `)
  // One connection, scoped to the private schema, exactly like the migrator's
  // single pooled connection.
  const migrator = new Pool({
    connectionString: databaseUrl,
    max: 1,
    options: `-c search_path=${schema}`
  })
  const columns = async () => (await admin.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = $1 AND column_name IN ('family_expires_at', 'firebase_uid')
      ORDER BY table_name`, [schema])).rows
  const ledger = async () => (await admin.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`, [`${schema}.blumi_migrations`]
  )).rows[0].exists
    ? (await admin.query(`SELECT id FROM ${schema}.blumi_migrations`)).rows
    : []
  const cleanup = async () => {
    await migrator.end()
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
  }
  return { schema, admin, migrator, directory, columns, ledger, cleanup }
}

test("a blocked migration stops at the lock timeout and leaves no partial change", {
  skip: !databaseUrl
}, async () => {
  const fixture = await createFixture()
  const holder = await fixture.admin.connect()
  try {
    // A long-running reader on the second table. The first ALTER succeeds,
    // the second queues behind this lock.
    await holder.query("BEGIN")
    await holder.query(`LOCK TABLE ${fixture.schema}.accounts IN ACCESS SHARE MODE`)

    const started = Date.now()
    await assert.rejects(
      runMigrationsWithClient(await fixture.migrator.connect(), fixture.directory, {
        lockTimeoutMs: 500
      }),
      (error: { code?: string }) => error.code === "55P03"
    )
    const elapsed = Date.now() - started
    assert.ok(elapsed >= 450 && elapsed < 5_000, `stopped after ${elapsed} ms`)
    await holder.query("ROLLBACK")

    // The first ALTER was rolled back with the second: no half-applied schema.
    assert.deepEqual(await fixture.columns(), [])
    assert.deepEqual(await fixture.ledger(), [])

    // SET LOCAL did not leak onto the reused pooled connection.
    const after = await fixture.migrator.query("SHOW lock_timeout")
    assert.equal(after.rows[0].lock_timeout, "0")

    // Once the reader is gone the same migration applies in full, and the
    // limit was active inside its transaction.
    const result = await runMigrationsWithClient(
      await fixture.migrator.connect(), fixture.directory, { lockTimeoutMs: 500 })
    assert.deepEqual(result.applied, ["001_probe.sql"])
    assert.deepEqual((await fixture.columns()).map((row) => row.column_name),
      ["firebase_uid", "family_expires_at"])
    const observed = await fixture.admin.query(
      `SELECT lock_timeout FROM ${fixture.schema}.observed`)
    assert.equal(observed.rows[0].lock_timeout, "500ms")
  } finally {
    holder.release()
    await fixture.cleanup()
  }
})
