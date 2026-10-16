import type { FastifyInstance, FastifyReply } from "fastify"
import { ROOM_PET_NAME_MAX_LENGTH, ROOM_PET_SPECIES_IDS } from "@blumi/domain"
import { authenticatedErrorResponses, successResponseJsonSchema } from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { RoomPetNameRefusal, RoomPetService } from "../roomPets/roomPetService"
import { resolveProductSession, schemaValidationFailed } from "./routeHelpers"

const READ_LIMIT = { max: 120, timeWindow: "1 minute" } as const
const WRITE_LIMIT = { max: 20, timeWindow: "1 minute" } as const
/** Generous transport bound; the service applies the real 16-code-point rule after NFC and trimming. */
const NAME_TRANSPORT_MAX = ROOM_PET_NAME_MAX_LENGTH * 4

const nameJsonSchema = { type: "string", minLength: 1, maxLength: NAME_TRANSPORT_MAX } as const
const speciesJsonSchema = { type: "string", minLength: 1, maxLength: 64 } as const

const NAME_REFUSAL_COPY: Record<RoomPetNameRefusal, string> = {
  empty: "Give your pet a name.",
  too_long: `A pet name can have at most ${ROOM_PET_NAME_MAX_LENGTH} characters.`,
  control_characters: "That name has characters that cannot be shown.",
  phone_like: "A pet name cannot look like a phone number.",
  not_allowed: "This name cannot be shared under the community rules. Please choose another."
}

function sendUnavailable(reply: FastifyReply) {
  return reply.code(409).send({ code: "ROOM_PET_UNAVAILABLE", error: "This is not available yet." })
}

function sendNameRefused(reply: FastifyReply, problem: RoomPetNameRefusal) {
  return reply.code(400).send({ code: "ROOM_PET_NAME_INVALID", reason: problem, error: NAME_REFUSAL_COPY[problem] })
}

/**
 * The room pet (P1). Registered only when BLUMI_ROOM_PET_ENABLED=1, so with
 * the flag off these routes do not exist. Every route is the caller's own
 * pet: no route takes a user, pet or room id, so another member's pet can be
 * neither read nor changed. Names and ids never reach a log.
 */
export async function registerRoomPetRoutes(
  app: FastifyInstance,
  services: { authService: AuthService; roomPetService: RoomPetService }
): Promise<void> {
  const { authService, roomPetService } = services

  app.get("/v1/users/me/pet", {
    config: { rateLimit: READ_LIMIT },
    schema: { response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses } }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const result = await roomPetService.getMyPet(resolved.account.userId)
    if (result.outcome === "unavailable") return sendUnavailable(reply)
    return { pet: result.pet, speciesIds: result.speciesIds }
  })

  app.post("/v1/users/me/pet/adopt", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: WRITE_LIMIT },
    schema: {
      body: {
        type: "object",
        required: ["speciesItemId", "name"],
        properties: { speciesItemId: speciesJsonSchema, name: nameJsonSchema },
        additionalProperties: false
      },
      response: { 201: successResponseJsonSchema, ...authenticatedErrorResponses }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    if (schemaValidationFailed(request)) {
      return reply.code(400).send({ code: "ROOM_PET_REQUEST_INVALID", error: "Choose a pet and a name first." })
    }
    const body = request.body as { speciesItemId: string; name: string }
    const result = await roomPetService.adopt(resolved.account.userId, body)
    switch (result.outcome) {
      case "unavailable":
        return sendUnavailable(reply)
      case "invalid_species":
        return reply.code(400).send({
          code: "ROOM_PET_SPECIES_INVALID",
          error: "That pet is not available.",
          speciesIds: ROOM_PET_SPECIES_IDS
        })
      case "invalid_name":
        return sendNameRefused(reply, result.problem)
      case "already_has_pet":
        return reply.code(409).send({ code: "ROOM_PET_ALREADY_ADOPTED", error: "You already have a pet." })
      case "adopted":
        return reply.code(201).send({ pet: result.pet })
    }
  })

  app.put("/v1/users/me/pet/name", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: WRITE_LIMIT },
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: { name: nameJsonSchema },
        additionalProperties: false
      },
      response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    if (schemaValidationFailed(request)) {
      return reply.code(400).send({ code: "ROOM_PET_REQUEST_INVALID", error: "Choose a name first." })
    }
    const result = await roomPetService.rename(resolved.account.userId, (request.body as { name: string }).name)
    switch (result.outcome) {
      case "unavailable":
        return sendUnavailable(reply)
      case "invalid_name":
        return sendNameRefused(reply, result.problem)
      case "no_pet":
        return reply.code(404).send({ code: "ROOM_PET_NOT_FOUND", error: "You do not have a pet yet." })
      case "renamed":
        return { pet: result.pet }
    }
  })
}
