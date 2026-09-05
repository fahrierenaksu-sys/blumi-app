import type { FastifyInstance } from "fastify"
import { z } from "zod"
import {
  authenticatedErrorResponses,
  publicProfileCardSchema,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { CapabilityService } from "../capabilities/capabilityService"
import { resolveRequestCapabilities } from "../avatar/avatarReadProjection"
import type { PersonalRoomDecorService } from "../rooms/personalRoomDecorService"
import type { RoomSnapshotService } from "../rooms/roomSnapshotService"
import { resolveBearerSession } from "./routeHelpers"

const ROOM_SNAPSHOT_ASSET_KEY = /^[a-f0-9]{64}$/
const visibilityBodySchema = z.object({
  isPublic: z.boolean(),
  headline: z.string().max(120).nullable().optional()
}).strict()

export async function registerRoomSnapshotRoutes(
  app: FastifyInstance,
  services: {
    authService: AuthService
    personalRoomDecorService: PersonalRoomDecorService
    roomSnapshotService: RoomSnapshotService
    capabilityService?: CapabilityService
  }
): Promise<void> {
  app.put<{ Body: { isPublic: boolean; headline?: string | null } }>(
    "/v1/users/me/room-showcase",
    {
      attachValidation: true,
      // Do not coerce booleans or silently strip unknown fields before validation.
      validatorCompiler: () => (data) => {
        const result = visibilityBodySchema.safeParse(data)
        return result.success ? { value: result.data } : { error: result.error }
      },
      schema: {
        body: {
          type: "object",
          required: ["isPublic"],
          additionalProperties: false,
          properties: {
            isPublic: { type: "boolean" },
            headline: { type: ["string", "null"], maxLength: 120 }
          }
        },
        response: {
          200: successResponseJsonSchema,
          ...authenticatedErrorResponses
        }
      }
    },
    async (request, reply) => {
      const resolved = await resolveBearerSession({
        request,
        reply,
        authService: services.authService
      })
      if (!resolved) return
      if (request.validationError) {
        return reply.code(400).send({ error: "Choose valid room showcase settings." })
      }
      if (services.capabilityService && !resolveRequestCapabilities(
        request,
        resolved.account.userId,
        services.capabilityService
      ).capabilities.discovery_room_showcase) {
        return reply.code(404).send({ error: "Room showcase is not available." })
      }
      const body = request.body
      const headline = body.headline === undefined ? null : body.headline
      const parsedHeadline = publicProfileCardSchema.shape.roomHeadline.safeParse(
        headline
      )
      if (!parsedHeadline.success) {
        return reply.code(400).send({ error: "Choose a valid room headline." })
      }
      const room = await services.personalRoomDecorService.get(
        resolved.account.userId
      )
      const snapshot = await services.roomSnapshotService.setVisibilityForRoom({
        userId: resolved.account.userId,
        room,
        isPublic: body.isPublic,
        headline: parsedHeadline.data
      })
      if (!snapshot) {
        return reply.code(409).send({
          code: "ROOM_SHOWCASE_REVISION_CONFLICT",
          error: "Save your room before publishing its showcase."
        })
      }
      return {
        roomShowcase: {
          isPublic: snapshot.isPublic,
          headline: snapshot.headline,
          roomRevision: snapshot.roomRevision
        }
      }
    }
  )

  app.get<{ Params: { assetKey: string } }>(
    "/v1/room-showcase/:assetKey",
    {
      config: { apiAuth: "public" },
      schema: {
        response: {
          200: { content: { "image/webp": { schema: { type: "string", format: "binary" } } } },
          400: { type: "object", additionalProperties: true },
          404: { type: "null" }
        },
        params: {
          type: "object",
          required: ["assetKey"],
          additionalProperties: false,
          properties: {
            assetKey: { type: "string", pattern: "^[a-f0-9]{64}$" }
          }
        }
      }
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store")
      if (!ROOM_SNAPSHOT_ASSET_KEY.test(request.params.assetKey)) {
        return reply.code(404).send()
      }
      const snapshot = await services.roomSnapshotService.findByAssetKey(
        request.params.assetKey
      )
      if (!snapshot || !snapshot.isPublic) {
        return reply.code(404).send()
      }
      return reply
        .type(snapshot.mimeType)
        .send(Buffer.from(snapshot.body))
    }
  )
}
