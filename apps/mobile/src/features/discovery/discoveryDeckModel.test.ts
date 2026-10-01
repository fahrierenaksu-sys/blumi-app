import assert from "node:assert/strict"
import test from "node:test"
import type { DiscoveryDecisionQuota } from "@blumi/contracts"

import {
  applyOptimisticDiscoveryDecision,
  applyProductionDetailDecision,
  beginInFlightDiscoveryDecision,
  buildDiscoveryDeck,
  finishInFlightDiscoveryDecision,
  mergeDiscoveryQuota,
  rollbackOptimisticDiscoveryDecision
} from "./discoveryDeckModel"

const profiles = [
  { userId: "a", blocked: false },
  { userId: "b", blocked: false },
  { userId: "c", blocked: true }
]

test("buildDiscoveryDeck removes unavailable and already handled profiles", () => {
  const deck = buildDiscoveryDeck(profiles, {
    blockedUserIds: new Set(["blocked-locally"]),
    skippedUserIds: new Set(["b"]),
    savedUserIds: new Set(),
    seenUserIds: new Set(),
    pendingInviteUserIds: new Set()
  })

  assert.deepEqual(deck.map((profile) => profile.userId), ["a"])
  assert.deepEqual(profiles.map((profile) => profile.userId), ["a", "b", "c"])
})

test("in-flight decisions dedupe one candidate without blocking the next card", () => {
  const empty = new Set<string>()
  const first = beginInFlightDiscoveryDecision(empty, "a")
  const duplicate = beginInFlightDiscoveryDecision(first.nextUserIds, "a")
  const nextCard = beginInFlightDiscoveryDecision(first.nextUserIds, "b")

  assert.equal(first.accepted, true)
  assert.equal(duplicate.accepted, false)
  assert.equal(nextCard.accepted, true)
  assert.deepEqual([...nextCard.nextUserIds], ["a", "b"])
  assert.deepEqual([...empty], [])
})

test("finishing one in-flight decision preserves other requests immutably", () => {
  const pending = new Set(["a", "b"])
  const finished = finishInFlightDiscoveryDecision(pending, "a")

  assert.deepEqual([...finished], ["b"])
  assert.deepEqual([...pending], ["a", "b"])
})

test("optimistic decisions advance the deck immediately without mutating seen state", () => {
  const seen = new Set(["older"])
  const optimistic = applyOptimisticDiscoveryDecision(seen, "a")

  assert.deepEqual([...optimistic], ["older", "a"])
  assert.deepEqual([...seen], ["older"])
})

test("failed optimistic decisions restore only the failed candidate immutably", () => {
  const optimistic = new Set(["older", "a", "newer"])
  const restored = rollbackOptimisticDiscoveryDecision(optimistic, "a")

  assert.deepEqual([...restored], ["older", "newer"])
  assert.deepEqual([...optimistic], ["older", "a", "newer"])
})

test("a completed production detail decision removes the candidate and synchronizes quota", () => {
  const seen = new Set(["older"])
  const quota: DiscoveryDecisionQuota = {
    limit: 10,
    extensionDecisions: 0,
    used: 3,
    remaining: 7,
    resetsAt: "2026-07-31T00:00:00.000Z",
    rewardedAd: { available: false, extensionDecisions: 10 }
  }

  const synchronized = applyProductionDetailDecision(seen, {
    decision: "pass",
    userId: "candidate-a",
    quota
  })

  assert.deepEqual([...synchronized.seenUserIds], ["older", "candidate-a"])
  assert.deepEqual(synchronized.quota, quota)
  assert.deepEqual([...seen], ["older"])
})

test("an older decision answer arriving late never raises the remaining quota again", () => {
  const quotaAt = (used: number, resetsAt = "2026-07-31T00:00:00.000Z"): DiscoveryDecisionQuota => ({
    limit: 10,
    extensionDecisions: 0,
    used,
    remaining: 10 - used,
    resetsAt,
    rewardedAd: { available: false, extensionDecisions: 10 }
  })

  // Two quick swipes: the second answer (used 10) arrives before the first (used 9).
  const afterSecond = mergeDiscoveryQuota(quotaAt(8), quotaAt(10))
  assert.equal(afterSecond.remaining, 0)
  assert.equal(mergeDiscoveryQuota(afterSecond, quotaAt(9)).remaining, 0, "the late answer is stale")

  // Same count: the newest answer wins (for example a raised limit).
  const raised = { ...quotaAt(10), limit: 20, remaining: 10 }
  assert.deepEqual(mergeDiscoveryQuota(quotaAt(10), raised), raised)
  // A new UTC day replaces the old period even with a smaller count.
  const nextDay = quotaAt(1, "2026-08-01T00:00:00.000Z")
  assert.deepEqual(mergeDiscoveryQuota(afterSecond, nextDay), nextDay)
  // A late answer from the previous day never replaces the new one.
  assert.deepEqual(mergeDiscoveryQuota(nextDay, quotaAt(10)), nextDay)
  assert.deepEqual(mergeDiscoveryQuota(undefined, nextDay), nextDay)
})
