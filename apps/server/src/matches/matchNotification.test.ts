import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryMatchRepository, createInMemoryMatchStore, createSeedDiscoverProfiles } from "./matchRepository"
import { createMatchService } from "./matchService"

const TEST_AVATAR = createSeedDiscoverProfiles()[0]!.avatar

test("a first like notifies only its recipient and a new mutual match notifies both people", async () => {
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore([
    profile("user_a", "A"),
    profile("user_b", "B")
  ]))
  const sent: Array<{ userId: string; type?: string }> = []
  const service = createMatchService({
    repository,
    idFactory: () => "match_notification",
    notificationService: {
      sendPushToUser: async (userId, notification) => {
        sent.push({ userId, type: notification.data?.type })
        return { outcome: "queued", deliveryCount: 1 }
      }
    }
  })

  await service.decide("user_a", "user_b", "like")
  assert.deepEqual(sent, [{ userId: "user_b", type: "discovery.like" }])

  await service.decide("user_b", "user_a", "like")
  assert.deepEqual(sent.slice(1).sort((left, right) => left.userId.localeCompare(right.userId)), [
    { userId: "user_a", type: "discovery.match" },
    { userId: "user_b", type: "discovery.match" }
  ])

  await service.decide("user_b", "user_a", "like")
  assert.equal(sent.length, 3)
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
