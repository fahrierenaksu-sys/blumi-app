import assert from "node:assert/strict"
import test from "node:test"
import { shouldHydrateProductionInventory } from "./inventoryHydrationPolicy"

const incomplete = {
  profile: "complete" as const,
  avatar: "complete" as const,
  room: "incomplete" as const
}

const complete = {
  profile: "complete" as const,
  avatar: "complete" as const,
  room: "complete" as const,
  completedAt: "2026-08-11T18:00:00.000Z"
}

test("production inventory waits until every onboarding step is complete", () => {
  assert.equal(shouldHydrateProductionInventory("production", incomplete), false)
  assert.equal(shouldHydrateProductionInventory("production", complete), true)
})

test("demo inventory never calls the production economy boundary", () => {
  assert.equal(shouldHydrateProductionInventory("demo", complete), false)
})
