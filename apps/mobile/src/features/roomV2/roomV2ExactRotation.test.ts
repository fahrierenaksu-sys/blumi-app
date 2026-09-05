import assert from "node:assert/strict"
import test from "node:test"
import type { FurnitureItem, RoomShell, UserRoomDecor } from "./roomV2.types"
import { resolveRoomV2Scene } from "./roomV2Selectors"
import { resolveRoomV2ExactRotationPreview } from "./roomV2ExactRotation"

const shell: RoomShell = {
  id: "rotation-test-shell",
  name: "Rotation Test Shell",
  asset: { key: "rotation-test-shell", source: 0 as never },
  canvasSize: { width: 1254, height: 714 },
  placeableArea: {
    minX: 0.1,
    maxX: 0.9,
    minY: 0.4,
    maxY: 0.9
  }
}

const directionalChair: FurnitureItem = {
  id: "directional-chair",
  name: "Directional Chair",
  asset: { key: "chair-front", source: 0 as never },
  assetsByRotation: {
    front: { key: "chair-front", source: 0 as never },
    left: { key: "chair-left", source: 0 as never }
  },
  rotationPolicy: "directional_assets_required",
  category: "seating",
  layer: "furniture",
  width: 0.18,
  height: 0.24,
  footprintByRotation: {
    front: { width: 0.12, height: 0.08 },
    left: { width: 0.08, height: 0.12 }
  },
  blocksMovement: true
}

function createDecor(x = 0.5): UserRoomDecor {
  return {
    roomShellId: shell.id,
    placedItems: [{
      instanceId: "chair-1",
      itemId: directionalChair.id,
      x,
      y: 0.7,
      rotation: "front"
    }]
  }
}

test("exact rotation preview resolves the requested directional asset without mutating decor", () => {
  const decor = createDecor()
  const scene = resolveRoomV2Scene({
    roomShellCatalog: [shell],
    furnitureCatalog: [directionalChair],
    decor
  })

  const result = resolveRoomV2ExactRotationPreview({
    decor,
    scene,
    furnitureCatalog: [directionalChair],
    instanceId: "chair-1",
    rotation: "left"
  })

  assert.equal(result.status, "ready")
  if (result.status !== "ready") return
  assert.equal(result.candidate.rotation, "left")
  assert.equal(result.candidate.asset.key, "chair-left")
  assert.equal(decor.placedItems[0]?.rotation, "front")
})

test("exact rotation preview fails closed for unsupported or invalid rotations", () => {
  const decor = createDecor(0.89)
  const scene = resolveRoomV2Scene({
    roomShellCatalog: [shell],
    furnitureCatalog: [directionalChair],
    decor
  })

  assert.deepEqual(
    resolveRoomV2ExactRotationPreview({
      decor,
      scene,
      furnitureCatalog: [directionalChair],
      instanceId: "chair-1",
      rotation: "right"
    }),
    { status: "unsupported_rotation" }
  )

  const invalid = resolveRoomV2ExactRotationPreview({
    decor,
    scene,
    furnitureCatalog: [directionalChair],
    instanceId: "chair-1",
    rotation: "left"
  })
  assert.equal(invalid.status, "invalid_placement")
  if (invalid.status !== "invalid_placement") return
  assert.deepEqual(invalid.validation.issueIds, ["outside_placeable_area"])
  assert.equal(decor.placedItems[0]?.rotation, "front")
})
