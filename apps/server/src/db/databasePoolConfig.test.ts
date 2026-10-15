import assert from "node:assert/strict"
import test from "node:test"
import { DatabaseError, Pool } from "pg"
import { resolveServerConfig } from "../config"
import {
  createDatabasePools,
  DEFAULT_DATABASE_POOL_SETTINGS,
  LISTEN_POOL_MAX,
  MIN_DB_LOCK_TIMEOUT_MS,
  MIN_LOCKED_SEND_TIMEOUT_MS,
  resolveDatabaseListenUrl,
  resolveDatabasePoolSettings,
  resolveLockedSendTimeoutMs,
  retryStatementConflictOnce,
  toPoolConfig
} from "./databasePoolConfig"

test("pool defaults keep the pool size and bound idle time, connection waits, statements, locks and idle transactions", () => {
  assert.deepEqual(resolveDatabasePoolSettings({}), {
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statementTimeoutMs: 10_000,
    lockTimeoutMs: 3_000,
    idleInTransactionTimeoutMs: 30_000,
    queryTimeoutMs: 12_000
  })
  const config = toPoolConfig("postgresql://example.invalid/db", DEFAULT_DATABASE_POOL_SETTINGS)
  assert.equal(config.max, 10)
  assert.equal(config.keepAlive, true)
  assert.equal(config.query_timeout, 12_000)
  assert.equal("application_name" in config, false)
})

test("every new app connection applies the server-side budget before it serves a query", async () => {
  const config = toPoolConfig("postgresql://example.invalid/db", DEFAULT_DATABASE_POOL_SETTINGS)
  const sent: Array<{ text: string; values?: unknown[] }> = []
  await config.onConnect?.({
    query: async (text: string, values?: unknown[]) => { sent.push({ text, values }); return { rows: [] } }
  } as never)
  assert.equal(sent.length, 1)
  assert.match(sent[0].text, /set_config\('statement_timeout', \$1, false\)/)
  assert.match(sent[0].text, /set_config\('lock_timeout', \$2, false\)/)
  assert.match(sent[0].text, /set_config\('idle_in_transaction_session_timeout', \$3, false\)/)
  assert.deepEqual(sent[0].values, ["10000ms", "3000ms", "30000ms"])
})

test("a client-side timeout at or below the server statement timeout is refused", () => {
  assert.throws(() => resolveDatabasePoolSettings({ BLUMI_DB_STATEMENT_TIMEOUT_MS: "15000", BLUMI_DB_QUERY_TIMEOUT_MS: "15000" }),
    /BLUMI_DB_QUERY_TIMEOUT_MS/)
  // Without an explicit client timeout it follows the server timeout.
  assert.equal(resolveDatabasePoolSettings({ BLUMI_DB_STATEMENT_TIMEOUT_MS: "60000" }).queryTimeoutMs, 62_000)
})

test("every pool setting is configurable within safe bounds", () => {
  const settings = resolveDatabasePoolSettings({
    BLUMI_DB_POOL_MAX: "14",
    BLUMI_DB_POOL_IDLE_TIMEOUT_MS: "60000",
    BLUMI_DB_POOL_CONNECTION_TIMEOUT_MS: "5000",
    BLUMI_DB_STATEMENT_TIMEOUT_MS: "15000",
    BLUMI_DB_QUERY_TIMEOUT_MS: "20000",
    BLUMI_DB_LOCK_TIMEOUT_MS: "4000",
    BLUMI_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "45000",
    BLUMI_DB_APPLICATION_NAME: "blumi-server"
  })
  const { onConnect, ...config } = toPoolConfig("postgresql://example.invalid/db", settings)
  assert.equal(typeof onConnect, "function")
  assert.deepEqual(config, {
    connectionString: "postgresql://example.invalid/db",
    max: 14,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    query_timeout: 20_000,
    application_name: "blumi-server"
  })
  assert.equal(settings.statementTimeoutMs, 15_000)
  assert.equal(settings.lockTimeoutMs, 4_000)
  assert.equal(settings.idleInTransactionTimeoutMs, 45_000)
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
    ["BLUMI_DB_LOCK_TIMEOUT_MS", "99"],
    ["BLUMI_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS", "600001"],
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

test("a push sent under locks gets two thirds of lock_timeout, at least the floor, never more than the provider timeout", () => {
  assert.equal(resolveLockedSendTimeoutMs(10_000, { lockTimeoutMs: 3_000 }), 2_000)
  assert.equal(resolveLockedSendTimeoutMs(1_500, { lockTimeoutMs: 3_000 }), 1_500)
  assert.equal(resolveLockedSendTimeoutMs(10_000, { lockTimeoutMs: MIN_DB_LOCK_TIMEOUT_MS }), MIN_LOCKED_SEND_TIMEOUT_MS)
  for (const lockTimeoutMs of [100, 600, MIN_DB_LOCK_TIMEOUT_MS - 1]) {
    assert.throws(() => resolveLockedSendTimeoutMs(10_000, { lockTimeoutMs }), /BLUMI_DB_LOCK_TIMEOUT_MS/, `${lockTimeoutMs}`)
  }
  // The floor still leaves a waiter a third of its lock budget.
  assert.ok(MIN_LOCKED_SEND_TIMEOUT_MS <= Math.floor(MIN_DB_LOCK_TIMEOUT_MS * 2 / 3))
})

test("a lock_timeout too small for the locked push send floor stops startup and names the variable", () => {
  for (const value of ["100", "500", String(MIN_DB_LOCK_TIMEOUT_MS - 1)]) {
    assert.throws(() => resolveDatabasePoolSettings({ BLUMI_DB_LOCK_TIMEOUT_MS: value }), /BLUMI_DB_LOCK_TIMEOUT_MS/, value)
    assert.throws(() => resolveServerConfig({ NODE_ENV: "test", BLUMI_DB_LOCK_TIMEOUT_MS: value }), /BLUMI_DB_LOCK_TIMEOUT_MS/, `server ${value}`)
  }
  assert.equal(resolveDatabasePoolSettings({ BLUMI_DB_LOCK_TIMEOUT_MS: String(MIN_DB_LOCK_TIMEOUT_MS) }).lockTimeoutMs,
    MIN_DB_LOCK_TIMEOUT_MS)
})
