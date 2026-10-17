import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationRelevanceCheck } from "./notificationDeliveryContext"
import type { NotificationPreferences } from "./notificationRepository"
import { createNotificationService } from "./notificationService"
import { resolvePushCopy, toOutgoingPushNotification } from "./pushMessagePolicy"

const NOW = new Date("2026-10-16T08:00:00.000Z")
const OPEN: NotificationPreferences = {
  likesEnabled: true, messagesEnabled: true, matchesEnabled: true, discoveryWatchEnabled: true,
  quietHours: null, quietHoursUtcOffsetMinutes: 0, maxPushesPerHour: 5
}
const teaser = (type: "cat.trip_owner" | "cat.trip_host", tripId = "trip_1") => ({
  title: "x", body: "y", data: { type, tripId }
})

test("a cat teaser is held in the outbox until its moment and then sent", async () => {
  const sent: string[] = []
  let clock = NOW
  const service = createNotificationService({
    now: () => clock,
    pushProvider: { async sendPush(token) { sent.push(token) } }
  })
  await service.registerDevice("owner", { platform: "ios", pushToken: "device_token_owner" })
  await service.updatePreferences("owner", OPEN)
  const later = new Date(NOW.getTime() + 3 * 60 * 60_000)
  const queued = await service.sendPushToUser("owner", teaser("cat.trip_owner"), undefined, { availableAt: later })
  assert.equal(queued.outcome, "queued")

  await service.dispatchDue(NOW)
  assert.deepEqual(sent, [], "not before its moment")
  clock = later
  await service.dispatchDue(later)
  assert.deepEqual(sent, ["device_token_owner"])
})

test("a cat teaser queued twice for one trip is sent once", async () => {
  const service = createNotificationService({ now: () => NOW, pushProvider: { async sendPush() {} } })
  await service.registerDevice("owner", { platform: "ios", pushToken: "device_token_owner" })
  await service.updatePreferences("owner", OPEN)
  assert.equal((await service.sendPushToUser("owner", teaser("cat.trip_owner"))).outcome, "queued")
  assert.equal((await service.sendPushToUser("owner", teaser("cat.trip_owner"))).outcome, "duplicate")
})

test("a cat teaser carries the trip id and the recipient only, and its copy names no one", () => {
  for (const locale of ["tr", "en"] as const) {
    for (const type of ["cat.trip_owner", "cat.trip_host"] as const) {
      assert.ok(resolvePushCopy(type, locale))
      const outgoing = toOutgoingPushNotification({ userId: "recipient", notification: teaser(type), locale })
      assert.deepEqual(outgoing.data, { type, tripId: "trip_1", recipientUserId: "recipient" })
    }
  }
})

test("a teaser is dropped once its trip is no longer current", async () => {
  const current = new Set(["owner:trip_1"])
  const check = createNotificationRelevanceCheck({
    isUserAllowed: async () => true,
    hasBlockBetween: async () => false,
    findThread: async () => null,
    findRoomInvite: async () => null,
    isCatTripTeaserCurrent: async (userId, tripId, role) => current.has(`${userId}:${tripId}`) && role === "owner"
  })
  const delivery = (type: "cat.trip_owner" | "cat.trip_host") => ({ userId: "owner", notification: teaser(type) })
  assert.equal(await check(delivery("cat.trip_owner"), NOW), true)
  assert.equal(await check(delivery("cat.trip_host"), NOW), false)
  current.clear()
  assert.equal(await check(delivery("cat.trip_owner"), NOW), false)
})

test("without the trip check wired a cat teaser is never sent (fail closed)", async () => {
  const check = createNotificationRelevanceCheck({
    isUserAllowed: async () => true,
    hasBlockBetween: async () => false,
    findThread: async () => null,
    findRoomInvite: async () => null
  })
  assert.equal(await check({ userId: "owner", notification: teaser("cat.trip_owner") }, NOW), false)
})
