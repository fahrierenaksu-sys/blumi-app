import assert from "node:assert/strict"
import test from "node:test"
import {
  createOwnerInventoryState,
  failOwnerInventoryHydration,
  isOwnerInventoryReady,
  replaceOwnerInventory,
  shouldApplyInventoryHydrationResponse,
  shouldApplyServerInventorySnapshot
} from "./inventoryScopeModel"
import type { BlumiInventorySnapshot } from "./inventoryModel"

const DEFAULTS: BlumiInventorySnapshot = {
  coins: 1250,
  ownedAvatarItemIds: ["starter-avatar"],
  ownedRoomItemIds: ["starter-room"],
  unlockedFeatureIds: [],
  updatedAt: "1970-01-01T00:00:00.000Z"
}

test("switching owners starts from a fresh inventory without exposing the prior account", () => {
  const ownerA = replaceOwnerInventory({
    current: createOwnerInventoryState("user-a", DEFAULTS),
    ownerUserId: "user-a",
    source: "server",
    inventory: {
      ...DEFAULTS,
      coins: 9000,
      ownedRoomItemIds: ["starter-room", "paid-bed"]
    }
  })
  const ownerB = createOwnerInventoryState("user-b", DEFAULTS)

  assert.equal(ownerA.inventory.coins, 9000)
  assert.deepEqual(ownerB.inventory, DEFAULTS)
  assert.equal(isOwnerInventoryReady(ownerB, "user-b", true), false)
})

test("a stale response for account A cannot mutate account B", () => {
  const ownerB = createOwnerInventoryState("user-b", DEFAULTS)
  const next = replaceOwnerInventory({
    current: ownerB,
    ownerUserId: "user-a",
    source: "server",
    inventory: { ...DEFAULTS, coins: 7777 }
  })

  assert.equal(next, ownerB)
  assert.deepEqual(next.inventory, DEFAULTS)
})

test("failed server hydration never marks paid inventory safe for room sanitization", () => {
  const failed = failOwnerInventoryHydration({
    current: createOwnerInventoryState("user-b", DEFAULTS),
    ownerUserId: "user-b",
    source: "server"
  })

  assert.equal(failed.serverStatus, "failed")
  assert.equal(isOwnerInventoryReady(failed, "user-b", true), false)
})

test("local and server readiness are evaluated independently for the same owner", () => {
  const initial = createOwnerInventoryState("user-a", DEFAULTS)
  const local = replaceOwnerInventory({
    current: initial,
    ownerUserId: "user-a",
    source: "local",
    inventory: { ...DEFAULTS, coins: 1300 }
  })

  assert.equal(local.localStatus, "ready")
  assert.equal(local.serverStatus, "idle")
  assert.equal(isOwnerInventoryReady(local, "user-a", false), true)
  assert.equal(isOwnerInventoryReady(local, "user-a", true), false)
  assert.equal(isOwnerInventoryReady(local, "user-b", false), false)

  const server = replaceOwnerInventory({
    current: local,
    ownerUserId: "user-a",
    source: "server",
    inventory: { ...DEFAULTS, coins: 1400 }
  })
  assert.equal(server.localStatus, "ready")
  assert.equal(server.serverStatus, "ready")
  assert.equal(isOwnerInventoryReady(server, "user-a", true), true)
})

test("failed local hydration is immutable and ignores another owner", () => {
  const initial = createOwnerInventoryState("user-a", DEFAULTS)
  const ignored = failOwnerInventoryHydration({
    current: initial,
    ownerUserId: "user-b",
    source: "local"
  })
  assert.equal(ignored, initial)

  const failed = failOwnerInventoryHydration({
    current: initial,
    ownerUserId: "user-a",
    source: "local"
  })
  assert.equal(failed.localStatus, "failed")
  assert.equal(failed.serverStatus, "idle")
})

test("late local inventory cannot replace a verified server snapshot", () => {
  const server = replaceOwnerInventory({
    current: createOwnerInventoryState("user-a", DEFAULTS),
    ownerUserId: "user-a",
    source: "server",
    inventory: { ...DEFAULTS, coins: 2200, updatedAt: "2026-07-13T10:00:00.000Z" }
  })
  const lateLocal = replaceOwnerInventory({
    current: server,
    ownerUserId: "user-a",
    source: "local",
    inventory: { ...DEFAULTS, coins: 400, updatedAt: "2026-07-12T10:00:00.000Z" }
  })

  assert.equal(lateLocal.inventory.coins, 2200)
  assert.equal(lateLocal.localStatus, "ready")
})

test("older server snapshots cannot overwrite newer entitlements", () => {
  assert.equal(shouldApplyServerInventorySnapshot(
    { ...DEFAULTS, updatedAt: "2026-07-13T10:00:01.000Z" },
    { ...DEFAULTS, updatedAt: "2026-07-13T10:00:00.000Z" },
    true
  ), false)
  assert.equal(shouldApplyServerInventorySnapshot(
    DEFAULTS,
    { ...DEFAULTS, updatedAt: "2026-07-13T10:00:00.000Z" },
    false
  ), true)
  assert.equal(shouldApplyServerInventorySnapshot(
    { ...DEFAULTS, updatedAt: "2026-07-13T10:00:00.000Z" },
    { ...DEFAULTS, updatedAt: "2026-07-13T10:00:00.000Z" },
    true
  ), false)
})

test("hydration responses are rejected after a newer request or mutation starts", () => {
  assert.equal(shouldApplyInventoryHydrationResponse({
    currentHydrationGeneration: 2,
    responseHydrationGeneration: 1,
    currentMutationGeneration: 0,
    startedMutationGeneration: 0
  }), false)
  assert.equal(shouldApplyInventoryHydrationResponse({
    currentHydrationGeneration: 2,
    responseHydrationGeneration: 2,
    currentMutationGeneration: 2,
    startedMutationGeneration: 1
  }), false)
  assert.equal(shouldApplyInventoryHydrationResponse({
    currentHydrationGeneration: 2,
    responseHydrationGeneration: 2,
    currentMutationGeneration: 2,
    startedMutationGeneration: 2
  }), true)
})
