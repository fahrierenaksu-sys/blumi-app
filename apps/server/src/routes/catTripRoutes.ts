import type { FastifyInstance } from "fastify"
import { authenticatedErrorResponses, successResponseJsonSchema } from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { CatTripPrefsPatch } from "../catTrips/catTripPrefs"
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

  app.get("/v1/cat/prefs", {
    config: { rateLimit: READ_LIMIT },
    schema: { response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses } }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    return catTripService.getPrefs(resolved.account.userId)
  })

  app.put("/v1/cat/prefs", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: ACK_LIMIT },
    schema: {
      body: {
        type: "object",
        minProperties: 1,
        properties: {
          travelEnabled: { type: "boolean" },
          hostEnabled: { type: "boolean" },
          pushEnabled: { type: "boolean" }
        },
        additionalProperties: false
      },
      response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const body = request.body as Record<string, unknown> | undefined
    const patch = readPrefsPatch(body)
    if (!patch || schemaValidationFailed(request)) {
      return reply.code(400).send({ error: "Choose a setting first." })
    }
    const result = await catTripService.updatePrefs(resolved.account.userId, patch)
    switch (result.outcome) {
      case "disabled":
        return reply.code(409).send({ code: "CAT_TRIPS_DISABLED", error: "This is not available yet." })
      case "unavailable":
        return reply.code(409).send({ code: "CAT_PREFS_UNAVAILABLE", error: "This setting is not available yet." })
      case "saved":
        return { enabled: true, prefs: result.prefs }
    }
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

/** Only the three known switches, each a boolean; null when none is given or any is malformed. */
function readPrefsPatch(body: Record<string, unknown> | undefined): CatTripPrefsPatch | null {
  if (!body || typeof body !== "object") return null
  const keys = Object.keys(body)
  if (keys.length === 0) return null
  const patch: CatTripPrefsPatch = {}
  for (const key of keys) {
    const value = body[key]
    if (key !== "travelEnabled" && key !== "hostEnabled" && key !== "pushEnabled") return null
    if (typeof value !== "boolean") return null
    patch[key] = value
  }
  return patch
}
