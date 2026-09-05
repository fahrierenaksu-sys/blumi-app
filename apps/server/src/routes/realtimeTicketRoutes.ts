import type { FastifyInstance } from "fastify"
import {
  authenticatedErrorResponses,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { RealtimeTicketService } from "../realtime/realtimeTicketService"
import { readBearerToken, resolveProductSession } from "./routeHelpers"

export async function registerRealtimeTicketRoutes(
  app: FastifyInstance,
  services: {
    authService: AuthService
    realtimeTicketService: RealtimeTicketService
  }
): Promise<void> {
  app.post(
    "/v1/auth/realtime-ticket",
    {
      config: { apiAuth: "bearer", rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        response: {
          201: successResponseJsonSchema,
          ...authenticatedErrorResponses
        }
      }
    },
    async (request, reply) => {
      const resolved = await resolveProductSession({
        request,
        reply,
        authService: services.authService
      })
      if (!resolved) return

      const sessionToken = readBearerToken(request)
      if (!sessionToken) {
        return reply.code(401).send({ error: "Sign in again to continue." })
      }
      const issued = await services.realtimeTicketService.issue(sessionToken)
      if (!issued) {
        return reply.code(401).send({ error: "Sign in again to continue." })
      }
      return reply
        .code(201)
        .header("cache-control", "no-store")
        .send(issued)
    }
  )
}
