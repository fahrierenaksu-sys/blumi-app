import type { FastifyInstance } from "fastify"
import { authenticatedErrorResponses, successResponseJsonSchema } from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { CatTripService } from "../catTrips/catTripService"
import { resolveProductSession, schemaValidationFailed } from "./routeHelpers"

const READ_LIMIT = { max: 120, timeWindow: "1 minute" } as const
const ACK_LIMIT = { max: 60, timeWindow: "1 minute" } as const

/**
 * The traveling cat's read side. The client only reads what the server
 * decided: it never picks a destination or a time. With the feature off (or
 * migration 077 not applied) every route answers `{ enabled: false }`; the
 * reveal acknowledgement answers 409 CAT_TRIPS_DISABLED.
 */
export async function registerCatTripRoutes(
  app: FastifyInstance,
  services: { authService: AuthService; catTripService: CatTripService }
): Promise<void> {
  const { authService, catTripService } = services

  app.get("/v1/cat/state", {
    config: { rateLimit: READ_LIMIT },
    schema: { response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses } }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    return catTripService.getState(resolved.account.userId)
  })

  app.get("/v1/cat/trip/current", {
    config: { rateLimit: READ_LIMIT },
    schema: { response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses } }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    return catTripService.getCurrentTrip(resolved.account.userId)
  })

  app.get("/v1/cat/guests", {
    config: { rateLimit: READ_LIMIT },
    schema: { response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses } }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    return catTripService.listGuests(resolved.account.userId)
  })

  app.post("/v1/cat/trips/:tripId/reveal-ack", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: ACK_LIMIT },
    schema: {
      params: {
        type: "object",
        required: ["tripId"],
        properties: { tripId: { type: "string", minLength: 1, maxLength: 80 } },
        additionalProperties: false
      },
      response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const tripId = (request.params as { tripId?: unknown }).tripId
    if (typeof tripId !== "string" || !tripId || schemaValidationFailed(request)) {
      return reply.code(400).send({ error: "Choose a trip first." })
    }
    const result = await catTripService.acknowledgeReveal(resolved.account.userId, tripId)
    switch (result.outcome) {
      case "disabled":
        return reply.code(409).send({ code: "CAT_TRIPS_DISABLED", error: "This is not available yet." })
      case "not_found":
        return reply.code(404).send({ error: "That trip is not available." })
      case "not_yet":
        return reply.code(409).send({ code: "CAT_TRIP_NOT_FINISHED", error: "Your cat is still away." })
      case "revealed":
        return { tripId: result.tripId, role: result.role, counterpartUserId: result.counterpartUserId }
    }
  })
}
