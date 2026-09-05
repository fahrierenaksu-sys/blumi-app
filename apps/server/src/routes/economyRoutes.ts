import type { FastifyInstance } from "fastify"
import type { AuthService } from "../auth/authService"
import type { EconomyService } from "../economy/economyService"
import { isPublicRequestError } from "../errors/publicRequestError"
import { isRecord, resolveProductSession } from "./routeHelpers"

export interface EconomyRouteServices {
  authService: AuthService
  economyService: EconomyService
}

export async function registerEconomyRoutes(
  app: FastifyInstance,
  services: EconomyRouteServices
): Promise<void> {
  const { authService, economyService } = services

  app.get("/v1/economy/balance", async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const inventory = await economyService.getInventory(resolved.account.userId)
    return { inventory }
  })

  app.post("/v1/economy/rewards/daily", async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const result = await economyService.claimDailyReward(resolved.account.userId)
    return reply.code(200).send(result)
  })

  app.post("/v1/economy/purchase", async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const body = isRecord(request.body) ? request.body : {}
    const itemId = typeof body.itemId === "string" ? body.itemId : ""
    const type =
      body.type === "avatar" || body.type === "room" ? body.type : null
    if (!type) {
      return reply.code(400).send({ error: "Choose a valid shop category." })
    }

    try {
      const result = type === "avatar"
        ? await economyService.purchaseItem(resolved.account.userId, {
            itemId,
            type,
            avatarBodyId:
              resolved.account.profile.avatar.loadout?.bodyId ??
              resolved.account.profile.avatar.presetId
          })
        : await economyService.purchaseItem(resolved.account.userId, {
            itemId,
            type
          })
      return reply.code(201).send(result)
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({
        error: error.message
      })
    }
  })
}
