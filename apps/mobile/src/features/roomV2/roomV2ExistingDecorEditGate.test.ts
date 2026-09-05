import assert from "node:assert/strict"
import test from "node:test"
import { isRoomV2ExistingDecorOnlyEdit } from "./roomV2ExistingDecorEditGate"

const current = {
  roomShellId: "shell-a",
  placedItems: [{
    instanceId: "bed-1",
    itemId: "starter-bed",
    x: 0.5,
    y: 0.7,
    rotation: "front" as const
  }]
}

test("inventory-unavailable mode still permits moving or rotating existing room items", () => {
  assert.equal(isRoomV2ExistingDecorOnlyEdit(current, {
    ...current,
    placedItems: [{
      ...current.placedItems[0],
      x: 0.72,
      y: 0.62,
      rotation: "right"
    }]
  }), true)
})

test("inventory-unavailable mode rejects adding, replacing, or changing the shell", () => {
  assert.equal(isRoomV2ExistingDecorOnlyEdit(current, {
    ...current,
    placedItems: [...current.placedItems, {
      instanceId: "chair-1",
      itemId: "premium-chair",
      x: 0.4,
      y: 0.7,
      rotation: "front"
    }]
  }), false)
  assert.equal(isRoomV2ExistingDecorOnlyEdit(current, {
    ...current,
    placedItems: [{ ...current.placedItems[0], itemId: "premium-bed" }]
  }), false)
  assert.equal(isRoomV2ExistingDecorOnlyEdit(current, {
    ...current,
    roomShellId: "shell-b"
  }), false)
})

test("inventory-unavailable mode permits removing an existing item", () => {
  assert.equal(isRoomV2ExistingDecorOnlyEdit(current, {
    ...current,
    placedItems: []
  }), true)
})
