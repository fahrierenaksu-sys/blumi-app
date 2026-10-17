import type { FastifyInstance, FastifyRequest } from "fastify"
import {
  authenticatedErrorResponses,
  streetResponseSchema,
  streetVisibilityRequestSchema,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import { projectAvatarSelectionForRead, resolveRequestCapabilities } from "../avatar/avatarReadProjection"
import type { CapabilityService } from "../capabilities/capabilityService"
import { StreetUnavailableError, type StreetService } from "../street/streetService"
import { resolveProductSession, schemaValidationFailed } from "./routeHelpers"

export interface StreetRouteServices {
  authService: AuthService
  capabilityService: CapabilityService
  streetService?: StreetService
}

const NOT_FOUND = { error: "Not found." }

const streetVisibilityBodyJsonSchema = {
  type: "object",
  required: ["closed"],
  properties: { closed: { type: "boolean" } },
  additionalProperties: false
}

/**
 * Sokağım (2026-10-17). Both routes answer 404 until the `chat_street`
 * capability is rolled out to the caller and declared by the build, so the
 * street ships dark. Only the caller's own active mutual matches appear; the
 * response carries no ids besides thread ids, no timestamps and no presence.
 */
export async function registerStreetRoutes(app: FastifyInstance, services: StreetRouteServices): Promise<void> {
  const { authService, capabilityService, streetService } = services

  function isStreetOn(request: FastifyRequest, userId: string) {
    const resolution = resolveRequestCapabilities(request, userId, capabilityService)
    return { on: Boolean(streetService) && resolution.capabilities.chat_street, allowV2: resolution.capabilities.avatar_loadout_v2_read }
  }

  app.get("/v1/street", {
    schema: { response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses } }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const flag = isStreetOn(request, resolved.account.userId)
    if (!flag.on || !streetService) return reply.code(404).send(NOT_FOUND)
    try {
      const street = await streetService.read(resolved.account.userId)
      const projected = {
        ...street,
        windows: street.windows.map((window) => ({
          ...window,
          avatar: window.avatar ? projectAvatarSelectionForRead(window.avatar, flag.allowV2) : null
        }))
      }
      request.log.info({ streetWindows: projected.windows.length, streetChanged: projected.windows.filter((window) => window.change).length }, "street.read")
      return reply.send(streetResponseSchema.parse(projected))
    } catch (error) {
      if (error instanceof StreetUnavailableError) return reply.code(404).send(NOT_FOUND)
      throw error
    }
  })

  app.put("/v1/street/visibility", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: {
      body: streetVisibilityBodyJsonSchema,
      response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    if (!isStreetOn(request, resolved.account.userId).on || !streetService) return reply.code(404).send(NOT_FOUND)
    const parsed = streetVisibilityRequestSchema.safeParse(request.body)
    if (!parsed.success || schemaValidationFailed(request)) {
      return reply.code(400).send({ error: "Choose a valid window setting." })
    }
    try {
      await streetService.setWindowClosed(resolved.account.userId, parsed.data.closed)
      return reply.send({ closed: parsed.data.closed })
    } catch (error) {
      if (error instanceof StreetUnavailableError) return reply.code(404).send(NOT_FOUND)
      throw error
    }
  })
}
