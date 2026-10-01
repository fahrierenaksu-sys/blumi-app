import type { FastifyInstance, FastifyRequest } from "fastify"
import { CONNECTION_SETUP_RETRY_AFTER_SECONDS } from "../realtime/connectionSetupGate"
import {
  authenticatedErrorResponses,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { RealtimeTicketService } from "../realtime/realtimeTicketService"
import { readBearerToken, resolveProductSession } from "./routeHelpers"
import { createFixedWindowLimiter } from "../operations/requestLimits"

// Per verified person (2026-10-01). A per-IP limit of 30 starved everyone
// behind one carrier or office address; the per-IP limit is now a coarse
// ceiling and this cap applies after the session resolves.
const TICKETS_PER_PERSON_PER_MINUTE = 30
const TICKET_IP_CEILING_PER_MINUTE = 300

export async function registerRealtimeTicketRoutes(
  app: FastifyInstance,
  services: {
    authService: AuthService
    realtimeTicketService: RealtimeTicketService
  }
): Promise<void> {
  const ticketLimiter = createFixedWindowLimiter({ max: TICKETS_PER_PERSON_PER_MINUTE })
  // Load shedding (2026-10-01): a slot is taken before the shared request
  // budget and session lookups run, and released when the response is sent.
  const gate = services.realtimeTicketService.setupGate
  const releases = new WeakMap<FastifyRequest, () => void>()
  const release = (request: FastifyRequest) => {
    releases.get(request)?.()
    releases.delete(request)
  }
  app.post(
    "/v1/auth/realtime-ticket",
    {
      // A coarse per-address ceiling only: behind a carrier NAT hundreds of
      // phones share an address. Each person is limited after verification
      // (ticketLimiter), and floods are bounded by the setup gate.
      config: { apiAuth: "bearer", rateLimit: { max: TICKET_IP_CEILING_PER_MINUTE, timeWindow: "1 minute" } },
      onRequest: async (request, reply) => {
        if (!gate) return
        const acquired = gate.tryAcquire()
        if (!acquired) {
          return reply.code(503)
            .header("retry-after", String(CONNECTION_SETUP_RETRY_AFTER_SECONDS))
            .send({ error: "Blumi is busy reconnecting everyone. Try again in a moment." })
        }
        releases.set(request, acquired)
      },
      onResponse: async (request) => { release(request) },
      onRequestAbort: async (request) => { release(request) },
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
      const personLimit = ticketLimiter.consume(resolved.account.userId)
      if (!personLimit.allowed) {
        return reply.code(429).header("Retry-After", String(personLimit.retryAfterSeconds))
          .send({ error: "Too many requests. Try again shortly." })
      }

      const sessionToken = readBearerToken(request)
      if (!sessionToken) {
        return reply.code(401).send({ error: "Sign in again to continue." })
      }
      // The session resolved above is this request's, for this token.
      const issued = await services.realtimeTicketService.issue(sessionToken, undefined, resolved)
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
