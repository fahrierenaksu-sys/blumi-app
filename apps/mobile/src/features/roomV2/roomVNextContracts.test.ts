import assert from "node:assert/strict"
import test from "node:test"
import type { FurnitureItem, RoomFurnitureVisualContract } from "./roomV2.types"
import {
  adaptFurnitureItemToRoomVNext,
  getRoomVNextDirectionalLayerAssets,
  getRoomVNextDirectionalVisual,
  validateRoomFurnitureVisualContract
} from "./roomVNextContracts"
import { resolvePlacedFurnitureRenderItem } from "./roomV2Selectors"
import { getRoomVNextCalibratedRenderSize } from "./roomVNextScale"

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

test("VNext contract requires all four real directional visuals", () => {
  const contract = createContract()
  assert.deepEqual(validateRoomFurnitureVisualContract(contract), {
    isValid: true,
    issueIds: []
  })

  const missingRight = createContract({
    directions: {
      ...contract.directions,
      right: undefined as never
    }
  })
  const result = validateRoomFurnitureVisualContract(missingRight)
  assert.equal(result.isValid, false)
  assert.ok(result.issueIds.includes("missing_directional_visual"))
})

test("VNext validation fails closed for invalid pivot and identity metadata", () => {
  const result = validateRoomFurnitureVisualContract(createContract({
    skuId: " ",
    directions: {
      ...createContract().directions,
      front: {
        ...createContract().directions.front,
        normalizedFloorPivot: { x: 1.2, y: -0.2 }
      }
    }
  }))
  assert.equal(result.isValid, false)
  assert.ok(result.issueIds.includes("invalid_identity"))
  assert.ok(result.issueIds.includes("invalid_floor_pivot"))
})

test("adapter copies directional layers and never mutates legacy item or source contract", () => {
  const contract = createContract()
  const adapted = adaptFurnitureItemToRoomVNext(legacyItem, contract)

  assert.notEqual(adapted, legacyItem)
  assert.equal(adapted.asset.key, "bed-front")
  assert.equal(adapted.assetsByRotation?.left?.key, "bed-left")
  assert.equal(adapted.rotationPolicy, "directional_assets_required")
  assert.equal(adapted.sceneProjection, "upright")
  assert.deepEqual(adapted.renderSizeByRotation?.right, { width: 0.31, height: 0.25 })
  assert.deepEqual(adapted.anchorByRotation?.back, { x: 0.5, y: 1 })
  assert.equal(adapted.visualContract?.skuId, "pink-cloud-bed")
  assert.notEqual(adapted.visualContract, contract)
  assert.notEqual(adapted.visualContract?.directions, contract.directions)
  assert.equal(legacyItem.visualContract, undefined)
  assert.equal(contract.directions.front.bodyAsset.key, "bed-front")
  assert.equal(
    adapted.visualContract?.directions.front.thumbnailAsset?.key,
    "thumbnail-front"
  )
})

test("directional thumbnail metadata remains tied to the VNext master", () => {
  const contract = createContract()
  const adapted = adaptFurnitureItemToRoomVNext(legacyItem, contract)
  assert.equal(
    adapted.visualContract?.directions.right.thumbnailAsset?.key,
    "thumbnail-right"
  )

  const invalid = createContract({
    directions: {
      ...contract.directions,
      front: {
        ...contract.directions.front,
        thumbnailAsset: { key: "", source }
      }
    }
  })
  const validation = validateRoomFurnitureVisualContract(invalid)
  assert.equal(validation.isValid, false)
  assert.ok(validation.issueIds.includes("invalid_directional_visual"))
})

test("directional layer resolver exposes body, contact shadow, and occlusion without mirroring", () => {
  const contract = createContract()
  assert.equal(getRoomVNextDirectionalVisual(contract, "back")?.bodyAsset.key, "bed-back")
  assert.deepEqual(getRoomVNextDirectionalLayerAssets(contract, "left"), {
    bodyAsset: { key: "bed-left", source },
    contactShadowAsset: { key: "shadow-left", source },
    foregroundOcclusionAsset: { key: "occlusion-left", source }
  })
  assert.equal(getRoomVNextDirectionalLayerAssets(contract, "front")?.bodyAsset.key, "bed-front")
})

test("scene resolver prefers VNext directional metadata while preserving the world pivot", () => {
  const adapted = adaptFurnitureItemToRoomVNext(legacyItem, createContract())
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

test("adapter rejects incomplete contracts instead of silently falling back to a mirrored asset", () => {
  const contract = createContract({
    directions: {
      ...createContract().directions,
      back: undefined as never
    }
  })
  assert.throws(
    () => adaptFurnitureItemToRoomVNext(legacyItem, contract),
    /missing_directional_visual/
  )
})

test("cohesion render envelopes are calibrated from physical size and alpha bounds", () => {
  assert.equal(getRoomVNextCalibratedRenderSize({
    physicalWidthCm: 165,
    physicalDepthCm: 210,
    physicalHeightCm: 105,
    renderClass: "upright",
    bodyAlphaWidthRatio: 0.8545,
    bodyAlphaHeightRatio: 0.6338
  }).height, 0.2924)
  assert.deepEqual(getRoomVNextCalibratedRenderSize({
    physicalWidthCm: 158,
    physicalDepthCm: 112,
    physicalHeightCm: 1,
    renderClass: "floor_plane",
    bodyAlphaWidthRatio: 0.8213,
    bodyAlphaHeightRatio: 0.3633
  }), { width: 0.3395, height: 0.2312 })
  assert.throws(() => getRoomVNextCalibratedRenderSize({
    physicalWidthCm: 10,
    physicalDepthCm: 10,
    physicalHeightCm: 10,
    renderClass: "upright",
    bodyAlphaWidthRatio: 0,
    bodyAlphaHeightRatio: 0.5
  }), /alpha ratio/)
})
