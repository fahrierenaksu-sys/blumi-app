import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { Pool } from "pg"
import { runMigrationsWithClient } from "./migrate"
import { disposablePostgresSkip, disposablePostgresUrl } from "./disposablePostgres"

const databaseUrl = process.env.DATABASE_URL?.trim()

// Mirrors migration 068: two ALTER TABLE statements on two tables and a
// partial unique index, all in the migrator's single transaction. Runs in a
// private schema with its own ledger so the real ledger is never touched.
async function createFixture() {
  const schema = `lock_probe_${randomUUID().replaceAll("-", "").slice(0, 12)}`
  const admin = new Pool({ connectionString: disposablePostgresUrl(databaseUrl), max: 2 })
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
    connectionString: disposablePostgresUrl(databaseUrl),
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
  skip: disposablePostgresSkip().skip
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

test("a migrator waiting on another migrator's advisory lock stops at the lock timeout and resets it", {
  skip: disposablePostgresSkip().skip
}, async () => {
  const fixture = await createFixture()
  const otherMigrator = await fixture.admin.connect()
  try {
    // A second migrator (another deploy) holds the migration lock for longer
    // than the first one may wait.
    await otherMigrator.query("SELECT pg_advisory_lock(hashtextextended('blumi:migrations', 0))")

    const started = Date.now()
    await assert.rejects(
      runMigrationsWithClient(await fixture.migrator.connect(), fixture.directory, {
        lockTimeoutMs: 500
      }),
      (error: { code?: string; message?: string }) =>
        error.code === "55P03" && /lock timeout/.test(error.message ?? "")
    )
    const elapsed = Date.now() - started
    assert.ok(elapsed >= 450 && elapsed < 5_000, `stopped after ${elapsed} ms`)

    // Nothing ran while the lock was held, and the session limit is gone from
    // the pooled connection that will be reused.
    assert.deepEqual(await fixture.columns(), [])
    assert.deepEqual(await fixture.ledger(), [])
    const after = await fixture.migrator.query("SHOW lock_timeout")
    assert.equal(after.rows[0].lock_timeout, "0")

    // When the other migrator finishes, the waiting one applies in full.
    await otherMigrator.query("SELECT pg_advisory_unlock(hashtextextended('blumi:migrations', 0))")
    const result = await runMigrationsWithClient(
      await fixture.migrator.connect(), fixture.directory, { lockTimeoutMs: 500 })
    assert.deepEqual(result.applied, ["001_probe.sql"])
  } finally {
    await otherMigrator.query("SELECT pg_advisory_unlock_all()")
    otherMigrator.release()
    await fixture.cleanup()
  }
})

test("a migration on a connection that still carries the app's session budget runs without it", {
  skip: disposablePostgresSkip().skip
}, async () => {
  const fixture = await createFixture()
  try {
    await writeFile(join(fixture.directory, "002_slow.sql"), `
      SELECT pg_sleep(1.5);
      CREATE TABLE ${fixture.schema}.session_observed AS
        SELECT current_setting('statement_timeout') AS statement_timeout,
          current_setting('idle_in_transaction_session_timeout') AS idle_timeout;
    `)
    const client = await fixture.migrator.connect()
    // What a session pooler could hand over after an app connection used it.
    await client.query(`SELECT set_config('statement_timeout', '1s', false),
      set_config('lock_timeout', '1s', false), set_config('idle_in_transaction_session_timeout', '1s', false)`)
    const result = await runMigrationsWithClient(client, fixture.directory)
    assert.deepEqual(result.applied, ["001_probe.sql", "002_slow.sql"])
    const observed = await fixture.admin.query(`SELECT * FROM ${fixture.schema}.session_observed`)
    assert.deepEqual(observed.rows[0], { statement_timeout: "0", idle_timeout: "0" })
  } finally {
    await fixture.cleanup()
  }
})
