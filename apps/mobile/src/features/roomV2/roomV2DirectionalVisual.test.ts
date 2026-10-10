import assert from "node:assert/strict"
import test from "node:test"
import type { FurnitureItem, RoomFurnitureVisualContract } from "./roomV2.types"
import { resolvePlacedFurnitureRenderItem } from "./roomV2Selectors"

const source = 0 as never

function createContract(
  overrides: Partial<RoomFurnitureVisualContract> = {}
): RoomFurnitureVisualContract {
  const directions = Object.fromEntries(
    (["front", "right", "back", "left"] as const).map((direction, index) => [
      direction,
      {
        bodyAsset: { key: `bed-${direction}`, source },
        contactShadowAsset: { key: `shadow-${direction}`, source },
        foregroundOcclusionAsset: { key: `occlusion-${direction}`, source },
        thumbnailAsset: { key: `thumbnail-${direction}`, source },
        normalizedRenderSize: { width: 0.3 + index / 100, height: 0.25 },
        normalizedFloorPivot: { x: 0.5, y: 1 }
      }
    ])
  ) as unknown as RoomFurnitureVisualContract["directions"]

  return {
    schemaVersion: "room-furniture-visual-vnext-1",
    skuId: "pink-cloud-bed",
    assetSetId: "pink-cloud-bed-vnext",
    assetVersion: 1,
    perspectiveProfile: "my-room-locked-2.5d-v1",
    viewportProfile: "ROOM_V2_APPROVED_MY_ROOM_CAMERA",
    assetCameraRigId: "blumi-room-camera-rig-v1",
    cameraRigVersion: "1",
    lightRigVersion: "1",
    materialLibraryVersion: "1",
    physicalSizeCm: { width: 165, depth: 210, height: 105 },
    renderClass: "upright",
    placementSurface: "floor",
    directions,
    footprintLocalCm: [
      { x: -82.5, y: -105 },
      { x: 82.5, y: -105 },
      { x: 82.5, y: 105 },
      { x: -82.5, y: 105 }
    ],
    blocksMovement: true,
    supportsAvatarSeat: false,
    supportsChildItems: false,
    ...overrides
  }
}

const legacyItem: FurnitureItem = {
  id: "pink-cloud-bed",
  name: "Pink Cloud Bed",
  asset: { key: "legacy", source },
  category: "misc",
  layer: "furniture",
  width: 0.1,
  height: 0.1,
  interactionType: "decor"
}

test("scene resolver prefers VNext directional metadata while preserving the world pivot", () => {
  const adapted: FurnitureItem = { ...legacyItem, visualContract: createContract() }
  const renderItem = resolvePlacedFurnitureRenderItem(
    {
      instanceId: "bed-1",
      itemId: adapted.id,
      x: 0.64,
      y: 0.78,
      rotation: "right"
    },
    adapted
  )

  assert.ok(renderItem)
  assert.equal(renderItem.asset.key, "bed-right")
  assert.equal(renderItem.sceneProjection, "upright")
  assert.deepEqual(renderItem.anchor, { x: 0.5, y: 1 })
  assert.equal(renderItem.contactShadowAsset?.key, "shadow-right")
  assert.equal(renderItem.foregroundOcclusionAsset?.key, "occlusion-right")
  assert.equal(renderItem.visualContract?.assetSetId, "pink-cloud-bed-vnext")
})

test("scene resolver fails closed for a contract with a missing direction", () => {
  const contract = createContract({
    directions: {
      ...createContract().directions,
      left: undefined as never
    }
  })
  const item = {
    ...legacyItem,
    visualContract: contract,
    assetsByRotation: {
      front: { key: "legacy-front", source },
      left: { key: "legacy-left", source }
    }
  }

  assert.equal(
    resolvePlacedFurnitureRenderItem(
      { instanceId: "bed-2", itemId: item.id, x: 0.5, y: 0.7, rotation: "left" },
      item
    ),
    null
  )
})
