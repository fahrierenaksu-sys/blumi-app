import type { FastifyInstance } from "fastify"
import type { AuthService } from "../auth/authService"
import { isPublicRequestError } from "../errors/publicRequestError"
import type { ReferralService } from "../referrals/referralService"
import { isRecord, resolveBearerSession, resolveProductSession } from "./routeHelpers"

export interface ReferralRouteServices {
  authService: AuthService
  referralService: ReferralService
}

export async function registerReferralRoutes(
  app: FastifyInstance,
  services: ReferralRouteServices
): Promise<void> {
  app.post(
    "/v1/referrals/invite",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const resolved = await resolveProductSession({ request, reply, authService: services.authService })
      if (!resolved) return
      return reply.code(200).send({
        invite: await services.referralService.issueInvite(resolved.account.userId)
      })
    }
  )

  app.post(
    "/v1/referrals/claim",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const resolved = await resolveBearerSession({ request, reply, authService: services.authService })
      if (!resolved) return
      const body = isRecord(request.body) ? request.body : {}
      const code = typeof body.code === "string" ? body.code : ""
      try {
        await services.referralService.claimInvite(resolved.account.userId, code)
        // The outcome is deliberately not disclosed: it would reveal invite/link state.
        return reply.code(204).send()
      } catch (error) {
        if (!isPublicRequestError(error)) throw error
        return reply.code(400).send({ error: error.message })
      }
    }
  )
}
