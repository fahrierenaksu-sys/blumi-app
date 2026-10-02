import type { FastifyInstance } from "fastify"
import {
  MAX_NOTIFICATION_PORTRAIT_TOKEN_LENGTH,
  NOTIFICATION_PORTRAIT_PATH_PREFIX
} from "../notifications/notificationPortraitLinks"
import type { NotificationPortraitService } from "../notifications/notificationPortraitService"

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * The sender picture an iOS notification service extension downloads. Public
 * (the extension has no session); the sealed token is the authorization and
 * names no user. A wildcard route because a sealed token is longer than the
 * router's 100-character limit for a path parameter.
 */
export async function registerNotificationPortraitRoutes(
  app: FastifyInstance,
  services: { notificationPortraits?: NotificationPortraitService }
): Promise<void> {
  const portraits = services.notificationPortraits
  if (!portraits) return
  app.get<{ Params: { "*": string } }>(
    `${NOTIFICATION_PORTRAIT_PATH_PREFIX}*`,
    {
      config: { apiAuth: "public", rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        response: {
          200: { content: { "image/png": { schema: { type: "string", format: "binary" } } } },
          404: { type: "null" }
        }
      }
    },
    async (request, reply) => {
      const token = request.params["*"]
      const portrait = typeof token === "string" &&
        token.length <= MAX_NOTIFICATION_PORTRAIT_TOKEN_LENGTH &&
        TOKEN_PATTERN.test(token)
        ? await portraits.render(token, new Date())
        : null
      if (!portrait) {
        reply.header("cache-control", "no-store")
        return reply.code(404).send()
      }
      return reply
        .header("cache-control", "private, max-age=86400")
        .type(portrait.mimeType)
        .send(portrait.body)
    }
  )
}
