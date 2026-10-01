import { Pool, type PoolConfig } from "pg"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"

/**
 * node-postgres pool settings, explicit and configurable (2026-10-01).
 *
 * | Variable                              | Default | Range          | Why |
 * |---------------------------------------|---------|----------------|-----|
 * | BLUMI_DB_POOL_MAX                     | 10      | 2-100          | Unchanged from the node-postgres default. One connection is held by realtime LISTEN. With Supabase's session pooler (port 5432) every pooled connection pins one pooler connection, so keep this at or below the project's pool size minus the migrator and admin sessions. |
 * | BLUMI_DB_POOL_IDLE_TIMEOUT_MS         | 30000   | 1000-600000    | node-postgres closes idle connections after 10 s, so bursty traffic kept paying the TLS and pooler handshake (several round trips) again. |
 * | BLUMI_DB_POOL_CONNECTION_TIMEOUT_MS   | 10000   | 1000-60000     | node-postgres waits forever by default: a saturated or unreachable database stalled requests without bound. Now a request fails after this wait and the client retries. |
 * | BLUMI_DB_STATEMENT_TIMEOUT_MS         | unset   | 1000-600000    | Server-side statement limit, sent as a startup parameter. Off by default until it is verified through the Supavisor pooler in staging. |
 * | BLUMI_DB_QUERY_TIMEOUT_MS             | unset   | 1000-600000    | Client-side limit; the server statement keeps running. |
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
  statementTimeoutMs?: number
  queryTimeoutMs?: number
  applicationName?: string
}

export const DEFAULT_DATABASE_POOL_SETTINGS: Readonly<DatabasePoolSettings> = Object.freeze({
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
})

export function resolveDatabasePoolSettings(env: NodeJS.ProcessEnv): DatabasePoolSettings {
  const settings: DatabasePoolSettings = {
    max: readInteger(env, "BLUMI_DB_POOL_MAX", 2, 100) ?? DEFAULT_DATABASE_POOL_SETTINGS.max,
    idleTimeoutMillis: readInteger(env, "BLUMI_DB_POOL_IDLE_TIMEOUT_MS", 1_000, 600_000) ??
      DEFAULT_DATABASE_POOL_SETTINGS.idleTimeoutMillis,
    connectionTimeoutMillis: readInteger(env, "BLUMI_DB_POOL_CONNECTION_TIMEOUT_MS", 1_000, 60_000) ??
      DEFAULT_DATABASE_POOL_SETTINGS.connectionTimeoutMillis
  }
  const statementTimeoutMs = readInteger(env, "BLUMI_DB_STATEMENT_TIMEOUT_MS", 1_000, 600_000)
  if (statementTimeoutMs !== undefined) settings.statementTimeoutMs = statementTimeoutMs
  const queryTimeoutMs = readInteger(env, "BLUMI_DB_QUERY_TIMEOUT_MS", 1_000, 600_000)
  if (queryTimeoutMs !== undefined) settings.queryTimeoutMs = queryTimeoutMs
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
  const pool = new Pool(toPoolConfig(config.databaseUrl, config.databasePool))
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

export function toPoolConfig(connectionString: string | undefined, settings: DatabasePoolSettings): PoolConfig {
  return {
    connectionString,
    max: settings.max,
    idleTimeoutMillis: settings.idleTimeoutMillis,
    connectionTimeoutMillis: settings.connectionTimeoutMillis,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    ...(settings.statementTimeoutMs !== undefined ? { statement_timeout: settings.statementTimeoutMs } : {}),
    ...(settings.queryTimeoutMs !== undefined ? { query_timeout: settings.queryTimeoutMs } : {}),
    ...(settings.applicationName ? { application_name: settings.applicationName } : {})
  }
}

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
