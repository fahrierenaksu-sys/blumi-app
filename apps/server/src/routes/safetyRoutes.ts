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
import type { ConnectionManager } from "../realtime/connectionManager"
import {
  ReportIdempotencyConflictError,
  SafetyLimitError,
  type SafetyService
} from "../safety/safetyService"
import { createFixedWindowLimiter } from "../operations/requestLimits"
import { isPublicRequestError } from "../errors/publicRequestError"
import { readParam, resolveBearerSession, schemaValidationFailed } from "./routeHelpers"

export interface SafetyRouteServices {
  authService: AuthService
  safetyService: SafetyService
  miniRoomService?: MiniRoomService
  connectionManager: ConnectionManager
}

// Per verified person, counted before any validation (2026-10-01). The
// route-level per-IP limit is only a coarse ceiling for shared addresses.
const REPORTS_PER_PERSON_PER_MINUTE = 20
const BLOCKS_PER_PERSON_PER_MINUTE = 30
const SAFETY_WRITE_IP_CEILING = { max: 300, timeWindow: "1 minute" } as const
const TOO_MANY_SAFETY_WRITES = "Too many requests. Try again shortly."

const reporterReportResponseSchema = {
  type: "object",
  required: ["reportId", "createdAt", "status", "response"],
  additionalProperties: false,
  properties: {
    reportId: { type: "string" },
    createdAt: { type: "string" },
    status: { type: "string", enum: ["pending", "resolved", "dismissed"] },
    response: { type: "string" }
  }
} as const

export async function registerSafetyRoutes(
  app: FastifyInstance,
  services: SafetyRouteServices
): Promise<void> {
  const { authService, safetyService, miniRoomService, connectionManager } = services
  const reportLimiter = createFixedWindowLimiter({ max: REPORTS_PER_PERSON_PER_MINUTE })
  const blockLimiter = createFixedWindowLimiter({ max: BLOCKS_PER_PERSON_PER_MINUTE })

  app.get("/v1/safety/reports", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    schema: {
      response: {
        200: {
          type: "object",
          required: ["reports"],
          additionalProperties: false,
          properties: {
            reports: { type: "array", items: reporterReportResponseSchema }
          }
        },
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({ request, reply, authService })
    if (!resolved) return

    const reports = await safetyService.listReportsForActor(resolved.account.userId, 50)
    return {
      reports: reports.map((report) => ({
        reportId: report.reportId,
        createdAt: report.createdAt,
        status: report.status,
        response: reporterResponseForStatus(report.status)
      }))
    }
  })

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
    // One batched account lookup for every blocked user (was one per block).
    const accountsByUserId = new Map((blocks.length === 0
      ? []
      : await authService.repository.findAccountsByUserIds(
        blocks.map((block) => block.blockedUserId)
      )).map((account) => [account.userId, account]))
    const blocksWithProfiles = blocks.map((block) => {
      const account = accountsByUserId.get(block.blockedUserId)
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
    return {
      userId: resolved.account.userId,
      blocks: blocksWithProfiles
    }
  })

  app.post("/v1/safety/blocks", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: SAFETY_WRITE_IP_CEILING },
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
    const personLimit = blockLimiter.consume(resolved.account.userId)
    if (!personLimit.allowed) {
      return reply.code(429).header("Retry-After", String(personLimit.retryAfterSeconds))
        .send({ error: TOO_MANY_SAFETY_WRITES })
    }

    const parsed = blockUserRequestSchema.safeParse(request.body)
    if (!parsed.success || schemaValidationFailed(request)) {
      // Same answer the safety service gives for a missing person.
      return reply.code(400).send({ error: "Choose a person first." })
    }
    const blockedUserId = parsed.data.blockedUserId

    try {
      const block = await safetyService.blockUser(
        resolved.account.userId,
        blockedUserId
      )
      // The blocker's other devices drop the chat now (as the realtime
      // safety.block handler does); the blocked person is never told.
      connectionManager.sendToUser(resolved.account.userId, {
        type: "safety.user_blocked",
        payload: { blockedUserId: block.blockedUserId }
      })
      const endedRooms = await miniRoomService?.separateUserPair(
        resolved.account.userId,
        block.blockedUserId
      )
      for (const ended of endedRooms ?? []) {
        connectionManager.sendToUsers(ended.participantUserIds, {
          type: "mini_room.ended", payload: ended
        })
      }
      return reply.code(201).send({ block })
    } catch (error) {
      if (error instanceof SafetyLimitError) return reply.code(429).send({ error: error.message })
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({
        error: error.message
      })
    }
  })

  app.delete("/v1/safety/blocks/:blockedUserId", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
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
    if (!blockedUserId || schemaValidationFailed(request)) {
      return reply.code(400).send({ error: "Choose a person first." })
    }

    await safetyService.unblockUser(resolved.account.userId, blockedUserId)
    return reply.code(204).send()
  })

  app.post("/v1/safety/reports", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: SAFETY_WRITE_IP_CEILING },
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
    const personLimit = reportLimiter.consume(resolved.account.userId)
    if (!personLimit.allowed) {
      return reply.code(429).header("Retry-After", String(personLimit.retryAfterSeconds))
        .send({ error: TOO_MANY_SAFETY_WRITES })
    }

    const parsed = reportUserRequestSchema.safeParse(request.body)
    if (!parsed.success || schemaValidationFailed(request, "body")) {
      // Same answer the safety service gives for a malformed report.
      return reply.code(400).send({ error: "Choose a person first." })
    }
    if (schemaValidationFailed(request, "headers")) {
      return reply.code(400).send({ error: "Use a valid idempotency key." })
    }
    const { reportedUserId, reason, note } = parsed.data
    const idempotencyKey = readIdempotencyKey(request.headers["idempotency-key"])

    try {
      const result = await safetyService.reportUser(resolved.account.userId, {
        reportedUserId,
        reason,
        note,
        idempotencyKey
      })
      connectionManager.sendToUser(resolved.account.userId, {
        type: "safety.user_blocked",
        payload: { blockedUserId: result.block.blockedUserId }
      })
      const endedRooms = await miniRoomService?.separateUserPair(
        resolved.account.userId,
        result.block.blockedUserId
      )
      for (const ended of endedRooms ?? []) {
        connectionManager.sendToUsers(ended.participantUserIds, {
          type: "mini_room.ended", payload: ended
        })
      }
      return reply.code(result.replayed ? 200 : 201).send(result)
    } catch (error) {
      if (error instanceof ReportIdempotencyConflictError) {
        return reply.code(409).send({ error: error.message })
      }
      if (error instanceof SafetyLimitError) return reply.code(429).send({ error: error.message })
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({
        error: error.message
      })
    }
  })
}

function reporterResponseForStatus(status: "pending" | "resolved" | "dismissed"): string {
  if (status === "pending") {
    return "We received your report. Our safety team is reviewing it."
  }
  return "We reviewed your report and closed it. Thank you for helping keep Blumi safe."
}

function readIdempotencyKey(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined
}
