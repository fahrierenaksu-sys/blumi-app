import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notificationRepository"

test("IANA quiet hours follow DST and midnight instead of a frozen offset", async () => {
  const service = createNotificationService()
  await service.updatePreferences("a", { ...DEFAULT_NOTIFICATION_PREFERENCES,
    quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 }, quietHoursTimeZone: "Europe/Berlin", quietHoursUtcOffsetMinutes: 60 })
  for (const [iso, expected] of [["2026-01-05T20:30:00Z", "queued"], ["2026-07-05T20:30:00Z", "quiet_hours"],
    ["2026-07-05T22:00:00Z", "quiet_hours"], ["2026-07-05T05:00:00Z", "queued"]] as const) {
    const result = await service.repository.claimPolicyDecision({ userId: "a", notificationType: "message", dedupeKey: iso, now: new Date(iso) })
    assert.equal(result.reason, expected)
  }
  await assert.rejects(service.updatePreferences("a", { ...DEFAULT_NOTIFICATION_PREFERENCES, quietHoursTimeZone: "invalid/zone" }), /time zone/i)
})
