import type { FastifyInstance } from "fastify"
import {
  authenticatedErrorResponses,
  blockUserRequestSchema,
  coreApiJsonSchemas,
  reportUserRequestSchema,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { MiniRoomService } from "../miniRooms/miniRoomService"
import {
  ReportIdempotencyConflictError,
  type SafetyService
} from "../safety/safetyService"
import { isPublicRequestError } from "../errors/publicRequestError"
import { readParam, resolveBearerSession } from "./routeHelpers"

export interface SafetyRouteServices {
  authService: AuthService
  safetyService: SafetyService
  miniRoomService?: MiniRoomService
}

export async function registerSafetyRoutes(
  app: FastifyInstance,
  services: SafetyRouteServices
): Promise<void> {
  const { authService, safetyService, miniRoomService } = services

  app.get("/v1/safety/blocks", {
    schema: {
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({ request, reply, authService })
    if (!resolved) return

    const blocks = await safetyService.listBlocks(resolved.account.userId)
    const blocksWithProfiles = await Promise.all(
      blocks.map(async (block) => {
        const account = await authService.repository.findAccountByUserId(
          block.blockedUserId
        )
        if (!account) return block
        return {
          ...block,
          blockedProfile: {
            userId: account.userId,
            displayName: account.profile.displayName,
            ...(account.profile.avatar.presetId
              ? { avatarPresetId: account.profile.avatar.presetId }
              : {})
          }
        }
      })
    )
    return {
      userId: resolved.account.userId,
      blocks: blocksWithProfiles
    }
  })

  app.post("/v1/safety/blocks", {
    attachValidation: true,
    schema: {
      body: coreApiJsonSchemas.blockUser,
      response: {
        201: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({ request, reply, authService })
    if (!resolved) return

    const parsed = blockUserRequestSchema.safeParse(request.body)
    const blockedUserId = parsed.success ? parsed.data.blockedUserId : ""

    try {
      const block = await safetyService.blockUser(
        resolved.account.userId,
        blockedUserId
      )
      await miniRoomService?.separateUserPair(
        resolved.account.userId,
        block.blockedUserId
      )
      return reply.code(201).send({ block })
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({
        error: error.message
      })
    }
  })

  app.delete("/v1/safety/blocks/:blockedUserId", {
    attachValidation: true,
    schema: {
      params: {
        type: "object",
        required: ["blockedUserId"],
        properties: { blockedUserId: { type: "string", minLength: 1 } },
        additionalProperties: false
      },
      response: {
        204: { type: "null" },
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({ request, reply, authService })
    if (!resolved) return

    const blockedUserId = readParam(request, "blockedUserId")
    if (!blockedUserId) {
      return reply.code(400).send({ error: "Choose a person first." })
    }

    await safetyService.unblockUser(resolved.account.userId, blockedUserId)
    return reply.code(204).send()
  })

  app.post("/v1/safety/reports", {
    attachValidation: true,
    schema: {
      body: coreApiJsonSchemas.reportUser,
      headers: {
        type: "object",
        properties: { "idempotency-key": { type: "string", minLength: 1 } },
        additionalProperties: true
      },
      response: {
        200: successResponseJsonSchema,
        201: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({ request, reply, authService })
    if (!resolved) return

    const parsed = reportUserRequestSchema.safeParse(request.body)
    const reportedUserId = parsed.success ? parsed.data.reportedUserId : ""
    const reason = parsed.success ? parsed.data.reason : ""
    const note = parsed.success ? parsed.data.note : undefined
    const idempotencyKey = readIdempotencyKey(request.headers["idempotency-key"])

    try {
      const result = await safetyService.reportUser(resolved.account.userId, {
        reportedUserId,
        reason,
        note,
        idempotencyKey
      })
      await miniRoomService?.separateUserPair(
        resolved.account.userId,
        result.block.blockedUserId
      )
      return reply.code(result.replayed ? 200 : 201).send(result)
    } catch (error) {
      if (error instanceof ReportIdempotencyConflictError) {
        return reply.code(409).send({ error: error.message })
      }
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({
        error: error.message
      })
    }
  })
}

function readIdempotencyKey(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined
}
