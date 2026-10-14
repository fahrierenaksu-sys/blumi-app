import { Pool, type ClientBase, type PoolConfig } from "pg"
import { isPostgresServerError } from "../operations/databaseErrorStatus"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"

/**
 * node-postgres pool settings, explicit and configurable (2026-10-01).
 *
 * | Variable                              | Default | Range          | Why |
 * |---------------------------------------|---------|----------------|-----|
 * | BLUMI_DB_POOL_MAX                     | 10      | 2-100          | Unchanged from the node-postgres default. One connection is held by realtime LISTEN. With Supabase's session pooler (port 5432) every pooled connection pins one pooler connection, so keep this at or below the project's pool size minus the migrator and admin sessions. |
 * | BLUMI_DB_POOL_IDLE_TIMEOUT_MS         | 30000   | 1000-600000    | node-postgres closes idle connections after 10 s, so bursty traffic kept paying the TLS and pooler handshake (several round trips) again. |
 * | BLUMI_DB_POOL_CONNECTION_TIMEOUT_MS   | 10000   | 1000-60000     | node-postgres waits forever by default: a saturated or unreachable database stalled requests without bound. Now a request fails after this wait and the client retries. |
 * | BLUMI_DB_STATEMENT_TIMEOUT_MS         | 10000   | 1000-600000    | Server-side statement limit (audit D07, 2026-10-14). The live role default was 120 s. |
 * | BLUMI_DB_LOCK_TIMEOUT_MS              | 3000    | 100-600000     | Server-side lock wait limit; the live default waited forever. |
 * | BLUMI_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS | 30000 | 1000-600000    | Ends a transaction left idle, for example by a stalled request. Above the 10 s push provider call held inside one. |
 * | BLUMI_DB_QUERY_TIMEOUT_MS             | statement + 2000 | 1000-600000 | Client-side backstop for a stalled network or pooler; must exceed the statement limit so the server cancels first. |
 *
 * The three server-side limits are set with set_config(..., false) once per
 * new connection (pg-pool's awaited onConnect hook), not as startup
 * parameters: Supavisor does not reliably forward startup parameters, and
 * the live DATABASE_URL is the session pooler (port 5432), where a session
 * setting stays with the client's pinned backend. Statements that need more
 * (account export, SMS admission) raise or lower it with SET LOCAL. Behind a
 * transaction pooler (port 6543) a session setting is not tied to this
 * client; there the client-side timeout still holds, and a role-level
 * `ALTER ROLE ... SET` is the owner's choice. Only the app pools get this
 * budget: the migrator and backup/restore tools open their own connections.
 * | BLUMI_DB_APPLICATION_NAME             | unset   | [A-Za-z0-9._-]{1,63} | Labels sessions in pg_stat_activity. |
 *
 * TCP keepalive is always on, so a connection silently dropped by a NAT or
 * the pooler is detected instead of hanging the next query.
 *
 * BLUMI_DB_LISTEN_URL (optional) gives realtime LISTEN its own small pool.
 * LISTEN needs a session, so it must be a direct or session-pooler URL; with
 * it set, DATABASE_URL may point at Supabase's transaction pooler (port 6543)
 * and BLUMI_DB_POOL_MAX can grow past the session pooler's size. The server
 * keeps no other session state outside transactions; migrations hold a
 * session lock and always use the session pooler (see the migration runbook).
 */
export const LISTEN_POOL_MAX = 2

export function resolveDatabaseListenUrl(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.BLUMI_DB_LISTEN_URL?.trim()
  if (!value) return undefined
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error("BLUMI_DB_LISTEN_URL must be a PostgreSQL connection URL.") }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("BLUMI_DB_LISTEN_URL must be a PostgreSQL connection URL.")
  }
  return value
}
export interface DatabasePoolSettings {
  max: number
  idleTimeoutMillis: number
  connectionTimeoutMillis: number
  statementTimeoutMs: number
  lockTimeoutMs: number
  idleInTransactionTimeoutMs: number
  queryTimeoutMs: number
  applicationName?: string
}

const QUERY_TIMEOUT_MARGIN_MS = 2_000

export const DEFAULT_DATABASE_POOL_SETTINGS: Readonly<DatabasePoolSettings> = Object.freeze({
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statementTimeoutMs: 10_000,
  lockTimeoutMs: 3_000,
  idleInTransactionTimeoutMs: 30_000,
  queryTimeoutMs: 12_000
})

export function resolveDatabasePoolSettings(env: NodeJS.ProcessEnv): DatabasePoolSettings {
  const statementTimeoutMs = readInteger(env, "BLUMI_DB_STATEMENT_TIMEOUT_MS", 1_000, 600_000) ??
    DEFAULT_DATABASE_POOL_SETTINGS.statementTimeoutMs
  const queryTimeoutMs = readInteger(env, "BLUMI_DB_QUERY_TIMEOUT_MS", 1_000, 600_000) ??
    statementTimeoutMs + QUERY_TIMEOUT_MARGIN_MS
  if (queryTimeoutMs <= statementTimeoutMs) {
    throw new Error("BLUMI_DB_QUERY_TIMEOUT_MS must exceed BLUMI_DB_STATEMENT_TIMEOUT_MS so the server cancels a statement first.")
  }
  const settings: DatabasePoolSettings = {
    max: readInteger(env, "BLUMI_DB_POOL_MAX", 2, 100) ?? DEFAULT_DATABASE_POOL_SETTINGS.max,
    idleTimeoutMillis: readInteger(env, "BLUMI_DB_POOL_IDLE_TIMEOUT_MS", 1_000, 600_000) ??
      DEFAULT_DATABASE_POOL_SETTINGS.idleTimeoutMillis,
    connectionTimeoutMillis: readInteger(env, "BLUMI_DB_POOL_CONNECTION_TIMEOUT_MS", 1_000, 60_000) ??
      DEFAULT_DATABASE_POOL_SETTINGS.connectionTimeoutMillis,
    statementTimeoutMs,
    lockTimeoutMs: readInteger(env, "BLUMI_DB_LOCK_TIMEOUT_MS", 100, 600_000) ??
      DEFAULT_DATABASE_POOL_SETTINGS.lockTimeoutMs,
    idleInTransactionTimeoutMs: readInteger(env, "BLUMI_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS", 1_000, 600_000) ??
      DEFAULT_DATABASE_POOL_SETTINGS.idleInTransactionTimeoutMs,
    queryTimeoutMs
  }
  const applicationName = env.BLUMI_DB_APPLICATION_NAME?.trim()
  if (applicationName) {
    if (!/^[A-Za-z0-9._-]{1,63}$/.test(applicationName)) {
      throw new Error("BLUMI_DB_APPLICATION_NAME must be 1-63 letters, digits, dots, dashes or underscores.")
    }
    settings.applicationName = applicationName
  }
  return settings
}

/**
 * The server's pools: the shared query pool and, with BLUMI_DB_LISTEN_URL, a
 * small session pool for realtime LISTEN. An idle connection dropped by the
 * pooler or the network emits `error` on its pool; unhandled, that would
 * crash the process and every socket with it, so each pool reports it.
 */
export function createDatabasePools(config: {
  databaseUrl?: string
  databaseListenUrl?: string
  databasePool: DatabasePoolSettings
}): { pool: Pool; listenPool?: Pool } {
  const pool = retryStatementConflictOnce(new Pool(toPoolConfig(config.databaseUrl, config.databasePool)))
  pool.on("error", (error) => {
    console.error("PostgreSQL idle connection failed", safeOperationalErrorKind(error))
  })
  if (!config.databaseListenUrl) return { pool }
  const listenPool = new Pool({ ...toPoolConfig(config.databaseListenUrl, config.databasePool), max: LISTEN_POOL_MAX })
  listenPool.on("error", (error) => {
    console.error("PostgreSQL listen connection failed", safeOperationalErrorKind(error))
  })
  return { pool, listenPool }
}

// serialization_failure and deadlock_detected: PostgreSQL rolled the
// statement back because of a concurrent transaction, not because of its input.
const STATEMENT_CONFLICT_STATES = new Set(["40001", "40P01"])

/**
 * Retries a `pool.query` statement once when PostgreSQL aborted it with a
 * serialization failure or a deadlock. A `pool.query` call is one autocommit
 * statement (the server keeps no transaction open across pool calls), and an
 * aborted statement left nothing behind, so running it again is the same as
 * running it once: the retry is idempotent by construction. Statements inside
 * an explicit transaction (`pool.connect()` clients) are not retried: the
 * whole transaction is aborted, so the error still reaches the route and maps
 * to 503 with Retry-After. Other errors, and streaming or callback queries,
 * pass through unchanged.
 *
 * Only safe for single autocommit statements. Never send multi-statement SQL
 * through `pool.query` (for example "BEGIN; ...; COMMIT" in one string): a
 * conflict after an inner COMMIT would run the committed part again.
 */
export function retryStatementConflictOnce(pool: Pool): Pool {
  const query = pool.query.bind(pool) as (...args: unknown[]) => unknown
  const retrying = (...args: unknown[]): unknown => {
    if (args.some((arg) => typeof arg === "function")) return query(...args)
    const result = query(...args)
    if (!(result instanceof Promise)) return result
    return result.catch((error: unknown) => {
      if (!isPostgresServerError(error) || !STATEMENT_CONFLICT_STATES.has(error.code)) throw error
      return query(...args)
    })
  }
  pool.query = retrying as Pool["query"]
  return pool
}

export function toPoolConfig(connectionString: string | undefined, settings: DatabasePoolSettings): PoolConfig {
  return {
    connectionString,
    max: settings.max,
    idleTimeoutMillis: settings.idleTimeoutMillis,
    connectionTimeoutMillis: settings.connectionTimeoutMillis,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    query_timeout: settings.queryTimeoutMs,
    ...(settings.applicationName ? { application_name: settings.applicationName } : {}),
    // pg-pool awaits this before handing the connection out; if it fails the
    // connection is closed and the checkout fails instead of running unbounded.
    onConnect: async (client: Pick<ClientBase, "query">) => {
      await client.query(APPLY_SESSION_BUDGET_SQL, [
        `${settings.statementTimeoutMs}ms`,
        `${settings.lockTimeoutMs}ms`,
        `${settings.idleInTransactionTimeoutMs}ms`
      ])
    }
  }
}

const APPLY_SESSION_BUDGET_SQL = `SELECT set_config('statement_timeout', $1, false),
  set_config('lock_timeout', $2, false),
  set_config('idle_in_transaction_session_timeout', $3, false)`

function readInteger(env: NodeJS.ProcessEnv, name: string, minimum: number, maximum: number): number | undefined {
  const raw = env[name]?.trim()
  if (!raw) return undefined
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number from ${minimum} to ${maximum}.`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a whole number from ${minimum} to ${maximum}.`)
  }
  return value
}
