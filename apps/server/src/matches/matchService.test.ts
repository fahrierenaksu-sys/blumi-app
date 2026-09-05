import assert from "node:assert/strict"
import test from "node:test"
import type { DiscoveryFilters } from "@blumi/contracts"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore,
  createSeedDiscoverProfiles
} from "./matchRepository"
import {
  createMatchService,
  DiscoveryDecisionQuotaExceededError
} from "./matchService"
import { createEconomyService } from "../economy/economyService"

const TEST_AVATAR = createSeedDiscoverProfiles()[0]!.avatar

test("seed discovery profiles do not share nested avatar state", () => {
  const profiles = createSeedDiscoverProfiles()

  profiles[0]!.avatar.loadout.accessoryIds.push(
    "avatar_v2_accessory_golden_heart_locket"
  )

  assert.deepEqual(profiles[1]!.avatar.loadout.accessoryIds, [])
})

test("QA discovery seed has a varied full deck instead of three repeated profiles", () => {
  const profiles = createSeedDiscoverProfiles()
  const ids = new Set(profiles.map((profile) => profile.userId))
  const genders = new Set(profiles.map((profile) => profile.gender))
  const names = new Set(profiles.map((profile) => profile.displayName))

  assert.ok(profiles.length >= 12)
  assert.equal(ids.size, profiles.length)
  assert.equal(names.size, profiles.length)
  assert.ok(genders.has("woman"))
  assert.ok(genders.has("man"))
  assert.ok(genders.has("non-binary"))
})

test("discovery excludes the current user", async () => {
  const service = createMatchService({
    repository: createInMemoryMatchRepository(
      createInMemoryMatchStore([
        {
          userId: "current_user",
          displayName: "Current User",
          age: 25,
          gender: "woman",
          distanceLabel: "Here",
          vibeTags: ["coffee"],
          avatar: TEST_AVATAR,
          avatarPresetId: "default"
        },
        {
          userId: "discover_defne",
          displayName: "Defne",
          age: 24,
          gender: "woman",
          distanceLabel: "3 km away",
          vibeTags: ["slow burn"],
          avatar: TEST_AVATAR,
          avatarPresetId: "blonde"
        }
      ])
    )
  })

  const profiles = await service.listDiscovery("current_user", {
    ageMin: 18,
    ageMax: 99,
    genders: [],
    vibes: []
  })
  assert.deepEqual(
    profiles.map((profile) => profile.userId),
    ["discover_defne"]
  )
})

test("discovery never surfaces a legacy gender profile, including the unfiltered audience", async () => {
  const service = createMatchService({
    repository: createInMemoryMatchRepository(
      createInMemoryMatchStore([
        {
          userId: "discover_woman",
          displayName: "Ada",
          age: 24,
          gender: "woman",
          distanceLabel: "",
          vibeTags: ["coffee"],
          avatar: TEST_AVATAR,
          avatarPresetId: "default"
        },
        {
          userId: "legacy_profile",
          displayName: "Deniz",
          age: 25,
          gender: "non-binary",
          distanceLabel: "",
          vibeTags: ["coffee"],
          avatar: TEST_AVATAR,
          avatarPresetId: "default"
        }
      ])
    )
  })

  const filters: DiscoveryFilters = {
    ageMin: 18,
    ageMax: 99,
    genders: [],
    vibes: []
  }
  const visible = await service.listDiscovery("current_user", filters)
  assert.deepEqual(visible.map((profile) => profile.userId), ["discover_woman"])
  assert.equal(await service.findProfile("legacy_profile"), null)
})

test("discovery filters by age, explicit gender preferences, and any matching vibe", async () => {
  const service = createMatchService({
    repository: createInMemoryMatchRepository(
      createInMemoryMatchStore([
        {
          userId: "woman_coffee",
          displayName: "Ada",
          age: 29,
          gender: "woman",
          distanceLabel: "",
          vibeTags: ["Coffee Dates", "films"],
          avatar: TEST_AVATAR,
          avatarPresetId: "default"
        },
        {
          userId: "man_coffee",
          displayName: "Mert",
          age: 29,
          gender: "man",
          distanceLabel: "",
          vibeTags: ["coffee dates"],
          avatar: TEST_AVATAR,
          avatarPresetId: "default"
        },
        {
          userId: "woman_outside_age",
          displayName: "Ece",
          age: 41,
          gender: "woman",
          distanceLabel: "",
          vibeTags: ["coffee dates"],
          avatar: TEST_AVATAR,
          avatarPresetId: "default"
        }
      ])
    )
  })

  const profiles = await service.listDiscovery("current_user", {
    ageMin: 24,
    ageMax: 35,
    genders: ["woman"],
    vibes: ["coffee dates"]
  })

  assert.deepEqual(profiles.map((profile) => profile.userId), ["woman_coffee"])
})

test("linked discovery capability keeps a profile visible while enforcing both sides' persisted preferences", async () => {
  const store = createInMemoryMatchStore([
    {
      userId: "linked_target",
      displayName: "Mert",
      age: 26,
      gender: "man",
      distanceLabel: "",
      vibeTags: ["coffee"],
      avatar: TEST_AVATAR,
      avatarPresetId: "default"
    }
  ])
  store.targetDiscoveryGenders.set("linked_target", ["man"])
  const service = createMatchService({ repository: createInMemoryMatchRepository(store) })
  const filters: DiscoveryFilters = {
    ageMin: 24,
    ageMax: 30,
    genders: ["man"],
    vibes: ["coffee"]
  }

  const viewOnly = await service.findProfileForViewer(
    "viewer",
    "linked_target",
    filters,
    "woman"
  )
  assert.equal(viewOnly?.profile.userId, "linked_target")
  assert.deepEqual(viewOnly?.decision, { capability: "view-only" })

  const eligible = await service.findProfileForViewer(
    "viewer",
    "linked_target",
    filters,
    "man"
  )
  assert.deepEqual(eligible?.decision, { capability: "mutual-like" })

  await assert.rejects(
    () => service.decideEligible("viewer", "linked_target", "like", filters, "woman"),
    /view-only/
  )
})

test("pass records a decision without creating a match", async () => {
  const service = createMatchService({
    repository: createInMemoryMatchRepository(),
    idFactory: () => "match_fixed"
  })

  const result = await service.decide(
    "current_user",
    "discover_defne",
    "pass",
    new Date("2026-06-26T12:00:00.000Z")
  )

  assert.equal(result.decision.decision, "pass")
  assert.equal(result.matched, false)
  assert.equal(result.match, null)
  assert.equal(result.quota.remaining, 9)
})

test("Discovery accepts ten persisted decisions per UTC day, dedupes retries, and resets at UTC midnight", async () => {
  const profiles = createSeedDiscoverProfiles().map((profile) => ({
    ...profile,
    gender: "woman"
  }))
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
  const service = createMatchService({ repository })
  const day = new Date("2026-07-22T12:00:00.000Z")

  for (const profile of profiles.slice(0, 10)) {
    const result = await service.decide("current_user", profile.userId, "pass", day)
    assert.equal(result.quota.remaining, 9 - profiles.indexOf(profile))
  }

  const retry = await service.decide("current_user", profiles[9]!.userId, "pass", day)
  assert.equal(retry.decision.toUserId, profiles[9]!.userId)
  assert.equal(retry.quota.used, 10)
  assert.equal(retry.quota.remaining, 0)

  await assert.rejects(
    () => service.decide("current_user", profiles[10]!.userId, "like", day),
    (error: unknown) => error instanceof DiscoveryDecisionQuotaExceededError &&
      error.quota.remaining === 0 &&
      error.quota.rewardedAd.available === false
  )

  const afterUtcReset = await service.decide(
    "current_user",
    profiles[10]!.userId,
    "like",
    new Date("2026-07-23T00:00:00.000Z")
  )
  assert.equal(afterUtcReset.quota.used, 1)
  assert.equal(afterUtcReset.quota.remaining, 9)
})

test("concurrent decisions cannot overspend the in-memory quota boundary", async () => {
  const profiles = createSeedDiscoverProfiles().map((profile) => ({
    ...profile,
    gender: "woman"
  }))
  const service = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
  })
  const settled = await Promise.allSettled(profiles.slice(0, 12).map((profile) =>
    service.decide("current_user", profile.userId, "pass", new Date("2026-07-22T12:00:00.000Z"))
  ))
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 10)
  assert.equal(settled.filter((result) => result.status === "rejected").length, 2)
})

test("an expired pass can be reconsidered as one new quota decision", async () => {
  const profiles = createSeedDiscoverProfiles()
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
  const target = profiles[0]!
  const now = new Date("2026-07-22T12:00:00.000Z")
  await repository.saveDecision({
    fromUserId: "current_user",
    toUserId: target.userId,
    decision: "pass",
    decidedAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString()
  })
  await repository.saveDecision({
    fromUserId: target.userId,
    toUserId: "current_user",
    decision: "like",
    decidedAt: now.toISOString()
  })

  const result = await createMatchService({ repository, idFactory: () => "resurfaced_match" })
    .decide("current_user", target.userId, "like", now)

  assert.equal(result.decision.decision, "like")
  assert.equal(result.quota.used, 1)
  assert.equal(result.matched, true)
  assert.equal(result.match?.matchId, "resurfaced_match")
})

test("an expired pass can be passed again once and refreshes its decision timestamp", async () => {
  const profiles = createSeedDiscoverProfiles()
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
  const target = profiles[0]!
  const now = new Date("2026-07-22T12:00:00.000Z")
  const expiredAt = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString()
  await repository.saveDecision({
    fromUserId: "current_user",
    toUserId: target.userId,
    decision: "pass",
    decidedAt: expiredAt
  })

  const result = await createMatchService({ repository })
    .decide("current_user", target.userId, "pass", now)

  assert.equal(result.decision.decision, "pass")
  assert.equal(result.decision.decidedAt, now.toISOString())
  assert.equal(result.quota.used, 1)
})

test("a still-active pass treats a changed retry as idempotent and does not consume quota", async () => {
  const profiles = createSeedDiscoverProfiles()
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
  const target = profiles[0]!
  const now = new Date("2026-07-22T12:00:00.000Z")
  await repository.saveDecision({
    fromUserId: "current_user",
    toUserId: target.userId,
    decision: "pass",
    decidedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  })

  const result = await createMatchService({ repository })
    .decide("current_user", target.userId, "like", now)

  assert.equal(result.decision.decision, "pass")
  assert.equal(result.quota.used, 0)
  assert.equal(result.quota.remaining, 10)
})

test("one-way like does not create a match", async () => {
  const service = createMatchService({
    repository: createInMemoryMatchRepository(),
    idFactory: () => "match_fixed"
  })

  const result = await service.decide("current_user", "discover_defne", "like")

  assert.equal(result.matched, false)
  assert.equal(result.match, null)
})

test("reciprocal like creates one stable match", async () => {
  const repository = createInMemoryMatchRepository()
  await repository.saveDecision({
    fromUserId: "discover_defne",
    toUserId: "current_user",
    decision: "like",
    decidedAt: "2026-06-26T11:59:00.000Z"
  })
  const economyService = createEconomyService()
  const service = createMatchService({
    repository,
    idFactory: () => "match_fixed",
    economyService
  })

  const first = await service.decide(
    "current_user",
    "discover_defne",
    "like",
    new Date("2026-06-26T12:00:00.000Z")
  )
  const second = await service.decide(
    "current_user",
    "discover_defne",
    "like",
    new Date("2026-06-26T12:01:00.000Z")
  )

  assert.equal(first.matched, true)
  assert.equal(first.match?.matchId, "match_fixed")
  assert.deepEqual(first.match?.participantUserIds, [
    "current_user",
    "discover_defne"
  ])
  assert.equal(second.matched, true)
  assert.equal(second.match?.matchId, "match_fixed")
  assert.equal((await economyService.getInventory("current_user")).coins, 1300)
  assert.equal((await economyService.getInventory("discover_defne")).coins, 1300)
})

test("concurrent reciprocal likes return the same persisted match id", async () => {
  const repository = createInMemoryMatchRepository(
    createInMemoryMatchStore([
      {
        userId: "user_a",
        displayName: "Ada",
        age: 27,
        gender: "woman",
        distanceLabel: "",
        vibeTags: [],
        avatar: TEST_AVATAR,
        avatarPresetId: "default"
      },
      {
        userId: "user_b",
        displayName: "Mert",
        age: 29,
        gender: "man",
        distanceLabel: "",
        vibeTags: [],
        avatar: TEST_AVATAR,
        avatarPresetId: "default"
      }
    ])
  )
  const serviceA = createMatchService({
    repository,
    idFactory: () => "match_from_a"
  })
  const serviceB = createMatchService({
    repository,
    idFactory: () => "match_from_b"
  })

  const [fromA, fromB] = await Promise.all([
    serviceA.decide(
      "user_a",
      "user_b",
      "like",
      new Date("2026-07-13T10:00:00.000Z")
    ),
    serviceB.decide(
      "user_b",
      "user_a",
      "like",
      new Date("2026-07-13T10:00:00.000Z")
    )
  ])

  assert.equal(fromA.matched, true)
  assert.equal(fromB.matched, true)
  assert.equal(fromA.match?.matchId, fromB.match?.matchId)
  assert.equal(
    (await repository.findMatchBetween("user_a", "user_b"))?.matchId,
    fromA.match?.matchId
  )
})

test("unavailable target profiles are rejected", async () => {
  const service = createMatchService()

  await assert.rejects(
    () => service.decide("current_user", "missing_profile", "like"),
    /not available/
  )
})

test("a discovery watch is idempotent, expires, and can be cancelled", async () => {
  const service = createMatchService()
  const preferences: DiscoveryFilters = {
    ageMin: 23,
    ageMax: 35,
    genders: ["woman"],
    vibes: ["coffee"]
  }

  const first = await service.activateDiscoveryWatch(
    "current_user",
    preferences,
    new Date("2026-07-21T10:00:00.000Z")
  )
  const refreshed = await service.activateDiscoveryWatch(
    "current_user",
    preferences,
    new Date("2026-07-21T11:00:00.000Z")
  )

  assert.equal(first.userId, "current_user")
  assert.equal(first.status, "active")
  assert.equal(first.expiresAt, "2026-07-28T10:00:00.000Z")
  assert.equal(refreshed.expiresAt, "2026-07-28T11:00:00.000Z")
  assert.deepEqual(
    await service.getDiscoveryWatch("current_user", new Date("2026-07-22T00:00:00.000Z")),
    refreshed
  )
  assert.equal(
    await service.getDiscoveryWatch("current_user", new Date("2026-07-29T00:00:00.000Z")),
    null
  )
  await service.cancelDiscoveryWatch("current_user")
  assert.equal(await service.getDiscoveryWatch("current_user"), null)
})

test("expired passes resurface at most one candidate per in-memory page", async () => {
  const profiles = createSeedDiscoverProfiles().slice(0, 2)
  const repository = createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
  const expiredAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
  for (const profile of profiles) {
    await repository.saveDecision({
      fromUserId: "current_user",
      toUserId: profile.userId,
      decision: "pass",
      decidedAt: expiredAt
    })
  }

  const visible = await createMatchService({ repository }).listDiscoveryPage(
    "current_user",
    { ageMin: 18, ageMax: 99, genders: [], vibes: [] },
    { offset: 0, limit: 12 }
  )

  assert.equal(visible.length, 1)
})

test("in-memory discovery keeps globally eligible profiles", async () => {
  const profiles = createSeedDiscoverProfiles().slice(0, 2).map((profile, index) => ({
    ...profile,
    userId: `radius_${index}`,
    distanceLabel: index === 0 ? "8 km away" : "30 km away"
  }))
  const service = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore(profiles))
  })

  const visible = await service.listDiscoveryPage(
    "current_user",
    { ageMin: 18, ageMax: 99, genders: [], vibes: [] },
    { offset: 0, limit: 12 }
  )

  assert.deepEqual(visible.map((profile) => profile.userId), ["radius_0", "radius_1"])
})
