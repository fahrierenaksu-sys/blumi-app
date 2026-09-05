import test from "node:test"
import assert from "node:assert/strict"
import {
  discoveryDecisionSchema,
  discoveryQuotaSchema,
  discoveryWatchSchema,
  serverMatchSchema
} from "./discoverySchemas"

test("Discovery schemas accept canonical quota and watch payloads", () => {
  const quota = discoveryQuotaSchema.safeParse({
    limit: 10,
    extensionDecisions: 0,
    used: 1,
    remaining: 9,
    resetsAt: "2026-07-23T00:00:00.000Z",
    rewardedAd: { available: false, extensionDecisions: 10 }
  })
  const watch = discoveryWatchSchema.safeParse({
    userId: "user-1",
    status: "active",
    preferences: {
      ageMin: 18,
      ageMax: 99,
      genders: ["woman"],
      vibes: ["coffee"]
    },
    updatedAt: "2026-07-21T10:00:00.000Z",
    expiresAt: "2026-07-28T10:00:00.000Z"
  })

  assert.equal(quota.success, true)
  assert.equal(watch.success, true)
})

test("Discovery schemas reject malformed dates and constrained enum values", () => {
  assert.equal(discoveryQuotaSchema.safeParse({
    limit: 10,
    extensionDecisions: 0,
    used: 1,
    remaining: 9,
    resetsAt: "tomorrow",
    rewardedAd: { available: false, extensionDecisions: 10 }
  }).success, false)
  assert.equal(discoveryWatchSchema.safeParse({
    userId: "user-1",
    status: "pending",
    preferences: { ageMin: 18, ageMax: 99, genders: ["other"], vibes: [] },
    updatedAt: "2026-07-21T10:00:00.000Z",
    expiresAt: "2026-07-28T10:00:00.000Z"
  }).success, false)
})

test("Discovery decision and match schemas reject incomplete participant state", () => {
  assert.equal(discoveryDecisionSchema.safeParse({
    fromUserId: "from",
    toUserId: "to",
    decision: "like",
    decidedAt: "2026-07-21T10:00:00.000Z"
  }).success, true)
  assert.equal(serverMatchSchema.safeParse({
    matchId: "match-1",
    participantUserIds: ["only-one"],
    matchedAt: "2026-07-21T10:00:00.000Z"
  }).success, false)
})
