import type { FastifyInstance } from "fastify"
import {
  authenticatedErrorResponses,
  connectionDecisionRequestSchema,
  coreApiJsonSchemas,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import {
  ConnectionDecisionUnavailableError,
  type ConnectionService
} from "../connections/connectionService"
import type { ConnectionManager } from "../realtime/connectionManager"
import { resolveBearerSession } from "./routeHelpers"

export interface ConnectionRouteServices {
  authService: AuthService
  connectionService?: ConnectionService
  connectionManager: ConnectionManager
}

export async function registerConnectionRoutes(
  app: FastifyInstance,
  services: ConnectionRouteServices
): Promise<void> {
  app.post("/v1/connections/decision", {
    attachValidation: true,
    schema: {
      body: coreApiJsonSchemas.connectionDecision,
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses,
        503: successResponseJsonSchema
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({
      request,
      reply,
      authService: services.authService
    })
    if (!resolved) return
    if (!services.connectionService) {
      return reply.code(503).send({ error: "Connection decisions are temporarily unavailable." })
    }

    const parsed = connectionDecisionRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Choose a valid room decision." })
    }

    try {
      const result = await services.connectionService.decide(resolved.account.userId, {
        miniRoomId: parsed.data.miniRoomId,
        partnerUserId: parsed.data.partnerUserId,
        status: parsed.data.status
      })
      services.connectionManager.sendToUser(resolved.account.userId, {
        type: "connection.decision_recorded",
        payload: result.decision
      })
      if (result.match) {
        services.connectionManager.sendToUsers(result.match.participantUserIds, {
          type: "connection.matched",
          payload: result.match
        })
      }
      return { decision: result.decision, match: result.match }
    } catch (error) {
      if (error instanceof ConnectionDecisionUnavailableError) {
        return reply.code(409).send({ error: "That connection decision is not available." })
      }
      request.log.error({ error }, "Connection decision delivery failed")
      return reply.code(503).send({ error: "Connection decisions are temporarily unavailable." })
    }
  })
}
