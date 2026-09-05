import assert from "node:assert/strict"
import test from "node:test"
import {
  canPlaceRoomV2ItemInstance,
  commitRoomV2PlacedItem,
  selectRoomV2Shell
} from "./roomV2DecorActions"

test("selectRoomV2Shell changes only the selected shell and preserves a copied layout", () => {
  const current = {
    schemaVersion: 3,
    geometryVersion: "blumi_room_v3_2026",
    roomShellId: "room_v3_blush_petal_cottage",
    placedItems: [{
      instanceId: "chair-1",
      itemId: "room_v3_blush_petal_cottage_dining_chair_a",
      x: 0.52,
      y: 0.72,
      rotation: "front" as const
    }]
  }

  const next = selectRoomV2Shell(
    current,
    "room_v3_lavender_moon_atelier"
  )

  assert.equal(next.roomShellId, "room_v3_lavender_moon_atelier")
  assert.deepEqual(next.placedItems, current.placedItems)
  assert.notEqual(next, current)
  assert.notEqual(next.placedItems, current.placedItems)
  assert.notEqual(next.placedItems[0], current.placedItems[0])
})

test("selectRoomV2Shell rejects blank shell IDs without mutating the layout", () => {
  const current = {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: []
  }

  assert.deepEqual(selectRoomV2Shell(current, "  "), current)
  assert.notEqual(selectRoomV2Shell(current, "  "), current)
})

test("commitRoomV2PlacedItem patches an existing instance and appends a new one once", () => {
  const current = {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [{
      instanceId: "arcade-1",
      itemId: "universal_home_arcade_a",
      x: 0.5,
      y: 0.72,
      rotation: "front" as const
    }]
  }

  const moved = commitRoomV2PlacedItem(current, {
    instanceId: "arcade-1",
    itemId: "universal_home_arcade_a",
    x: 0.62,
    y: 0.68,
    rotation: "right"
  })
  const added = commitRoomV2PlacedItem(moved, {
    instanceId: "tv-1",
    itemId: "universal_cozy_tv_media_unit_a",
    x: 0.36,
    y: 0.72,
    rotation: "front"
  })
  const repeated = commitRoomV2PlacedItem(added, {
    instanceId: "tv-1",
    itemId: "universal_cozy_tv_media_unit_a",
    x: 0.36,
    y: 0.72,
    rotation: "front"
  })
  const duplicateOwnershipUse = commitRoomV2PlacedItem(repeated, {
    instanceId: "tv-2",
    itemId: "universal_cozy_tv_media_unit_a",
    x: 0.7,
    y: 0.72,
    rotation: "front"
  })

  assert.equal(moved.placedItems.length, 1)
  assert.deepEqual(moved.placedItems[0], {
    instanceId: "arcade-1",
    itemId: "universal_home_arcade_a",
    x: 0.62,
    y: 0.68,
    rotation: "right"
  })
  assert.equal(added.placedItems.length, 2)
  assert.equal(repeated.placedItems.length, 2)
  assert.equal(repeated.placedItems.filter((item) => item.instanceId === "tv-1").length, 1)
  assert.equal(duplicateOwnershipUse.placedItems.length, 2)
  assert.equal(canPlaceRoomV2ItemInstance(added, "universal_home_arcade_a"), false)
  assert.equal(canPlaceRoomV2ItemInstance(added, "universal_cozy_tv_media_unit_a"), false)
  assert.equal(canPlaceRoomV2ItemInstance(added, "universal_cloud_sectional_sofa_a"), true)
})
