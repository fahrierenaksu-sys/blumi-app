import type { FastifyInstance } from "fastify"
import {
  authenticatedErrorResponses,
  coreApiJsonSchemas,
  deviceRegistrationRequestSchema,
  deviceRemovalRequestSchema,
  notificationPreferencesPatchSchema,
  successResponseJsonSchema,
  type NotificationPreferencesPatch
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import type { NotificationService } from "../notifications/notificationService"
import type { NotificationPreferences } from "../notifications/notificationRepository"
import { isPublicRequestError } from "../errors/publicRequestError"
import { resolveProductSession } from "./routeHelpers"

export interface NotificationRouteServices {
  authService: AuthService
  notificationService: NotificationService
}

export async function registerNotificationRoutes(
  app: FastifyInstance,
  services: NotificationRouteServices
): Promise<void> {
  const { authService, notificationService } = services

  app.get("/v1/notification-preferences", {
    schema: {
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const preferences = await notificationService.getPreferences(resolved.account.userId)
    return reply.send({ preferences })
  })

  app.put("/v1/notification-preferences", {
    attachValidation: true,
    schema: {
      body: coreApiJsonSchemas.notificationPreferences,
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const parsed = notificationPreferencesPatchSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Choose valid notification preferences." })
    }
    try {
      const current = await notificationService.getPreferences(resolved.account.userId)
      const preferences = await notificationService.updatePreferences(
        resolved.account.userId,
        mergeNotificationPreferences(current, parsed.data),
        Object.keys(parsed.data) as (keyof NotificationPreferences)[]
      )
      return reply.send({ preferences })
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({ error: error.message })
    }
  })

  app.post("/v1/devices", {
    attachValidation: true,
    schema: {
      body: coreApiJsonSchemas.deviceRegistration,
      response: {
        201: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const parsed = deviceRegistrationRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Choose a valid device platform." })
    }

    try {
      const device = await notificationService.registerDevice(
        resolved.account.userId,
        {
          platform: parsed.data.platform,
          pushToken: parsed.data.pushToken
        }
      )
      return reply.code(201).send({ device })
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({
        error: error.message
      })
    }
  })

  app.delete("/v1/devices", {
    attachValidation: true,
    schema: {
      body: coreApiJsonSchemas.deviceRemoval,
      response: {
        204: { type: "null" },
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const parsed = deviceRemovalRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Choose a valid push token." })
    }

    await notificationService.removeDevice(resolved.account.userId, parsed.data.pushToken)
    return reply.code(204).send()
  })
}

function mergeNotificationPreferences(
  current: NotificationPreferences,
  body: NotificationPreferencesPatch
): NotificationPreferences {
  return {
    likesEnabled: optionalBoolean(body, "likesEnabled", current.likesEnabled),
    messagesEnabled: optionalBoolean(body, "messagesEnabled", current.messagesEnabled),
    matchesEnabled: optionalBoolean(body, "matchesEnabled", current.matchesEnabled),
    discoveryWatchEnabled: optionalBoolean(body, "discoveryWatchEnabled", current.discoveryWatchEnabled),
    quietHours: optionalQuietHours(body, current.quietHours),
    quietHoursTimeZone: body.quietHoursTimeZone === undefined ? current.quietHoursTimeZone : body.quietHoursTimeZone,
    quietHoursUtcOffsetMinutes: optionalInteger(
      body,
      "quietHoursUtcOffsetMinutes",
      current.quietHoursUtcOffsetMinutes
    ),
    maxPushesPerHour: optionalInteger(body, "maxPushesPerHour", current.maxPushesPerHour)
  }
}

function optionalBoolean(
  body: NotificationPreferencesPatch,
  key:
    | "likesEnabled"
    | "messagesEnabled"
    | "matchesEnabled"
    | "discoveryWatchEnabled",
  fallback: boolean
): boolean {
  const value = body[key]
  return value === undefined ? fallback : value
}

function optionalInteger(
  body: NotificationPreferencesPatch,
  key: "quietHoursUtcOffsetMinutes" | "maxPushesPerHour",
  fallback: number
): number {
  const value = body[key]
  return value === undefined ? fallback : value
}

function optionalQuietHours(
  body: NotificationPreferencesPatch,
  fallback: NotificationPreferences["quietHours"]
): NotificationPreferences["quietHours"] {
  return body.quietHours === undefined ? fallback : body.quietHours
}
