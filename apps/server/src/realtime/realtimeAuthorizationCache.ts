import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"

/**
 * Maximum staleness of a positive realtime authorization decision.
 *
 * A cached "allowed" answer is reused for at most this long, measured from the
 * moment its database check *started*. Revocations that this process learns
 * about (sign-out, account deletion, phone change, moderation resolution) drop
 * the cached answer immediately and re-check the affected sockets. Revocations
 * this process cannot observe (a write on another server instance, a session
 * family reaching expires_at, a manual database change) are enforced on the
 * first check after the window ends, i.e. within this bound.
 */
export const REALTIME_AUTHORIZATION_CACHE_TTL_MS = 2_000

/** Maximum concurrent authorization checks issued by the periodic sweep. */
export const REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY = 8

export interface RealtimeAuthorizationIdentity {
  userId: string
  sessionFamilyId: string
}

export interface RealtimeAuthorizationCache {
  /** Resolves the decision; rejects when the check fails so callers fail closed. */
  authorize(identity: RealtimeAuthorizationIdentity): Promise<boolean>
  invalidate(revocation: RealtimeAccessRevocation): void
  purgeExpired(): void
  size(): number
}

interface CachedDecision {
  userId: string
  expiresAt: number
}

interface InFlightCheck {
  userId: string
  promise: Promise<boolean>
}

export function createRealtimeAuthorizationCache(input: {
  check(identity: RealtimeAuthorizationIdentity): Promise<boolean>
  ttlMs?: number
  now?: () => number
}): RealtimeAuthorizationCache {
  const ttlMs = input.ttlMs ?? REALTIME_AUTHORIZATION_CACHE_TTL_MS
  const now = input.now ?? Date.now
  const allowed = new Map<string, CachedDecision>()
  const inFlight = new Map<string, InFlightCheck>()
  // Any invalidation bumps the generation; a check that started before it may
  // have read pre-revocation state, so its positive answer is never stored.
  let generation = 0

  return {
    authorize(identity) {
      const key = cacheKey(identity)
      const cached = allowed.get(key)
      if (cached) {
        if (cached.expiresAt > now()) return Promise.resolve(true)
        allowed.delete(key)
      }
      const pending = inFlight.get(key)
      if (pending) return pending.promise

      const startedAt = now()
      const startedGeneration = generation
      const flight: InFlightCheck = { userId: identity.userId, promise: Promise.resolve(false) }
      flight.promise = Promise.resolve()
        .then(() => input.check({ userId: identity.userId, sessionFamilyId: identity.sessionFamilyId }))
        .then((result) => {
          const isAllowed = result === true
          if (isAllowed && ttlMs > 0 && generation === startedGeneration) {
            allowed.set(key, { userId: identity.userId, expiresAt: startedAt + ttlMs })
          }
          return isAllowed
        })
        .finally(() => {
          if (inFlight.get(key) === flight) inFlight.delete(key)
        })
      inFlight.set(key, flight)
      return flight.promise
    },
    invalidate(revocation) {
      generation += 1
      if (revocation.kind === "all") {
        allowed.clear()
        inFlight.clear()
        return
      }
      for (const [key, entry] of allowed) {
        if (entry.userId === revocation.userId) allowed.delete(key)
      }
      // Later callers must not join a check that may predate the revocation.
      for (const [key, entry] of inFlight) {
        if (entry.userId === revocation.userId) inFlight.delete(key)
      }
    },
    purgeExpired() {
      const current = now()
      for (const [key, entry] of allowed) {
        if (entry.expiresAt <= current) allowed.delete(key)
      }
    },
    size() {
      return allowed.size
    }
  }
}

/** Runs `task` over `items` with at most `limit` tasks in flight; task errors are the task's own concern. */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next]!
      next += 1
      try {
        await task(item)
      } catch {
        // Each task handles its own failure; one must not stall the rest.
      }
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker)
  await Promise.all(workers)
}

function cacheKey(identity: RealtimeAuthorizationIdentity): string {
  return `${identity.userId}\u0000${identity.sessionFamilyId}`
}
