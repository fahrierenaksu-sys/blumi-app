import type { FastifyInstance } from "fastify"
import type { AuthService } from "../auth/authService"
import { readBearerToken, resolveRequestSession } from "../routes/routeHelpers"
import type { SharedRateBudget, UserRateBudgetScope } from "./sharedRateBudget"
import { safeOperationalErrorKind } from "./safeErrorLog"

/** preHandler runs after the existing cheap onRequest/IP limiter. */
export function registerSharedRateBudget(app: FastifyInstance, auth: AuthService, budget: SharedRateBudget): void {
  app.addHook("preHandler", async (request, reply) => {
    const token = readBearerToken(request)
    if (!token) return
    // The route handler reuses this lookup (resolveBearerSession).
    const resolved = await resolveRequestSession(request, auth, token)
    if (!resolved) return
    try {
      const scope = requestBudgetScope(request.method, request.routeOptions.url)
      const result = await budget.consumeUser(resolved.account.userId, scope)
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
  if (route === "/v1/devices" && (method === "POST" || method === "DELETE")) return "deviceRegistration"
  if (method !== "POST") return "general"
  if (route === "/v1/threads/:threadId/messages") return "chatSend"
  if (route === "/v1/room-sessions/:roomSessionId/leave" || route === "/v1/users/me/active-room/leave") return "roomLeave"
  return "general"
}
