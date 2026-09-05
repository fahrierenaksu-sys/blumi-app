import assert from "node:assert/strict"
import test from "node:test"
import type { DiscoveryDecisionQuota } from "@blumi/contracts"

import {
  applyOptimisticDiscoveryDecision,
  applyProductionDetailDecision,
  beginInFlightDiscoveryDecision,
  buildDiscoveryDeck,
  finishInFlightDiscoveryDecision,
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
