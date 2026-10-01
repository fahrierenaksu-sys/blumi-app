import { createHash } from "node:crypto"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { CONNECTION_SETUP_RETRY_AFTER_SECONDS } from "../realtime/connectionSetupGate"
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
      // Keyed by session, not address (2026-10-01): behind a carrier NAT,
      // hundreds of phones share an address, and after a deploy all of them
      // need a ticket within seconds. Floods are bounded by the setup gate.
      config: {
        apiAuth: "bearer",
        rateLimit: { max: 30, timeWindow: "1 minute", keyGenerator: realtimeTicketRateLimitKey }
      },
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

/** The bearer session's digest, or the address when there is no token. */
export function realtimeTicketRateLimitKey(request: FastifyRequest): string {
  const token = readBearerToken(request)
  return token ? `session:${createHash("sha256").update(token).digest("hex")}` : `ip:${request.ip}`
}
