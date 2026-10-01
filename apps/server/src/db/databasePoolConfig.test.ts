import assert from "node:assert/strict"
import test from "node:test"
import { DatabaseError, Pool } from "pg"
import { resolveServerConfig } from "../config"
import {
  createDatabasePools,
  DEFAULT_DATABASE_POOL_SETTINGS,
  LISTEN_POOL_MAX,
  resolveDatabaseListenUrl,
  resolveDatabasePoolSettings,
  retryStatementConflictOnce,
  toPoolConfig
} from "./databasePoolConfig"

test("pool defaults keep the pool size and bound idle time and connection waits", () => {
  assert.deepEqual(resolveDatabasePoolSettings({}), {
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  })
  const config = toPoolConfig("postgresql://example.invalid/db", DEFAULT_DATABASE_POOL_SETTINGS)
  assert.equal(config.max, 10)
  assert.equal(config.keepAlive, true)
  // Off by default until verified through the Supavisor pooler.
  assert.equal("statement_timeout" in config, false)
  assert.equal("query_timeout" in config, false)
  assert.equal("application_name" in config, false)
})

test("every pool setting is configurable within safe bounds", () => {
  const settings = resolveDatabasePoolSettings({
    BLUMI_DB_POOL_MAX: "14",
    BLUMI_DB_POOL_IDLE_TIMEOUT_MS: "60000",
    BLUMI_DB_POOL_CONNECTION_TIMEOUT_MS: "5000",
    BLUMI_DB_STATEMENT_TIMEOUT_MS: "15000",
    BLUMI_DB_QUERY_TIMEOUT_MS: "20000",
    BLUMI_DB_APPLICATION_NAME: "blumi-server"
  })
  assert.deepEqual(toPoolConfig("postgresql://example.invalid/db", settings), {
    connectionString: "postgresql://example.invalid/db",
    max: 14,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    application_name: "blumi-server"
  })
})

test("invalid pool settings fail at startup instead of falling back silently", () => {
  for (const [name, value] of [
    ["BLUMI_DB_POOL_MAX", "1"],
    ["BLUMI_DB_POOL_MAX", "101"],
    ["BLUMI_DB_POOL_MAX", "ten"],
    ["BLUMI_DB_POOL_MAX", "10.5"],
    ["BLUMI_DB_POOL_IDLE_TIMEOUT_MS", "999"],
    ["BLUMI_DB_POOL_CONNECTION_TIMEOUT_MS", "60001"],
    ["BLUMI_DB_STATEMENT_TIMEOUT_MS", "-1"],
    ["BLUMI_DB_APPLICATION_NAME", "blumi server"]
  ] as const) {
    assert.throws(() => resolveDatabasePoolSettings({ [name]: value }), new RegExp(name), `${name}=${value}`)
  }
})

test("a separate session URL gives realtime LISTEN its own two-connection pool", async () => {
  assert.equal(resolveDatabaseListenUrl({}), undefined)
  assert.equal(resolveDatabaseListenUrl({ BLUMI_DB_LISTEN_URL: " postgresql://example.invalid:5432/db " }),
    "postgresql://example.invalid:5432/db")
  assert.throws(() => resolveDatabaseListenUrl({ BLUMI_DB_LISTEN_URL: "https://example.invalid" }), /BLUMI_DB_LISTEN_URL/)
  assert.throws(() => resolveDatabaseListenUrl({ BLUMI_DB_LISTEN_URL: "not a url" }), /BLUMI_DB_LISTEN_URL/)

  const shared = createDatabasePools({ databaseUrl: "postgresql://example.invalid/db", databasePool: DEFAULT_DATABASE_POOL_SETTINGS })
  assert.equal(shared.listenPool, undefined)
  assert.equal(shared.pool.listenerCount("error"), 1, "idle connection errors never crash the process")
  const split = createDatabasePools({
    databaseUrl: "postgresql://example.invalid:6543/db",
    databaseListenUrl: "postgresql://example.invalid:5432/db",
    databasePool: { ...DEFAULT_DATABASE_POOL_SETTINGS, max: 40 }
  })
  assert.equal(split.pool.options.max, 40)
  assert.equal(split.listenPool?.options.max, LISTEN_POOL_MAX)
  assert.equal(split.listenPool?.listenerCount("error"), 1)
  await Promise.all([shared.pool.end(), split.pool.end(), split.listenPool?.end()])
})

test("server configuration carries the resolved pool settings", () => {
  const config = resolveServerConfig({ NODE_ENV: "test", BLUMI_DB_POOL_MAX: "12" })
  assert.equal(config.databasePool.max, 12)
  assert.throws(() => resolveServerConfig({ NODE_ENV: "test", BLUMI_DB_POOL_MAX: "0" }), /BLUMI_DB_POOL_MAX/)
})

function conflict(code: string): DatabaseError {
  return Object.assign(new DatabaseError("could not serialize access", 0, "error"), { code, severity: "ERROR" })
}

test("pool statements aborted by a deadlock or serialization failure are retried exactly once", async () => {
  const outcomes: Array<Error | string> = [conflict("40P01"), "ok", conflict("40001"), conflict("40001"), conflict("23505")]
  let calls = 0
  const fake = {
    query: async (_sql: string) => {
      calls += 1
      const next = outcomes.shift()
      if (next instanceof Error) throw next
      return { rows: [next] }
    }
  } as unknown as Pool
  const pool = retryStatementConflictOnce(fake)
  assert.deepEqual(await pool.query("SELECT 1"), { rows: ["ok"] })
  assert.equal(calls, 2)
  // A second conflict in a row is not retried again.
  await assert.rejects(pool.query("SELECT 1"), { code: "40001" })
  assert.equal(calls, 4)
  // Constraint violations are answers, not transient failures.
  await assert.rejects(pool.query("SELECT 1"), { code: "23505" })
  assert.equal(calls, 5)
})

test("the shared server pool retries statement conflicts", async () => {
  const { pool } = createDatabasePools({ databaseUrl: "postgresql://example.invalid/db", databasePool: DEFAULT_DATABASE_POOL_SETTINGS })
  assert.notEqual(pool.query, Pool.prototype.query)
  await pool.end()
})
