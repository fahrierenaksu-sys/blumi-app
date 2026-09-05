import assert from "node:assert/strict"
import test from "node:test"
import {
  applyInventoryUnlock,
  normalizeInventorySnapshot,
  serializeInventorySnapshot,
  type BlumiInventorySnapshot
} from "./inventoryModel"

const defaults: BlumiInventorySnapshot = {
  coins: 1250,
  ownedAvatarItemIds: ["avatar_default"],
  ownedRoomItemIds: ["room_default"],
  unlockedFeatureIds: [],
  updatedAt: "1970-01-01T00:00:00.000Z"
}

const validAvatarIds = new Set(["avatar_default", "avatar_premium"])
const validRoomIds = new Set(["room_default", "room_premium"])

test("purchase survives serialization and restart normalization", () => {
  const purchase = applyInventoryUnlock({
    current: defaults,
    itemId: "avatar_premium",
    priceCoins: 420,
    ownedKey: "ownedAvatarItemIds",
    now: "2026-07-11T00:00:00.000Z"
  })

  assert.deepEqual(purchase.result, { success: true })
  assert.equal(purchase.nextInventory.coins, 830)
  assert.deepEqual(purchase.nextInventory.ownedAvatarItemIds, [
    "avatar_default",
    "avatar_premium"
  ])
  assert.deepEqual(defaults.ownedAvatarItemIds, ["avatar_default"])

  const restarted = normalizeInventorySnapshot({
    value: JSON.parse(serializeInventorySnapshot(purchase.nextInventory)),
    defaults,
    validAvatarIds,
    validRoomIds,
    now: "2026-07-12T00:00:00.000Z"
  })

  assert.ok(restarted)
  assert.equal(restarted.coins, 830)
  assert.ok(restarted.ownedAvatarItemIds.includes("avatar_premium"))
})

test("normalization restores defaults and removes stale catalog ids", () => {
  const normalized = normalizeInventorySnapshot({
    value: {
      coins: 99.9,
      ownedAvatarItemIds: ["removed_avatar", "avatar_premium"],
      ownedRoomItemIds: ["removed_room"],
      unlockedFeatureIds: ["feature_a", "feature_a", 4]
    },
    defaults,
    validAvatarIds,
    validRoomIds,
    now: "2026-07-12T00:00:00.000Z"
  })

  assert.ok(normalized)
  assert.equal(normalized.coins, 99)
  assert.deepEqual(normalized.ownedAvatarItemIds, ["avatar_default", "avatar_premium"])
  assert.deepEqual(normalized.ownedRoomItemIds, ["room_default"])
  assert.deepEqual(normalized.unlockedFeatureIds, ["feature_a"])
})

test("unlock rejects duplicate, invalid price, and insufficient balance immutably", () => {
  const duplicate = applyInventoryUnlock({
    current: defaults,
    itemId: "avatar_default",
    priceCoins: 100,
    ownedKey: "ownedAvatarItemIds"
  })
  const invalidPrice = applyInventoryUnlock({
    current: defaults,
    itemId: "avatar_premium",
    priceCoins: Number.NaN,
    ownedKey: "ownedAvatarItemIds"
  })
  const expensive = applyInventoryUnlock({
    current: defaults,
    itemId: "avatar_premium",
    priceCoins: 2000,
    ownedKey: "ownedAvatarItemIds"
  })

  assert.equal(duplicate.result.reason, "already_owned")
  assert.equal(invalidPrice.result.reason, "invalid_price")
  assert.equal(expensive.result.reason, "not_enough_coins")
  assert.deepEqual(defaults.ownedAvatarItemIds, ["avatar_default"])
  assert.equal(defaults.coins, 1250)
})
