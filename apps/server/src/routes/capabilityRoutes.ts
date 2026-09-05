import type { FastifyInstance } from "fastify"
import {
  authenticatedErrorResponses,
  capabilityResolutionRequestSchema,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { CapabilityService } from "../capabilities/capabilityService"
import { resolveBearerSession } from "./routeHelpers"

export interface CapabilityRouteServices {
  authService: AuthService
  capabilityService: CapabilityService
}

export async function registerCapabilityRoutes(
  app: FastifyInstance,
  services: CapabilityRouteServices
): Promise<void> {
  app.post("/v1/capabilities/resolve", {
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

    const parsed = capabilityResolutionRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Declare valid client capabilities." })
    }

    return reply.send(services.capabilityService.resolve(
      resolved.account.userId,
      parsed.data.declaredCapabilities
    ))
  })
}
