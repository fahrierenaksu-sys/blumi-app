import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"

/**
 * Maximum staleness of a positive realtime authorization decision.
 *
 * Authorization is event-driven: every revocation the server performs (sign
 * out, account deletion, phone change, refresh-token reuse, moderation
 * resolution) drops the cached answer at once, re-checks the affected sockets
 * on this instance and is forwarded to every other instance over the fanout
 * control channel. The TTL only bounds changes no instance announces (a
 * session family reaching expires_at, a manual database edit, a lost
 * notification): a positive answer is reused for at most this long, measured
 * from the moment its database check started.
 *
 * Live connections are refreshed in batches by the periodic sweep
 * (REALTIME_AUTHORIZATION_SWEEP_INTERVAL_MS), so a connection that keeps
 * sending or receiving never waits for a database check on its hot path.
 */
export const REALTIME_AUTHORIZATION_CACHE_TTL_MS = 60_000

/** How often the realtime server re-checks every live connection in batches. */
export const REALTIME_AUTHORIZATION_SWEEP_INTERVAL_MS = 30_000

/** Identities per batched check: one session query and one account query. */
export const REALTIME_AUTHORIZATION_BATCH_SIZE = 500

/** Maximum concurrent single checks when no batched check is available. */
export const REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY = 8

/**
 * Longest a check may run and still record its answer. Revocation stamps are
 * kept this long, so a slower check is discarded rather than trusted.
 */
const MAX_OBSERVATION_MS = 60_000

export interface RealtimeAuthorizationIdentity {
  userId: string
  sessionFamilyId: string
}

/**
 * A batched answer. `notAfter` (epoch ms) is when the session family expires
 * on its own; the cached decision never outlives it, so expiry is exact.
 */
export type RealtimeAuthorizationAnswer = boolean | { allowed: boolean; notAfter?: number }

/** The moment a check started, used to discard answers that predate a revocation. */
export interface RealtimeAuthorizationObservation {
  readonly startedAt: number
  readonly generation: number
}

export interface RealtimeAuthorizationCache {
  /** Resolves the decision; rejects when the check fails so callers fail closed. */
  authorize(identity: RealtimeAuthorizationIdentity): Promise<boolean>
  /** Starts an observation for a check performed elsewhere (the upgrade). */
  observe(): RealtimeAuthorizationObservation
  /**
   * Records an allowed decision reached by a check that started at
   * `observation`, unless this user (or everyone) was revoked since. The
   * decision expires at the TTL or at `notAfter`, whichever comes first.
   */
  recordAllowed(
    identity: RealtimeAuthorizationIdentity,
    observation: RealtimeAuthorizationObservation,
    notAfter?: number
  ): void
  /**
   * Re-checks identities in batches and refreshes their cached decisions.
   * Returns the identities that are no longer allowed; rejects when a batch
   * check fails, leaving earlier decisions to expire within the TTL.
   */
  refresh(identities: readonly RealtimeAuthorizationIdentity[]): Promise<RealtimeAuthorizationIdentity[]>
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
  /** Batched check; one answer per identity, in order. */
  checkMany?(identities: readonly RealtimeAuthorizationIdentity[]): Promise<RealtimeAuthorizationAnswer[]>
  ttlMs?: number
  now?: () => number
}): RealtimeAuthorizationCache {
  const ttlMs = input.ttlMs ?? REALTIME_AUTHORIZATION_CACHE_TTL_MS
  const now = input.now ?? Date.now
  const allowed = new Map<string, CachedDecision>()
  const inFlight = new Map<string, InFlightCheck>()
  // Every invalidation advances the generation and stamps the revoked user
  // (or everyone). A check that started before the stamp may have read
  // pre-revocation state, so its positive answer is never stored.
  let generation = 0
  let everyoneRevokedAt = 0
  const userRevokedAt = new Map<string, { generation: number; at: number }>()

  const observe = (): RealtimeAuthorizationObservation => ({ startedAt: now(), generation })
  const isCurrent = (userId: string, observation: RealtimeAuthorizationObservation): boolean =>
    everyoneRevokedAt <= observation.generation &&
    (userRevokedAt.get(userId)?.generation ?? 0) <= observation.generation &&
    now() - observation.startedAt <= MAX_OBSERVATION_MS
  const store = (
    identity: RealtimeAuthorizationIdentity,
    observation: RealtimeAuthorizationObservation,
    notAfter?: number
  ): void => {
    if (ttlMs <= 0 || !isCurrent(identity.userId, observation)) return
    const expiresAt = Math.min(observation.startedAt + ttlMs, notAfter ?? Number.POSITIVE_INFINITY)
    if (!(expiresAt > now())) return
    allowed.set(cacheKey(identity), { userId: identity.userId, expiresAt })
  }

  async function checkBatch(
    batch: readonly RealtimeAuthorizationIdentity[]
  ): Promise<{ allowed: boolean; notAfter?: number }[]> {
    if (input.checkMany) {
      const results = await input.checkMany(batch)
      if (results.length !== batch.length) throw new Error("Realtime authorization batch answer is incomplete.")
      return results.map((result) => typeof result === "boolean"
        ? { allowed: result }
        : { allowed: result.allowed === true, ...(Number.isFinite(result.notAfter) ? { notAfter: result.notAfter } : {}) })
    }
    const results: { allowed: boolean }[] = batch.map(() => ({ allowed: false }))
    let failure: unknown
    await forEachWithConcurrency(batch.map((identity, index) => ({ identity, index })),
      REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY, async ({ identity, index }) => {
        try {
          results[index] = { allowed: await input.check({ ...identity }) === true }
        } catch (error) {
          failure ??= error
        }
      })
    if (failure) throw failure
    return results
  }

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

      const observation = observe()
      const flight: InFlightCheck = { userId: identity.userId, promise: Promise.resolve(false) }
      flight.promise = Promise.resolve()
        .then(() => input.check({ userId: identity.userId, sessionFamilyId: identity.sessionFamilyId }))
        .then((result) => {
          const isAllowed = result === true
          if (isAllowed) store(identity, observation)
          return isAllowed
        })
        .finally(() => {
          if (inFlight.get(key) === flight) inFlight.delete(key)
        })
      inFlight.set(key, flight)
      return flight.promise
    },
    observe,
    recordAllowed(identity, observation, notAfter) {
      store(identity, observation, notAfter)
    },
    async refresh(identities) {
      const unique = new Map<string, RealtimeAuthorizationIdentity>()
      for (const identity of identities) unique.set(cacheKey(identity), identity)
      const pending = [...unique.values()]
      const denied: RealtimeAuthorizationIdentity[] = []
      for (let start = 0; start < pending.length; start += REALTIME_AUTHORIZATION_BATCH_SIZE) {
        const batch = pending.slice(start, start + REALTIME_AUTHORIZATION_BATCH_SIZE)
        const observation = observe()
        const results = await checkBatch(batch)
        batch.forEach((identity, index) => {
          const result = results[index]!
          if (result.allowed) {
            store(identity, observation, result.notAfter)
          } else {
            allowed.delete(cacheKey(identity))
            denied.push(identity)
          }
        })
      }
      return denied
    },
    invalidate(revocation) {
      generation += 1
      if (revocation.kind === "all") {
        everyoneRevokedAt = generation
        allowed.clear()
        inFlight.clear()
        return
      }
      userRevokedAt.set(revocation.userId, { generation, at: now() })
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
      for (const [userId, stamp] of userRevokedAt) {
        if (current - stamp.at > MAX_OBSERVATION_MS) userRevokedAt.delete(userId)
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
