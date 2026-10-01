import type { FastifyInstance } from "fastify"
import type { AuthService } from "../auth/authService"
import { preResolveBearerSession } from "../routes/routeHelpers"
import type { SharedRateBudget } from "./sharedRateBudget"
import { safeOperationalErrorKind } from "./safeErrorLog"

/**
 * preHandler runs after the existing cheap onRequest/IP limiter. The session
 * it reads is handed to the route's own resolution, so an authenticated
 * request reads its session once.
 */
export function registerSharedRateBudget(app: FastifyInstance, auth: AuthService, budget: SharedRateBudget): void {
  app.addHook("preHandler", async (request, reply) => {
    const resolved = await preResolveBearerSession(request, auth)
    if (!resolved) return
    try {
      const result = await budget.consumeUser(resolved.account.userId)
      if (!result.allowed) return reply.header("Retry-After", String(result.retryAfterSeconds)).code(429)
        .send({ error: "Too many requests. Try again shortly." })
    } catch (error) {
      request.log.error({ errorKind: safeOperationalErrorKind(error) }, "Shared request budget unavailable")
      return reply.code(503).send({ error: "Service temporarily unavailable." })
    }
  })
}
