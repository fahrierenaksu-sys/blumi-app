import type { FastifyInstance } from "fastify"
import {
  authenticatedErrorResponses,
  coreApiJsonSchemas,
  personalRoomDecorSaveRequestSchema,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import {
  isPublicRequestError
} from "../errors/publicRequestError"
import type {
  PersonalRoomDecorService
} from "../rooms/personalRoomDecorService"
import { resolveBearerSession } from "./routeHelpers"

export async function registerPersonalRoomDecorRoutes(
  app: FastifyInstance,
  services: {
    authService: AuthService
    personalRoomDecorService: PersonalRoomDecorService
  }
): Promise<void> {
  app.get("/v1/users/me/room-decor", {
    schema: {
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({
      request,
      reply,
      authService: services.authService
    })
    if (!resolved) return
    return {
      roomDecor: await services.personalRoomDecorService.get(
        resolved.account.userId
      )
    }
  })

  app.put("/v1/users/me/room-decor", {
    attachValidation: true,
    schema: {
      body: coreApiJsonSchemas.personalRoomDecorSave,
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({
      request,
      reply,
      authService: services.authService
    })
    if (!resolved) return
    const parsed = personalRoomDecorSaveRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Refresh your room and try again." })
    }
    try {
      const result = await services.personalRoomDecorService.save(
        resolved.account.userId,
        {
          expectedRevision: parsed.data.expectedRevision,
          decor: parsed.data.decor
        }
      )
      if (result.kind === "conflict") {
        return reply.code(409).send({
          code: "ROOM_DECOR_REVISION_CONFLICT",
          error: "Your room changed on another device. Refresh and try again.",
          current: result.current
        })
      }
      return { roomDecor: result.snapshot }
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({ error: error.message })
    }
  })
}
