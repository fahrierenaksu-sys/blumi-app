import assert from "node:assert/strict"
import test from "node:test"
import {
  migrateRoomV2DecorToV3,
  ROOM_V3_DECOR_SCHEMA_VERSION
} from "./roomV3Contracts"
import type { RoomShell, UserRoomDecor } from "./roomV2.types"

const V3_SHELL: RoomShell = {
  id: "room_v3_shell_cocoa_navy_modern_studio",
  name: "Cocoa Navy Modern Studio",
  geometryVersion: "blumi_room_v3_2026",
  asset: { key: "shell", source: 0 as never },
  canvasSize: { width: 1536, height: 1024 },
  placeableArea: { minX: 0.14, maxX: 0.86, minY: 0.48, maxY: 0.91 },
  walkablePolygon: [
    { x: 0.5, y: 0.4 },
    { x: 0.84, y: 0.55 },
    { x: 0.88, y: 0.73 },
    { x: 0.7, y: 0.92 },
    { x: 0.3, y: 0.92 },
    { x: 0.12, y: 0.73 },
    { x: 0.16, y: 0.55 }
  ]
}

test("v2 layouts migrate immutably to the selected v3 shell geometry", () => {
  const legacy: UserRoomDecor = {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [{
      instanceId: "legacy-chair",
      itemId: "room_v2_chair_blush",
      x: 0.5,
      y: 0.74,
      rotation: "front"
    }]
  }

  const migrated = migrateRoomV2DecorToV3({
    decor: legacy,
    targetShell: V3_SHELL
  })

  assert.equal(migrated.schemaVersion, ROOM_V3_DECOR_SCHEMA_VERSION)
  assert.equal(migrated.geometryVersion, "blumi_room_v3_2026")
  assert.equal(migrated.roomShellId, V3_SHELL.id)
  assert.equal(migrated.migration?.fromSchemaVersion, 2)
  assert.deepEqual(legacy, {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [{
      instanceId: "legacy-chair",
      itemId: "room_v2_chair_blush",
      x: 0.5,
      y: 0.74,
      rotation: "front"
    }]
  })

  const migratedAgain = migrateRoomV2DecorToV3({
    decor: migrated,
    targetShell: V3_SHELL
  })
  assert.deepEqual(migratedAgain, migrated)
  assert.notEqual(migratedAgain, migrated)
  assert.notEqual(migratedAgain.placedItems, migrated.placedItems)
})
