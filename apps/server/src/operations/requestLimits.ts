import { createHash } from "node:crypto"
import type { FastifyInstance, FastifyRequest } from "fastify"

/**
 * Per-IP and per-user request limits (2026-10-01).
 *
 * Many people share one public address (mobile carrier CGNAT, office and
 * campus NAT), so a per-IP limit equal to the per-user limit throttled
 * strangers for each other. Authenticated traffic is limited per verified
 * user (the shared request budget and the per-route user limiters below);
 * the per-IP limit on it is only a coarse abuse ceiling. Requests without a
 * bearer token, and requests whose bearer token fails to verify, keep the
 * strict per-IP limit.
 */
export const UNAUTHENTICATED_IP_REQUESTS_PER_MINUTE = 100
export const AUTHENTICATED_IP_REQUESTS_PER_MINUTE = 1_000
export const FAILED_AUTH_RESPONSES_PER_IP_PER_MINUTE = 100

const MINUTE_MS = 60_000
const MAX_TRACKED_KEYS = 50_000

export function hasBearerAuthorization(request: FastifyRequest): boolean {
  const authorization = request.headers.authorization
  return typeof authorization === "string" && /^Bearer \S/.test(authorization)
}

/** Global per-IP ceiling for @fastify/rate-limit. */
export function ipRequestCeiling(request: FastifyRequest): number {
  return hasBearerAuthorization(request)
    ? AUTHENTICATED_IP_REQUESTS_PER_MINUTE
    : UNAUTHENTICATED_IP_REQUESTS_PER_MINUTE
}

export interface WindowLimitResult { allowed: boolean; retryAfterSeconds: number }

export interface FixedWindowLimiter {
  /** Counts one hit for the key and says whether it is within the limit. */
  consume(key: string): WindowLimitResult
  /** Says whether the key is already over the limit, without counting. */
  isLimited(key: string): WindowLimitResult
}

/**
 * In-process fixed-window counter, like @fastify/rate-limit's own memory
 * store. Keys are hashed so raw user ids or addresses are not held as keys,
 * and the table is bounded so a flood of distinct keys cannot grow it.
 */
export function createFixedWindowLimiter(options: {
  max: number
  windowMs?: number
  now?: () => number
}): FixedWindowLimiter {
  const windowMs = options.windowMs ?? MINUTE_MS
  const now = options.now ?? Date.now
  const windows = new Map<string, { started: number; count: number }>()

  function read(key: string, time: number) {
    const hashed = createHash("sha256").update(key).digest("base64url")
    const current = windows.get(hashed)
    const live = current && current.started + windowMs > time ? current : undefined
    return { hashed, live }
  }

  function result(count: number, started: number, time: number): WindowLimitResult {
    return {
      allowed: count <= options.max,
      retryAfterSeconds: Math.max(1, Math.ceil((started + windowMs - time) / 1000))
    }
  }

  function prune(time: number) {
    if (windows.size < MAX_TRACKED_KEYS) return
    for (const [key, value] of windows) {
      if (value.started + windowMs <= time) windows.delete(key)
    }
    // Still full of live keys: drop the oldest insertions.
    for (const key of windows.keys()) {
      if (windows.size < MAX_TRACKED_KEYS) break
      windows.delete(key)
    }
  }

  return {
    consume(key) {
      const time = now()
      const { hashed, live } = read(key, time)
      const entry = live
        ? { started: live.started, count: Math.min(live.count + 1, options.max + 1) }
        : { started: time, count: 1 }
      if (!live) prune(time)
      windows.set(hashed, entry)
      return result(entry.count, entry.started, time)
    },
    isLimited(key) {
      const time = now()
      const { live } = read(key, time)
      if (!live) return { allowed: true, retryAfterSeconds: 0 }
      return live.count >= options.max
        ? { allowed: false, retryAfterSeconds: result(live.count, live.started, time).retryAfterSeconds }
        : { allowed: true, retryAfterSeconds: 0 }
    }
  }
}

/**
 * A bearer token that fails to verify does not earn the authenticated
 * per-IP ceiling: every 401 counts against the caller's address, and an
 * address with too many in the window is refused before any session lookup.
 * Rotating invented tokens therefore cannot buy more than the strict
 * unauthenticated budget.
 */
export function registerFailedAuthLimiter(
  app: FastifyInstance,
  options: { max?: number; windowMs?: number; now?: () => number } = {}
): void {
  const limiter = createFixedWindowLimiter({
    max: options.max ?? FAILED_AUTH_RESPONSES_PER_IP_PER_MINUTE,
    windowMs: options.windowMs,
    now: options.now
  })
  app.addHook("onRequest", async (request, reply) => {
    const state = limiter.isLimited(`ip:${request.ip}`)
    if (state.allowed) return
    return reply.header("Retry-After", String(state.retryAfterSeconds)).code(429)
      .send({ error: "Too many requests. Try again shortly." })
  })
  app.addHook("onResponse", async (request, reply) => {
    if (reply.statusCode === 401) limiter.consume(`ip:${request.ip}`)
  })
}
