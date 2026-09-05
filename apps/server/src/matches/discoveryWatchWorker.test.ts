import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryMatchRepository, createInMemoryMatchStore, createSeedDiscoverProfiles } from "./matchRepository"
import { createMatchService } from "./matchService"
import { runDiscoveryWatchCycle } from "./discoveryWatchWorker"
import type { DiscoveryWatchRecord } from "@blumi/contracts"
import type { DiscoveryWatchClaim } from "./matchRepository"

const TEST_AVATAR = createSeedDiscoverProfiles()[0]!.avatar

test("Discovery Watch claims one eligible global candidate, notifies once, then completes", async () => {
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([
      {
        userId: "watcher",
        displayName: "Watcher",
        age: 28,
        gender: "woman",
        distanceLabel: "",
        vibeTags: ["coffee"],
        avatar: TEST_AVATAR,
        avatarPresetId: "default"
      },
      {
        userId: "new_global_match",
        displayName: "Ada",
        age: 28,
        gender: "woman",
        distanceLabel: "",
        vibeTags: ["coffee"],
        avatar: TEST_AVATAR,
        avatarPresetId: "default"
      }
    ]))
  })
  await matchService.activateDiscoveryWatch("watcher", {
    ageMin: 18,
    ageMax: 99,
    genders: ["woman"],
    vibes: ["coffee"]
  }, new Date("2026-07-22T10:00:00.000Z"))

  const notifications: Array<{ userId: string; type?: string }> = []
  const delivered = await runDiscoveryWatchCycle({
    matchService,
    safetyService: { hasBlockBetween: async () => false },
    notificationService: {
      sendPushToUser: async (userId, notification, watch) => {
        await watch!.authorization!.enqueue(new Date("2026-07-22T10:01:00.000Z"), async () => {
          notifications.push({ userId, type: notification.data?.type })
          return { allowed: true, reason: "queued", deliveryCount: 1 }
        }, () => {})
        return { outcome: "queued", deliveryCount: 1 }
      }
    },
    now: new Date("2026-07-22T10:01:00.000Z")
  })

  assert.equal(delivered, 1)
  assert.deepEqual(notifications, [{ userId: "watcher", type: "discovery.watch_match" }])
  assert.equal(await matchService.getDiscoveryWatch("watcher"), null)
  assert.equal(await runDiscoveryWatchCycle({
    matchService,
    safetyService: { hasBlockBetween: async () => false },
    notificationService: { sendPushToUser: async () => ({ outcome: "queued", deliveryCount: 1 }) },
    now: new Date("2026-07-22T10:02:00.000Z")
  }), 0)
})

test("Discovery Watch restores the watch when no device can receive its notification", async () => {
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([
      {
        userId: "watcher",
        displayName: "Watcher",
        age: 28,
        gender: "woman",
        distanceLabel: "",
        vibeTags: ["coffee"],
        avatar: TEST_AVATAR,
        avatarPresetId: "default"
      },
      {
        userId: "candidate",
        displayName: "Ada",
        age: 28,
        gender: "woman",
        distanceLabel: "",
        vibeTags: ["coffee"],
        avatar: TEST_AVATAR,
        avatarPresetId: "default"
      }
    ]))
  })
  await matchService.activateDiscoveryWatch("watcher", {
    ageMin: 18, ageMax: 99, genders: ["woman"], vibes: ["coffee"]
  }, new Date("2026-07-22T10:00:00.000Z"))

  const delivered = await runDiscoveryWatchCycle({
    matchService,
    safetyService: { hasBlockBetween: async () => false },
    notificationService: {
      sendPushToUser: async () => ({ outcome: "no_device", deliveryCount: 0 })
    },
    now: new Date("2026-07-22T10:01:00.000Z"),
    limit: 1
  })

  assert.equal(delivered, 0)
  assert.equal(
    (await matchService.getDiscoveryWatch(
      "watcher",
      new Date("2026-07-22T10:01:00.000Z")
    ))?.userId,
    "watcher"
  )
})

test("Discovery Watch stops the cycle after a suppressed delivery restores its watch", async () => {
  const watch: DiscoveryWatchClaim = {
    generation: "watch-test",
    claimToken: "claim-test",
    userId: "watcher",
    status: "active",
    preferences: { ageMin: 18, ageMax: 99, genders: ["woman"], vibes: ["coffee"] },
    updatedAt: "2026-07-22T10:00:00.000Z",
    expiresAt: "2026-07-29T10:00:00.000Z"
  }
  let claimCount = 0
  let restoreCount = 0

  await runDiscoveryWatchCycle({
    matchService: {
      completeDiscoveryWatch: async () => true,
      isDiscoveryWatchClaimCurrent: async () => true,
      claimNextDiscoveryWatch: async () => {
        claimCount += 1
        return watch
      },
      restoreDiscoveryWatch: async (restoredWatch) => {
        restoreCount += 1
        return restoredWatch
      },
      listDiscoveryPage: async () => [{ userId: "candidate" }] as never
    },
    safetyService: { hasBlockBetween: async () => false },
    notificationService: { sendPushToUser: async () => ({ outcome: "quiet_hours", deliveryCount: 0 }) },
    now: new Date("2026-07-22T10:01:00.000Z"),
    limit: 3
  })

  assert.equal(claimCount, 1)
  assert.equal(restoreCount, 1)
})

test("a restored suppressed watch yields the next cycle to later watches", async () => {
  const watches = new Map<string, DiscoveryWatchRecord>([
    ["watcher_a", {
      userId: "watcher_a",
      status: "active",
      preferences: { ageMin: 18, ageMax: 99, genders: ["woman"], vibes: ["coffee"] },
      updatedAt: "2026-07-22T10:00:00.000Z",
      expiresAt: "2026-07-29T10:00:00.000Z"
    }],
    ["watcher_b", {
      userId: "watcher_b",
      status: "active",
      preferences: { ageMin: 18, ageMax: 99, genders: ["woman"], vibes: ["coffee"] },
      updatedAt: "2026-07-22T10:01:00.000Z",
      expiresAt: "2026-07-29T10:00:00.000Z"
    }]
  ])
  const sent: string[] = []
  const matchService = {
    claimNextDiscoveryWatch: async () => {
      const next = [...watches.values()]
        .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))[0]
      if (!next) return null
      watches.delete(next.userId)
      return { ...next, generation: `generation-${next.userId}`, claimToken: `claim-${next.userId}` }
    },
    restoreDiscoveryWatch: async (watch: DiscoveryWatchClaim) => {
      watches.set(watch.userId, watch)
      return watch
    },
    completeDiscoveryWatch: async () => true,
    isDiscoveryWatchClaimCurrent: async () => true,
    listDiscoveryPage: async () => [{ userId: "candidate" }] as never
  }
  const notificationService = {
    sendPushToUser: async (userId: string) => {
      if (userId === "watcher_a") return { outcome: "no_device" as const, deliveryCount: 0 }
      sent.push(userId)
      return { outcome: "queued" as const, deliveryCount: 1 }
    }
  }

  await runDiscoveryWatchCycle({
    matchService,
    safetyService: { hasBlockBetween: async () => false },
    notificationService,
    now: new Date("2026-07-22T10:02:00.000Z"),
    limit: 2
  })
  await runDiscoveryWatchCycle({
    matchService,
    safetyService: { hasBlockBetween: async () => false },
    notificationService,
    now: new Date("2026-07-22T10:03:00.000Z"),
    limit: 2
  })

  assert.deepEqual(sent, ["watcher_b"])
})

test("Discovery Watch scans past a blocked first page before restoring the watch", async () => {
  const watch: DiscoveryWatchClaim = {
    generation: "watch-test",
    claimToken: "claim-test",
    userId: "watcher",
    status: "active",
    preferences: { ageMin: 18, ageMax: 99, genders: ["woman"], vibes: ["coffee"] },
    updatedAt: "2026-07-22T10:00:00.000Z",
    expiresAt: "2026-07-29T10:00:00.000Z"
  }
  const pages: number[] = []
  const restored: DiscoveryWatchRecord[] = []
  let claimed = false

  const delivered = await runDiscoveryWatchCycle({
    matchService: {
      completeDiscoveryWatch: async () => true,
      isDiscoveryWatchClaimCurrent: async () => true,
      claimNextDiscoveryWatch: async () => {
        if (claimed) return null
        claimed = true
        return watch
      },
      restoreDiscoveryWatch: async (restoredWatch) => {
        restored.push(restoredWatch)
        return restoredWatch
      },
      listDiscoveryPage: async (_userId, _filters, page) => {
        pages.push(page.offset)
        if (page.offset === 0) {
          return Array.from({ length: 24 }, (_, index) => ({ userId: `blocked_${index}` })) as never
        }
        return [{ userId: "eligible_candidate" }] as never
      }
    },
    safetyService: { hasBlockBetween: async (_watcherId, candidateId) => candidateId.startsWith("blocked_") },
    notificationService: { sendPushToUser: async () => ({ outcome: "queued", deliveryCount: 1 }) },
    now: new Date("2026-07-22T10:01:00.000Z"),
    limit: 1
  })

  assert.equal(delivered, 1)
  assert.deepEqual(pages, [0, 24])
  assert.deepEqual(restored, [])
})

test("Discovery Watch batches safety checks for each candidate page", async () => {
  const watch: DiscoveryWatchClaim = {
    generation: "watch-test",
    claimToken: "claim-test",
    userId: "watcher",
    status: "active",
    preferences: { ageMin: 18, ageMax: 99, genders: [], vibes: [] },
    updatedAt: "2026-07-22T10:00:00.000Z",
    expiresAt: "2026-07-29T10:00:00.000Z"
  }
  let claimed = false
  const batchCalls: string[][] = []

  const delivered = await runDiscoveryWatchCycle({
    matchService: {
      completeDiscoveryWatch: async () => true,
      isDiscoveryWatchClaimCurrent: async () => true,
      claimNextDiscoveryWatch: async () => {
        if (claimed) return null
        claimed = true
        return watch
      },
      restoreDiscoveryWatch: async (restoredWatch) => restoredWatch,
      listDiscoveryPage: async () => [
        { userId: "blocked" },
        { userId: "allowed" }
      ] as never
    },
    safetyService: {
      hasBlockBetween: async () => {
        throw new Error("per-candidate block lookup must not run")
      },
      listBlockedUserIdsBetween: async (_watcherId, candidateIds) => {
        batchCalls.push([...candidateIds])
        return ["blocked"]
      }
    },
    notificationService: {
      sendPushToUser: async () => ({ outcome: "queued", deliveryCount: 1 })
    },
    limit: 1
  })

  assert.equal(delivered, 1)
  assert.deepEqual(batchCalls, [["blocked", "allowed"]])
})
