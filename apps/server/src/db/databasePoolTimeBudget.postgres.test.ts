import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createDatabasePools, resolveDatabasePoolSettings } from "./databasePoolConfig"

const databaseUrl = process.env.DATABASE_URL?.trim()
// Slack for a loaded machine: the budget must bound the wait, not match it exactly.
const SLACK_MS = 2_500

async function elapsed(run: () => Promise<unknown>): Promise<{ ms: number; error: unknown }> {
  const started = Date.now()
  try {
    await run()
    return { ms: Date.now() - started, error: undefined }
  } catch (error) {
    return { ms: Date.now() - started, error }
  }
}

test("the app pool bounds lock waits and long statements by default, and keeps serving afterwards", { skip: !databaseUrl }, async () => {
  const settings = resolveDatabasePoolSettings({})
  const { pool } = createDatabasePools({ databaseUrl, databasePool: { ...settings, max: 2 } })
  // A connection without the app budget, like the migrator's, holds the lock.
  const holder = new Pool({ connectionString: databaseUrl, max: 1 })
  const lockHolder = await holder.connect()
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS pool_budget_probe (id INTEGER PRIMARY KEY)")
    const budget = await pool.query(`SELECT current_setting('statement_timeout') AS statement,
      current_setting('lock_timeout') AS lock, current_setting('idle_in_transaction_session_timeout') AS idle`)
    assert.deepEqual(budget.rows[0], { statement: "10s", lock: "3s", idle: "30s" })
    const unbudgeted = await lockHolder.query("SELECT current_setting('statement_timeout') AS statement")
    assert.equal(unbudgeted.rows[0].statement, "0", "connections outside the app pool keep the server default")

    await lockHolder.query("BEGIN")
    await lockHolder.query("LOCK TABLE pool_budget_probe IN ACCESS EXCLUSIVE MODE")
    const lockWait = await elapsed(() => pool.query("SELECT count(*) FROM pool_budget_probe"))
    assert.equal((lockWait.error as { code?: string } | undefined)?.code, "55P03", "lock wait ends with lock_not_available")
    assert.ok(lockWait.ms < 3_000 + SLACK_MS, `lock wait took ${lockWait.ms} ms`)
    await lockHolder.query("ROLLBACK")

    const longQuery = await elapsed(() => pool.query("SELECT pg_sleep(30)"))
    assert.equal((longQuery.error as { code?: string } | undefined)?.code, "57014", "long statement ends with query_canceled")
    assert.ok(longQuery.ms < 10_000 + SLACK_MS, `long statement took ${longQuery.ms} ms`)

    const next = await pool.query("SELECT 1 AS ok")
    assert.equal(next.rows[0].ok, 1)
  } finally {
    await lockHolder.query("ROLLBACK").catch(() => undefined)
    lockHolder.release()
    await pool.query("DROP TABLE IF EXISTS pool_budget_probe").catch(() => undefined)
    await Promise.all([pool.end(), holder.end()])
  }
})

test("the client-side query timeout ends a stalled statement and the pool replaces the connection", { skip: !databaseUrl }, async () => {
  const settings = resolveDatabasePoolSettings({ BLUMI_DB_STATEMENT_TIMEOUT_MS: "60000", BLUMI_DB_QUERY_TIMEOUT_MS: "61000" })
  const { pool } = createDatabasePools({ databaseUrl, databasePool: { ...settings, queryTimeoutMs: 1_500, max: 1 } })
  try {
    const stalled = await elapsed(() => pool.query("SELECT pg_sleep(20)"))
    assert.match(String((stalled.error as Error | undefined)?.message), /timeout/i)
    assert.ok(stalled.ms < 1_500 + SLACK_MS, `stalled statement took ${stalled.ms} ms`)
    const next = await elapsed(() => pool.query("SELECT 1 AS ok"))
    assert.equal(next.error, undefined)
    assert.ok(next.ms < 1_500 + SLACK_MS, "the next query is not queued behind the stalled one")
  } finally {
    await pool.end()
    // The client gave up, but the server statement runs on (the app's 10 s statement_timeout bounds it in
    // production; it is 60 s here). End it so the gate can drop its database.
    const admin = new Pool({ connectionString: databaseUrl, max: 1 })
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND query = 'SELECT pg_sleep(20)'`)
    await admin.end()
  }
})
