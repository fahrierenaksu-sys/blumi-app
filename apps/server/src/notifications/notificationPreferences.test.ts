import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"

test("notification preferences are per-account, validated, and never mutate another account", async () => {
  const service = createNotificationService()

  assert.deepEqual(await service.getPreferences("user_a"), {
    likesEnabled: true,
    messagesEnabled: true,
    matchesEnabled: true,
    discoveryWatchEnabled: true,
    quietHours: null,
    quietHoursUtcOffsetMinutes: 0,
    maxPushesPerHour: 6
  })

  const saved = await service.updatePreferences("user_a", {
    likesEnabled: false,
    messagesEnabled: true,
    matchesEnabled: false,
    discoveryWatchEnabled: true,
    quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
    quietHoursUtcOffsetMinutes: 180,
    maxPushesPerHour: 3
  })
  assert.equal(saved.likesEnabled, false)
  assert.deepEqual(saved.quietHours, { startMinute: 22 * 60, endMinute: 7 * 60 })
  assert.equal((await service.getPreferences("user_b")).maxPushesPerHour, 6)

  await assert.rejects(
    () => service.updatePreferences("user_a", {
      ...saved,
      quietHours: { startMinute: 90, endMinute: 90 }
    }),
    /quiet hours/i
  )
  await assert.rejects(
    () => service.updatePreferences("user_a", {
      ...saved,
      maxPushesPerHour: 0
    }),
    /frequency/i
  )
})
