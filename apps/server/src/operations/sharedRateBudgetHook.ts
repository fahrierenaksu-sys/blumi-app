import type { FastifyInstance } from "fastify"
import type { AuthService } from "../auth/authService"
import { readBearerToken, resolveRequestSession } from "../routes/routeHelpers"
import type { SharedRateBudget, UserRateBudgetScope } from "./sharedRateBudget"
import { safeOperationalErrorKind } from "./safeErrorLog"

/**
 * Per-user budget refusals, counted per scope and logged at most once a
 * minute as one warn line with counts only (no user, route or token).
 * 2026-10-02: build 14's registration loop showed up only in HTTP metrics.
 */
export function createBudgetRefusalLog(options: {
  warn(entry: { metric: "user_budget_refused"; windowSeconds: number; counts: Partial<Record<UserRateBudgetScope, number>> }): void
  now?: () => number
  windowMs?: number
}): (scope: UserRateBudgetScope) => void {
  const now = options.now ?? Date.now
  const windowMs = options.windowMs ?? 60_000
  let counts: Partial<Record<UserRateBudgetScope, number>> = {}
  let windowStartedAt = now()
  return (scope) => {
    counts[scope] = (counts[scope] ?? 0) + 1
    const elapsed = now() - windowStartedAt
    if (elapsed < windowMs) return
    options.warn({ metric: "user_budget_refused", windowSeconds: Math.round(elapsed / 1000), counts })
    counts = {}
    windowStartedAt = now()
  }
}

/** preHandler runs after the existing cheap onRequest/IP limiter. */
export function registerSharedRateBudget(app: FastifyInstance, auth: AuthService, budget: SharedRateBudget): void {
  // The first refusal of a quiet period is logged at once (its window began
  // at startup or at the last line), later ones at most once a minute.
  const recordRefusal = createBudgetRefusalLog({ warn: (entry) => app.log.warn(entry, "User request budget refusals") })
  app.addHook("preHandler", async (request, reply) => {
    const token = readBearerToken(request)
    if (!token) return
    // The route handler reuses this lookup (resolveBearerSession).
    const resolved = await resolveRequestSession(request, auth, token)
    if (!resolved) return
    try {
      const scope = requestBudgetScope(request.method, request.routeOptions.url)
      const result = await budget.consumeUser(resolved.account.userId, scope)
      if (!result.allowed) recordRefusal(scope)
      if (!result.allowed) return reply.header("Retry-After", String(result.retryAfterSeconds)).code(429)
        .send(scope === "chatSend"
          ? { code: "CHAT_SEND_RATE_LIMITED", error: "You're sending messages too quickly. Try again in a moment." }
          : { error: "Too many requests. Try again shortly." })
    } catch (error) {
      request.log.error({ errorKind: safeOperationalErrorKind(error) }, "Shared request budget unavailable")
      return reply.code(503).send({ error: "Service temporarily unavailable." })
    }
  })
}

export function requestBudgetScope(method: string, route: string | undefined): UserRateBudgetScope {
  if (route === "/v1/devices" && method === "POST") return "deviceRegistration"
  if (route === "/v1/devices" && method === "DELETE") return "deviceRemoval"
  if (method !== "POST") return "general"
  if (route === "/v1/threads/:threadId/messages") return "chatSend"
  if (route === "/v1/room-sessions/:roomSessionId/leave" || route === "/v1/users/me/active-room/leave") return "roomLeave"
  return "general"
}
