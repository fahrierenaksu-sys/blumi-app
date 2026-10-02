import { DatabaseError } from "pg"

/**
 * HTTP meaning of an error that escaped a route from node-postgres. Only the
 * SQLSTATE is returned for logs: PostgreSQL messages and details can contain
 * row values (phone numbers, ids), so they never leave this function.
 */
export interface DatabaseErrorStatus {
  statusCode: 409 | 500 | 503
  sqlState?: string
  retryAfterSeconds?: number
}

// A concurrent write won a uniqueness or reference race: the request conflicts
// with current state and must not be retried blindly.
const CONFLICT_STATES = new Set(["23505", "23503"])
// The same request can succeed moments later.
const TRANSIENT_STATES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available (lock_timeout)
  "57014", // query_canceled (statement_timeout)
  "57P01", "57P02", "57P03", // admin shutdown, crash shutdown, cannot connect now
  "53300", "53400" // too_many_connections, configuration_limit_exceeded
])
const TRANSIENT_MESSAGES = [
  "timeout exceeded when trying to connect",
  "Connection terminated unexpectedly",
  "Connection terminated due to connection timeout"
]
/**
 * Supabase's pooler (Supavisor) refuses a client with SQLSTATE XX000 and a
 * message prefixed by its own code, for example "(EMAXCONNSESSION) max clients
 * reached in session mode". Every deploy overlap briefly exhausts the session
 * pool (2026-10-02 live logs); that is capacity, not a server bug, so the
 * client is told to back off and retry. Other XX000 errors stay 500.
 */
const POOLER_CAPACITY_MESSAGE = /^\((EMAXCONN[A-Z]*|ECHECKOUTFAILED|ECHECKOUTTIMEOUT)\)/
const TRANSIENT_SOCKET_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN"])

/**
 * A PostgreSQL server error (an ErrorResponse with a SQLSTATE). node-postgres
 * 8.x builds these as pg-protocol's DatabaseError with `name` set to "error",
 * so the name can never identify them. A second copy of pg-protocol in the
 * dependency tree would defeat instanceof, so a server-supplied severity plus
 * a 5-character SQLSTATE also qualifies.
 */
export function isPostgresServerError(error: unknown): error is Error & { code: string } {
  if (!(error instanceof Error)) return false
  const { code, severity } = error as { code?: unknown; severity?: unknown }
  if (typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)) return false
  return error instanceof DatabaseError || typeof severity === "string"
}

export function classifyDatabaseError(error: unknown): DatabaseErrorStatus | null {
  if (!(error instanceof Error)) return null
  const code = (error as { code?: unknown }).code
  if (isPostgresServerError(error) && typeof code === "string") {
    if (CONFLICT_STATES.has(code)) return { statusCode: 409, sqlState: code }
    if (TRANSIENT_STATES.has(code) || code.startsWith("08") ||
      (code === "XX000" && POOLER_CAPACITY_MESSAGE.test(error.message))) return { statusCode: 503, sqlState: code, retryAfterSeconds: 1 }
    return { statusCode: 500, sqlState: code }
  }
  if (TRANSIENT_MESSAGES.includes(error.message)) return { statusCode: 503, retryAfterSeconds: 1 }
  if (typeof code === "string" && TRANSIENT_SOCKET_CODES.has(code) && !("statusCode" in error)) {
    return { statusCode: 503, retryAfterSeconds: 1 }
  }
  return null
}
