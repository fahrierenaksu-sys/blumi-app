import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createServer, type Socket } from "node:net"
import {
  DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
  parseMigrationTimeouts,
  runMigrations,
  runMigrationsWithClient
} from "./migrate"

test("migration runner applies sql files once in sorted order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blumi-migrations-"))
  await writeFile(join(directory, "002_second.sql"), "SELECT 2")
  await writeFile(join(directory, "001_first.sql"), "SELECT 1")
  const client = createFakeMigrationClient()

  const first = await runMigrationsWithClient(client as never, directory)
  const second = await runMigrationsWithClient(client as never, directory)

  assert.deepEqual(first.applied, ["001_first.sql", "002_second.sql"])
  assert.deepEqual(first.skipped, [])
  assert.deepEqual(second.applied, [])
  assert.deepEqual(second.skipped, ["001_first.sql", "002_second.sql"])
  assert.deepEqual(client.executedSql.filter((sql) => sql === "SELECT 1" || sql === "SELECT 2"), [
    "SELECT 1",
    "SELECT 2"
  ])
  assert.equal(client.releaseCount, 2)
  assert.equal(
    client.executedSql.filter((sql) => sql.includes("pg_advisory_lock")).length,
    2
  )
  assert.equal(
    client.executedSql.filter((sql) => sql.includes("pg_advisory_unlock")).length,
    2
  )
})

test("migration runner fails closed when an applied migration changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blumi-migration-drift-"))
  const migrationPath = join(directory, "001_stable.sql")
  await writeFile(migrationPath, "SELECT 1")
  const client = createFakeMigrationClient()

  await runMigrationsWithClient(client as never, directory)
  await writeFile(migrationPath, "SELECT 2")

  await assert.rejects(
    runMigrationsWithClient(client as never, directory),
    /checksum mismatch.*001_stable\.sql/i
  )
  assert.equal(client.releaseCount, 2)
  assert.equal(
    client.executedSql.filter((sql) => sql.includes("pg_advisory_unlock")).length,
    2
  )
})

test("each migration transaction sets a transaction-local lock timeout first", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blumi-migration-lock-"))
  await writeFile(join(directory, "001_first.sql"), "SELECT 1")
  const client = createFakeMigrationClient()

  await runMigrationsWithClient(client as never, directory, { lockTimeoutMs: 1234 })
  const begin = client.executedSql.indexOf("BEGIN")
  assert.equal(client.executedSql[begin + 1], "SELECT set_config('lock_timeout', $1, true)")
  assert.deepEqual(client.executedValues[begin + 1], ["1234ms"])
  assert.equal(client.executedSql[begin + 2], "SELECT 1")

  const defaults = createFakeMigrationClient()
  const other = await mkdtemp(join(tmpdir(), "blumi-migration-lock-default-"))
  await writeFile(join(other, "001_first.sql"), "SELECT 1")
  await runMigrationsWithClient(defaults as never, other)
  assert.ok(defaults.executedValues.some((values) =>
    values?.[0] === `${DEFAULT_MIGRATION_LOCK_TIMEOUT_MS}ms`))
})

test("migration runner rejects unsafe timeout values before touching the database", async () => {
  const client = createFakeMigrationClient()
  await assert.rejects(
    runMigrationsWithClient(client as never, tmpdir(), { lockTimeoutMs: 0 }),
    /lockTimeoutMs/
  )
  assert.equal(client.executedSql.length, 0)
  assert.throws(() => parseMigrationTimeouts({ BLUMI_MIGRATION_LOCK_TIMEOUT_MS: "5s" }), /whole number/)
  assert.deepEqual(parseMigrationTimeouts({
    BLUMI_MIGRATION_LOCK_TIMEOUT_MS: "5000",
    BLUMI_MIGRATION_CONNECT_TIMEOUT_MS: " 8000 "
  }), { lockTimeoutMs: 5000, connectTimeoutMs: 8000 })
})

test("connection wait is bounded separately from the lock timeout", async () => {
  // A server that accepts TCP and never answers the PostgreSQL handshake,
  // like a saturated pooler queue.
  const sockets = new Set<Socket>()
  const server = createServer((socket) => { sockets.add(socket) })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const started = Date.now()
  try {
    await assert.rejects(
      runMigrations({
        databaseUrl: `postgres://blumi:unused@127.0.0.1:${address.port}/blumi`,
        migrationsDirectory: tmpdir(),
        connectTimeoutMs: 300,
        lockTimeoutMs: 60_000
      }),
      /timeout/i
    )
    assert.ok(Date.now() - started < 5_000)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

function createFakeMigrationClient() {
  const applied = new Map<string, string | null>()
  return {
    executedSql: [] as string[],
    executedValues: [] as (unknown[] | undefined)[],
    releaseCount: 0,
    async query(sql: string, values?: unknown[]) {
      this.executedSql.push(sql.trim())
      this.executedValues.push(values)
      if (sql.includes("SELECT checksum FROM blumi_migrations")) {
        const id = String(values?.[0])
        return applied.has(id)
          ? { rowCount: 1, rows: [{ checksum: applied.get(id) }] }
          : { rowCount: 0, rows: [] }
      }
      if (sql.includes("INSERT INTO blumi_migrations")) {
        applied.set(String(values?.[0]), String(values?.[1]))
      }
      if (sql.includes("UPDATE blumi_migrations") && sql.includes("checksum")) {
        applied.set(String(values?.[0]), String(values?.[1]))
      }
      return { rowCount: 0, rows: [] }
    },
    release() {
      this.releaseCount += 1
    }
  }
}
