import type { FastifyInstance } from "fastify"
import {
  authenticatedErrorResponses,
  chatPreferencesUpdateRequestSchema,
  coreApiJsonSchemas,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import {
  ChatReceiptsUnavailableError,
  type ChatReceiptService
} from "../chat/chatReceiptService"
import { resolveProductSession, schemaValidationFailed } from "./routeHelpers"

export interface ChatPreferencesRouteServices {
  authService: AuthService
  chatReceiptService: ChatReceiptService
}

/**
 * Chat privacy settings (2026-10-01), shaped like the notification
 * preferences routes. `available` is false until read receipts are rolled
 * out to the account and migration 070 is applied; the setting then reads
 * as the default (off) and cannot be saved.
 */
export async function registerChatPreferencesRoutes(
  app: FastifyInstance,
  services: ChatPreferencesRouteServices
): Promise<void> {
  const { authService, chatReceiptService } = services

  app.get("/v1/chat-preferences", {
    schema: {
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    return reply.send(await chatReceiptService.getPreferences(resolved.account.userId))
  })

  app.put("/v1/chat-preferences", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: {
      body: coreApiJsonSchemas.chatPreferences,
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const parsed = chatPreferencesUpdateRequestSchema.safeParse(request.body)
    if (!parsed.success || schemaValidationFailed(request)) {
      return reply.code(400).send({ error: "Choose valid chat preferences." })
    }
    try {
      const preferences = await chatReceiptService.savePreferences(
        resolved.account.userId,
        parsed.data
      )
      return reply.send({ preferences, available: true })
    } catch (error) {
      if (!(error instanceof ChatReceiptsUnavailableError)) throw error
      return reply.code(409).send({ code: error.code, error: error.message })
    }
  })
}
