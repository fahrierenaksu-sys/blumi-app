import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryMatchRepository, createInMemoryMatchStore, createSeedDiscoverProfiles } from "./matchRepository"
import { createMatchService } from "./matchService"
import { createNotificationService } from "../notifications/notificationService"

const TEST_AVATAR = createSeedDiscoverProfiles()[0]!.avatar

test("a first like notifies only its recipient and a new mutual match notifies both people", async () => {
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore([
    profile("user_a", "A"),
    profile("user_b", "B")
  ]))
  const sent: Array<{ userId: string; type?: string; partnerUserId?: string }> = []
  const service = createMatchService({
    repository,
    idFactory: () => "match_notification",
    notificationService: {
      sendPushToUser: async (userId, notification) => {
        sent.push({
          userId,
          type: notification.data?.type,
          ...(notification.data?.partnerUserId ? { partnerUserId: notification.data.partnerUserId } : {})
        })
        return { outcome: "queued", deliveryCount: 1 }
      }
    }
  })

  await service.decide("user_a", "user_b", "like")
  assert.deepEqual(sent, [{ userId: "user_b", type: "discovery.like" }])

  await service.decide("user_b", "user_a", "like")
  // The partner id stays server-side: it lets a later block cancel a queued
  // push and is removed from the device payload.
  assert.deepEqual(sent.slice(1).sort((left, right) => left.userId.localeCompare(right.userId)), [
    { userId: "user_a", type: "discovery.match", partnerUserId: "user_b" },
    { userId: "user_b", type: "discovery.match", partnerUserId: "user_a" }
  ])

  await service.decide("user_b", "user_a", "like")
  assert.equal(sent.length, 3)
})

test("a like push stays anonymous: its payload never names the person who liked", async () => {
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore([
    profile("user_a", "A"), profile("user_b", "B"), profile("user_c", "C")
  ]))
  const payloads: Array<Record<string, string> | undefined> = []
  const service = createMatchService({
    repository,
    notificationService: {
      sendPushToUser: async (_userId, notification) => {
        payloads.push(notification.data)
        return { outcome: "queued", deliveryCount: 1 }
      }
    }
  })

  await service.decide("user_a", "user_b", "like")
  await service.decide("user_c", "user_b", "like")

  // The copy says "Someone likes your vibe"; the device payload must not
  // reveal who (it reached the recipient's phone as sourceUserId).
  assert.equal(payloads.length, 2)
  for (const data of payloads) {
    assert.equal(data?.type, "discovery.like")
    assert.equal(data?.sourceUserId, undefined)
    assert.ok(!Object.values(data ?? {}).some((value) => /user_[ac]/.test(value)), JSON.stringify(data))
    assert.match(data?.likeId ?? "", /^like_[0-9a-f-]{36}$/)
  }
  // Each like keeps its own delivery identity (one push per like, as before).
  assert.notEqual(payloads[0]?.likeId, payloads[1]?.likeId)

  // The push policy dedupes on that identity: two people's likes both queue,
  // a replay of one like does not.
  const notifications = createNotificationService({ now: () => new Date("2026-09-30T10:00:00.000Z") })
  await notifications.registerDevice("user_b", { platform: "ios", pushToken: "token_b" })
  const like = (data: Record<string, string> | undefined) => notifications.sendPushToUser("user_b", {
    title: "Someone likes your vibe", body: "Open Blumi to see where this could go.", data
  })
  assert.equal((await like(payloads[0])).outcome, "queued")
  assert.equal((await like(payloads[1])).outcome, "queued")
  assert.notEqual((await like(payloads[0])).outcome, "queued")
})

test("notification failure never changes a persisted like or match response", async () => {
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore([
    profile("user_a", "A"), profile("user_b", "B")
  ]))
  const failedKinds: string[] = []
  const service = createMatchService({
    repository,
    idFactory: () => "match_push_failure",
    notificationService: {
      sendPushToUser: async () => { throw new Error("push queue unavailable") }
    },
    reportSideEffectFailure: (kind) => { failedKinds.push(kind) }
  })
  assert.equal((await service.decide("user_a", "user_b", "like")).matched, false)
  assert.equal((await service.decide("user_b", "user_a", "like")).match?.matchId, "match_push_failure")
  assert.deepEqual(failedKinds, ["notification", "notification"])
})

function profile(userId: string, displayName: string) {
  return {
    userId,
    displayName,
    age: 28,
    gender: "woman",
    distanceLabel: "",
    vibeTags: ["coffee"],
    avatar: TEST_AVATAR,
    avatarPresetId: "default"
  }
}
