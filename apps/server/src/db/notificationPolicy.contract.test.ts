import assert from "node:assert/strict"
import { createInMemoryNotificationRepository, DEFAULT_NOTIFICATION_PREFERENCES, type NotificationRepository,
  type NotificationValueType } from "../notifications/notificationRepository"
import { createPostgresNotificationRepository } from "./postgresNotificationRepository"
import { runRepositoryContract } from "./repositoryContract"
import { createNotificationService } from "../notifications/notificationService"

runRepositoryContract<NotificationRepository>({
  name: "notification policy", databaseUrl: process.env.DATABASE_URL,
  factories: { inMemory: createInMemoryNotificationRepository, postgres: createPostgresNotificationRepository },
  cases: {
    "chat bypasses the total cap without consuming it; dedupe, quiet hours and opt-out still apply": async (backend) => {
      for (const path of ["decision", "outbox"] as const) {
        const userId = backend.id(path)
        await backend.ensureUsers(userId)
        const now = new Date("2026-10-01T10:00:00Z")
        const service = createNotificationService({ repository: backend.repository, now: () => now })
        await service.registerDevice(userId, { platform: "ios", pushToken: backend.id("token") })
        await service.updatePreferences(userId, { ...DEFAULT_NOTIFICATION_PREFERENCES, maxPushesPerHour: 1 })
        const claim = async (type: NotificationValueType, key: string) => {
          if (path === "decision") return (await backend.repository.claimPolicyDecision({ userId,
            notificationType: type, dedupeKey: key, now })).reason
          return (await service.sendPushToUser(userId, { title: "Blumi", body: "Update",
            data: type === "message" ? { type: "chat.message", messageId: key }
              : { type: "discovery.match", matchId: key } })).outcome
        }
        assert.equal(await claim("message", "one"), "queued")
        assert.equal(await claim("message", "one"), "duplicate")
        assert.equal(await claim("match", "match-one"), "queued", "chat does not consume the other budget")
        assert.equal(await claim("match", "match-two"), "frequency_cap")
        for (let i = 0; i < 8; i++) assert.equal(await claim("message", `burst-${i}`), "queued")
        await service.updatePreferences(userId, { ...DEFAULT_NOTIFICATION_PREFERENCES, maxPushesPerHour: 1,
          quietHours: { startMinute: 9 * 60, endMinute: 11 * 60 }, quietHoursTimeZone: "UTC" })
        assert.equal(await claim("message", "quiet"), "quiet_hours")
        await service.updatePreferences(userId, { ...DEFAULT_NOTIFICATION_PREFERENCES, messagesEnabled: false })
        assert.equal(await claim("message", "disabled"), "disabled")
      }
    }
  }
})
