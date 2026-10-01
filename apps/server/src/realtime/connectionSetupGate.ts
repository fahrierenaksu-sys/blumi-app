/**
 * Load shedding for realtime connection setup (2026-10-01).
 *
 * Each socket costs a few sequential queries to set up (ticket request with
 * its session lookups, ticket consume with its session lookup, lease
 * registration). After a deploy every client reconnects within seconds;
 * unbounded, those setups queued thousands of queries in the database pool in
 * front of the chat and room traffic of users who were already back, and
 * requests outlived the clients' own timeouts, so retries multiplied the load.
 * The gate admits at most `limit` setups at once and refuses the rest at once
 * (HTTP 503 with Retry-After for a ticket, 503 for an upgrade). The client
 * retries with jittered backoff, so the storm drains at the database's pace
 * while live traffic keeps the rest of the pool.
 */
export interface ConnectionSetupGate {
  /** A release function when a slot is free; null when the caller must shed. */
  tryAcquire(): (() => void) | null
  inFlight(): number
}

/** Seconds a refused client is asked to wait, before its own jitter. */
export const CONNECTION_SETUP_RETRY_AFTER_SECONDS = 2

/** Without a database pool (in-memory development) setups are cheap. */
export const DEFAULT_CONNECTION_SETUP_LIMIT = 64

/** Half the database pool: connection setup never takes all of it. */
export function connectionSetupLimitForPool(poolMax: number): number {
  return Math.max(2, Math.floor(poolMax / 2))
}

export function createConnectionSetupGate(limit = DEFAULT_CONNECTION_SETUP_LIMIT): ConnectionSetupGate {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Connection setup limit must be a positive integer.")
  let active = 0
  return {
    tryAcquire() {
      if (active >= limit) return null
      active += 1
      let released = false
      return () => {
        if (released) return
        released = true
        active -= 1
      }
    },
    inFlight: () => active
  }
}
