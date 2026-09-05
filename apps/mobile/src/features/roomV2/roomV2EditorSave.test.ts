import assert from "node:assert/strict"
import test from "node:test"
import { createRoomV2EditorSaveDecor } from "./roomV2EditorSave"

const currentDecor = {
  roomShellId: "room_v2_shell_blumi_world_v1",
  placedItems: [{
    instanceId: "starter-room-bed",
    itemId: "starter_pink_cloud_bed",
    x: 0.5,
    y: 0.7,
    rotation: "front" as const
  }]
}

test("Save commits the latest valid furniture preview without mutating the draft", () => {
  const result = createRoomV2EditorSaveDecor(currentDecor, {
    isValid: true,
    item: {
      kind: "furniture",
      renderId: "starter-room-bed",
      itemId: "starter_pink_cloud_bed",
      x: 0.72,
      y: 0.62,
      rotation: "right"
    }
  })

  assert.equal(result.status, "ready")
  if (result.status !== "ready") return
  assert.deepEqual(result.decor.placedItems, [{
    instanceId: "starter-room-bed",
    itemId: "starter_pink_cloud_bed",
    x: 0.72,
    y: 0.62,
    rotation: "right"
  }])
  assert.equal(currentDecor.placedItems[0].x, 0.5)
  assert.notEqual(result.decor, currentDecor)
})

test("Save blocks an invalid preview instead of persisting the old position", () => {
  const result = createRoomV2EditorSaveDecor(currentDecor, {
    isValid: false,
    item: {
      kind: "furniture",
      renderId: "starter-room-bed",
      itemId: "starter_pink_cloud_bed",
      x: 0.9,
      y: 0.2,
      rotation: "front"
    }
  })

  assert.deepEqual(result, { status: "invalid_preview" })
})

test("Save preserves the draft when there is no pending preview", () => {
  const result = createRoomV2EditorSaveDecor(currentDecor, undefined)

  assert.equal(result.status, "ready")
  if (result.status !== "ready") return
  assert.equal(result.decor, currentDecor)
})

test("Save records the VNext geometry and parent-local tabletop contract", () => {
  const result = createRoomV2EditorSaveDecor(currentDecor, {
    isValid: true,
    item: {
      kind: "furniture",
      renderId: "plant-1",
      itemId: "room_vnext_tabletop_plant",
      x: 0.58,
      y: 0.64,
      rotation: "front",
      placementSurface: "tabletop",
      visualContract: {
        assetSetId: "tabletop-plant-vnext",
        assetVersion: 8
      } as never,
      supportInstanceId: "table-1",
      supportParentRotation: "right",
      supportLocalPosition: { x: 0.42, y: 0.2 }
    }
  })

  assert.equal(result.status, "ready")
  if (result.status !== "ready") return
  assert.deepEqual(result.decor.placedItems.at(-1), {
    instanceId: "plant-1",
    itemId: "room_vnext_tabletop_plant",
    x: 0.58,
    y: 0.64,
    rotation: "front",
    geometryVersion: "tabletop-plant-vnext-v8",
    placementSurface: "tabletop",
    supportInstanceId: "table-1",
    supportParentRotation: "right",
    supportLocalPosition: { x: 0.42, y: 0.2 }
  })
})
