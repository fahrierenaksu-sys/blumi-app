import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"
import type { NotificationPreferences } from "./notificationRepository"

const QUEUED_AT = new Date("2026-10-14T08:00:00.000Z")
const OPEN_PREFERENCES: NotificationPreferences = {
  likesEnabled: true, messagesEnabled: true, matchesEnabled: true, discoveryWatchEnabled: true,
  quietHours: null, quietHoursUtcOffsetMinutes: 0, maxPushesPerHour: 5
}
const matchPush = { title: "A match", body: "Someone matched.", data: { type: "discovery.match", matchId: "match_1" } } as const

async function queuedFixture(providerFailures = 0) {
  const sent: string[] = []
  let failuresLeft = providerFailures
  const service = createNotificationService({
    now: () => QUEUED_AT,
    pushProvider: { async sendPush(token) {
      if (failuresLeft > 0) { failuresLeft -= 1; throw new Error("provider unavailable") }
      sent.push(token)
    } }
  })
  await service.registerDevice("user_a", { platform: "ios", pushToken: "device_token_a" })
  await service.updatePreferences("user_a", OPEN_PREFERENCES)
  const queued = await service.sendPushToUser("user_a", matchPush)
  assert.equal(queued.outcome, "queued")
  const pending = async () => (await service.repository.listPendingDeliveries()).length
  return { service, sent, pending }
}

test("a category turned off after enqueue is not sent and leaves the queue", async () => {
  const { service, sent, pending } = await queuedFixture()
  await service.updatePreferences("user_a", { ...OPEN_PREFERENCES, matchesEnabled: false })

  await service.dispatchDue(QUEUED_AT)

  assert.deepEqual(sent, [])
  assert.equal(await pending(), 0)
})

test("a retry after the category was turned off is dropped instead of sent", async () => {
  const { service, sent, pending } = await queuedFixture(1)
  await service.dispatchDue(QUEUED_AT) // provider fails once; a retry is scheduled
  assert.equal(await pending(), 1)
  await service.updatePreferences("user_a", { ...OPEN_PREFERENCES, matchesEnabled: false })

  await service.dispatchDue(new Date(QUEUED_AT.getTime() + 10 * 60_000))

  assert.deepEqual(sent, [])
  assert.equal(await pending(), 0)
})

test("a retry still sends when the preferences did not change", async () => {
  const { service, sent } = await queuedFixture(1)
  await service.dispatchDue(QUEUED_AT)
  await service.dispatchDue(new Date(QUEUED_AT.getTime() + 10 * 60_000))
  assert.deepEqual(sent, ["device_token_a"])
})

// Quiet hours policy: a push that falls into quiet hours before it is sent is
// dropped, exactly like one that arrives during them at enqueue time.
const QUIET_FROM_9_TO_10 = { startMinute: 9 * 60, endMinute: 10 * 60 }

test("quiet hours that begin after enqueue drop the push at the first quiet minute", async () => {
  const { service, sent, pending } = await queuedFixture()
  await service.updatePreferences("user_a", { ...OPEN_PREFERENCES, quietHours: QUIET_FROM_9_TO_10 })

  await service.dispatchDue(new Date("2026-10-14T09:00:00.000Z"))

  assert.deepEqual(sent, [])
  assert.equal(await pending(), 0)
})

test("the minute before quiet hours begin still sends", async () => {
  const { service, sent } = await queuedFixture()
  await service.updatePreferences("user_a", { ...OPEN_PREFERENCES, quietHours: QUIET_FROM_9_TO_10 })

  await service.dispatchDue(new Date("2026-10-14T08:59:00.000Z"))

  assert.deepEqual(sent, ["device_token_a"])
})

test("the exact minute quiet hours end sends again", async () => {
  const { service, sent } = await queuedFixture()
  await service.updatePreferences("user_a", { ...OPEN_PREFERENCES, quietHours: QUIET_FROM_9_TO_10 })

  await service.dispatchDue(new Date("2026-10-14T10:00:00.000Z"))

  assert.deepEqual(sent, ["device_token_a"])
})
