import assert from "node:assert/strict"
import test from "node:test"
import { getMyRoomEditorCopy } from "../myRoomCopy"
import { resolveRoomV2Scene } from "../roomV2Selectors"
import type { FurnitureItem, ResolvedRoomV2Scene } from "../roomV2.types"
import {
  ROOM_V2_PLACEMENT_SNAP_STEP,
  arePlacementPreviewsEqual,
  clampRoomV2PlacementPointForItem,
  clampRoomV2PlacementPointToFloor,
  createRoomEditorPlacedItemFromPreview,
  createRoomEditorStagePlacementPreview,
  createRoomEditorTrayPlacementPreview,
  createRoomV2PlacementPreviewResult,
  createRoomV2SceneWithPreviewItem,
  createValidDraftPlacement,
  getDefaultRoomV2FurnitureRotation,
  getRoomPlacementFeedback,
  getRoomPlacementSurfaceDropFeedback,
  getRoomV2FurnitureRotationOptions,
  getRoomV2SupportLocalPosition,
  resolveRoomV2InventoryPreviewSource,
  snapRoomV2PlacementValue,
  type PlacementPreview
} from "./roomEditorPlacementModel"
import {
  TEST_EDITOR_SHELL,
  createTestFurniture,
  createTestPlaced,
  createTestRenderItem
} from "./roomEditorTestFixtures"

const en = getMyRoomEditorCopy("en")
const tr = getMyRoomEditorCopy("tr")
const chair = createTestFurniture()
const table = createTestFurniture({
  id: "table",
  name: "Desk",
  category: "table",
  width: 0.2,
  height: 0.18,
  footprint: { width: 0.16, height: 0.06 }
})
const wideSofa = createTestFurniture({
  id: "wide-sofa",
  name: "Wide Sofa",
  width: 0.9,
  height: 0.3,
  footprint: { width: 0.9, height: 0.5 }
})
const unit = { x: 0, y: 0, width: 1, height: 1 }

function createScene(): ResolvedRoomV2Scene {
  return resolveRoomV2Scene({
    roomShellCatalog: [TEST_EDITOR_SHELL],
    furnitureCatalog: [chair, table, wideSofa],
    decor: {
      roomShellId: TEST_EDITOR_SHELL.id,
      placedItems: [
        createTestPlaced(),
        createTestPlaced({ instanceId: "table_1", itemId: "table", x: 0.66, y: 0.62 })
      ]
    },
    defaultRoomShellId: TEST_EDITOR_SHELL.id
  })
}

function preview(overrides: Partial<PlacementPreview> = {}): PlacementPreview {
  return {
    item: createTestRenderItem(),
    isValid: true,
    ...overrides
  }
}

test("placement values snap to the nearest grid step", () => {
  const step = ROOM_V2_PLACEMENT_SNAP_STEP
  const snapped = snapRoomV2PlacementValue(0.44)
  assert.ok(Math.abs(snapped - 0.44) <= step / 2 + 1e-9)
  assert.equal(snapRoomV2PlacementValue(snapped + step * 0.49), snapped)
  assert.ok(Math.abs(snapRoomV2PlacementValue(snapped + step * 0.51) - (snapped + step)) < 1e-9)
})

test("preview equality ignores identity but tracks every rendered field and blocker order", () => {
  const base = preview({ blockingRenderIds: ["a", "b"] })
  assert.equal(arePlacementPreviewsEqual(undefined, undefined), true)
  assert.equal(arePlacementPreviewsEqual(base, base), true)
  assert.equal(arePlacementPreviewsEqual(base, undefined), false)
  assert.equal(arePlacementPreviewsEqual(undefined, base), false)
  assert.equal(
    arePlacementPreviewsEqual(base, preview({ blockingRenderIds: ["a", "b"] })),
    true
  )
  const changed: Partial<PlacementPreview>[] = [
    { isValid: false, blockingRenderIds: ["a", "b"] },
    { feedback: "moved", blockingRenderIds: ["a", "b"] },
    { item: createTestRenderItem({ renderId: "other" }), blockingRenderIds: ["a", "b"] },
    { item: createTestRenderItem({ x: 0.31 }), blockingRenderIds: ["a", "b"] },
    { item: createTestRenderItem({ height: 0.2 }), blockingRenderIds: ["a", "b"] },
    { item: createTestRenderItem({ depth: 0.1 }), blockingRenderIds: ["a", "b"] },
    { item: createTestRenderItem({ anchor: { x: 0.5, y: 0.9 } }), blockingRenderIds: ["a", "b"] },
    { item: createTestRenderItem({ rotation: "left" }), blockingRenderIds: ["a", "b"] },
    {
      item: createTestRenderItem({ asset: { key: "chair/left", source: 1 as never } }),
      blockingRenderIds: ["a", "b"]
    },
    {
      item: createTestRenderItem({ footprint: { width: 0.1, height: 0.03 } }),
      blockingRenderIds: ["a", "b"]
    },
    { blockingRenderIds: ["b", "a"] },
    { blockingRenderIds: ["a"] }
  ]
  for (const overrides of changed) {
    assert.equal(arePlacementPreviewsEqual(base, preview(overrides)), false, JSON.stringify(overrides))
  }
  // Support metadata is intentionally not part of the render comparison.
  assert.equal(
    arePlacementPreviewsEqual(
      base,
      preview({ blockingRenderIds: ["a", "b"], supportingRenderIds: ["desk"] })
    ),
    true
  )
})

test("placement issue ids map to their localized feedback with a clear-spot fallback", () => {
  for (const copy of [en, tr]) {
    assert.equal(getRoomPlacementFeedback("overlaps_blocking_furniture", copy), copy.feedback.overlapsFurniture)
    assert.equal(getRoomPlacementFeedback("outside_placeable_area", copy), copy.feedback.outsideFloor)
    assert.equal(getRoomPlacementFeedback("invalid_placement_surface", copy), copy.feedback.invalidSurface)
    assert.equal(getRoomPlacementFeedback("missing_support_surface", copy), copy.feedback.missingSupport)
    assert.equal(getRoomPlacementFeedback("unknown", copy), copy.feedback.chooseClearSpot)
    assert.equal(getRoomPlacementFeedback(undefined, copy), copy.feedback.chooseClearSpot)
  }
})

test("surface drop feedback follows the item's placement surface", () => {
  assert.equal(getRoomPlacementSurfaceDropFeedback(chair, en), en.surfaceDrop.floor)
  assert.equal(
    getRoomPlacementSurfaceDropFeedback(createTestFurniture({ placementSurface: "wall" }), tr),
    tr.surfaceDrop.wall
  )
  assert.equal(
    getRoomPlacementSurfaceDropFeedback(createTestFurniture({ placementSurface: "tabletop" }), en),
    en.surfaceDrop.tabletop
  )
})

test("rotation options come only from supplied asset views and default to front", () => {
  const asset = { key: "k", source: 1 as never }
  assert.deepEqual(getRoomV2FurnitureRotationOptions(chair), [])
  assert.equal(getDefaultRoomV2FurnitureRotation(chair), "front")
  const sideOnly: FurnitureItem = createTestFurniture({
    assetsByRotation: { left: asset, right: asset }
  })
  assert.deepEqual(getRoomV2FurnitureRotationOptions(sideOnly), ["left", "right"])
  assert.equal(getDefaultRoomV2FurnitureRotation(sideOnly), "left")
  const withFront = createTestFurniture({
    assetsByRotation: { right: asset, front: asset }
  })
  assert.deepEqual(getRoomV2FurnitureRotationOptions(withFront), ["right", "front"])
  assert.equal(getDefaultRoomV2FurnitureRotation(withFront), "front")
})

test("inventory preview source uses the chosen rotation view when it exists", () => {
  const left = { key: "chair/left", source: 7 as never }
  const directional = createTestFurniture({ assetsByRotation: { left } })
  assert.equal(resolveRoomV2InventoryPreviewSource(directional, "left"), 7)
  assert.equal(resolveRoomV2InventoryPreviewSource(directional, "back"), chair.asset.source)
  assert.equal(resolveRoomV2InventoryPreviewSource(chair, "front"), chair.asset.source)
})

test("floor clamping projects into the walkable polygon, else the placeable diamond, else the unit square", () => {
  assert.deepEqual(
    clampRoomV2PlacementPointForItem({ x: 0.05, y: 0.99 }, chair, TEST_EDITOR_SHELL),
    { x: 0.2820312349077562, y: 0.8237694388100069 }
  )
  assert.deepEqual(
    clampRoomV2PlacementPointForItem(
      { x: 0.05, y: 0.99 },
      chair,
      { ...TEST_EDITOR_SHELL, walkablePolygon: undefined }
    ),
    { x: 0.36, y: 0.77 }
  )
  assert.deepEqual(
    clampRoomV2PlacementPointToFloor(
      { x: 0.9, y: 0.5 },
      { ...TEST_EDITOR_SHELL, walkablePolygon: undefined }
    ),
    { x: 0.68, y: 0.59 }
  )
  assert.deepEqual(
    clampRoomV2PlacementPointForItem({ x: 0.123, y: 1.4 }, chair, undefined),
    { x: 0.12, y: 1 }
  )
})

test("surface clamping keeps the anchored box inside its band and centres an impossible fit", () => {
  const wallItem = createTestFurniture({ placementSurface: "wall" })
  assert.deepEqual(
    clampRoomV2PlacementPointForItem({ x: 0.01, y: 0.9 }, wallItem, TEST_EDITOR_SHELL),
    { x: 0.22, y: 0.56 }
  )
  const tooWide = createTestFurniture({ placementSurface: "wall", width: 0.9 })
  // min (0.18 + 0.45) > max (0.76 - 0.45): the box is centred between them.
  assert.ok(
    Math.abs(clampRoomV2PlacementPointForItem({ x: 0.9, y: 0.3 }, tooWide, TEST_EDITOR_SHELL).x - 0.47) < 1e-9
  )
  // Without a band the point is only clamped to the unit square (no snapping).
  assert.deepEqual(
    clampRoomV2PlacementPointForItem({ x: -1, y: 0.333 }, wallItem, undefined),
    { x: 0, y: 0.333 }
  )
})

test("support-local position is relative to the support image box", () => {
  const desk = createTestRenderItem({
    renderId: "desk",
    itemId: "table",
    x: 0.66,
    y: 0.62,
    width: 0.2,
    height: 0.18
  })
  const lamp = createTestRenderItem({ renderId: "lamp", x: 0.61, y: 0.47 })
  const scene: ResolvedRoomV2Scene = { shell: TEST_EDITOR_SHELL, renderItems: [desk] }
  const local = getRoomV2SupportLocalPosition(scene, lamp, "desk")
  assert.ok(local)
  assert.ok(Math.abs(local.x - 0.25) < 1e-9)
  assert.ok(Math.abs(local.y - (0.47 - 0.44) / 0.18) < 1e-9)
  assert.equal(getRoomV2SupportLocalPosition(scene, lamp, undefined), undefined)
  assert.equal(getRoomV2SupportLocalPosition(scene, lamp, "missing"), undefined)
  assert.equal(
    getRoomV2SupportLocalPosition(
      { ...scene, renderItems: [{ ...desk, width: 0 }] },
      lamp,
      "desk"
    ),
    undefined
  )
})

test("preview results carry validation feedback, avatar path blocking, and support rotation", () => {
  const scene = createScene()
  const candidate = createTestRenderItem({ renderId: "chair_2", x: 0.5, y: 0.7 })

  const invalid = createRoomV2PlacementPreviewResult({
    copy: en,
    scene,
    candidate,
    placementIsValid: false,
    placementFeedback: "nope",
    blockingRenderIds: ["table_1"],
    supportingRenderIds: []
  })
  assert.deepEqual(invalid, {
    item: candidate,
    isValid: false,
    feedback: "nope",
    blockingRenderIds: ["table_1"],
    supportingRenderIds: [],
    supportParentRotation: undefined,
    supportLocalPosition: undefined
  })

  const valid = createRoomV2PlacementPreviewResult({
    copy: en,
    scene,
    candidate,
    placementIsValid: true,
    supportingRenderIds: []
  })
  assert.deepEqual(valid, {
    item: candidate,
    isValid: true,
    feedback: undefined,
    supportingRenderIds: [],
    supportParentRotation: undefined,
    supportLocalPosition: undefined
  })

  const onSpawn = createTestRenderItem({ renderId: "c3", x: 0.47, y: 0.77 })
  const blocked = createRoomV2PlacementPreviewResult({
    copy: tr,
    scene,
    candidate: onSpawn,
    placementIsValid: true,
    supportingRenderIds: []
  })
  assert.equal(blocked.isValid, false)
  assert.equal(blocked.feedback, tr.feedback.blocksAvatarPath)
  assert.deepEqual(blocked.blockingRenderIds, ["c3"])

  const supported = createRoomV2PlacementPreviewResult({
    copy: en,
    scene,
    candidate: createTestRenderItem({ renderId: "lamp", x: 0.66, y: 0.47, blocksMovement: false }),
    placementIsValid: false,
    supportingRenderIds: ["table_1"]
  })
  assert.equal(supported.supportParentRotation, "front")
  assert.ok(supported.supportLocalPosition)
})

test("the preview scene inserts the candidate without mutating the source scene", () => {
  const scene = createScene()
  const candidate = createTestRenderItem({ renderId: "chair_2", x: 0.5, y: 0.7 })
  const previewScene = createRoomV2SceneWithPreviewItem({ scene, candidate })
  assert.equal(scene.renderItems.length, 2)
  assert.deepEqual(
    previewScene.renderItems.map((item) => item.renderId).sort(),
    ["chair_1", "chair_2", "table_1"]
  )
  assert.equal(previewScene.shell, scene.shell)
})

test("draft placement returns the first valid candidate with persistence metadata, or null", () => {
  const scene = createScene()
  const placed = createValidDraftPlacement({ copy: en, item: chair, itemId: "chair", scene })
  assert.ok(placed)
  assert.match(placed.instanceId, /^chair_\d+$/)
  assert.deepEqual(
    { ...placed, instanceId: "x" },
    { instanceId: "x", itemId: "chair", x: 0.32, y: 0.56, rotation: "front", placementSurface: "floor" }
  )
  const rotated = createValidDraftPlacement({
    copy: en,
    item: chair,
    itemId: "chair",
    scene,
    rotationOverride: "left"
  })
  assert.equal(rotated?.rotation, "left")
  assert.equal(
    createValidDraftPlacement({ copy: en, item: wideSofa, itemId: "wide-sofa", scene }),
    null
  )
})

test("tray previews require a measured stage and an on-stage pointer", () => {
  const scene = createScene()
  const base = {
    copy: en,
    scene,
    item: chair,
    instanceId: "chair_2",
    rotation: "front" as const
  }
  assert.equal(createRoomEditorTrayPlacementPreview({ ...base, stageWindowBounds: undefined, pageX: 1, pageY: 1 }), undefined)
  assert.equal(
    createRoomEditorTrayPlacementPreview({ ...base, stageWindowBounds: { ...unit, width: 0 }, pageX: 0, pageY: 0 }),
    undefined
  )
  assert.equal(
    createRoomEditorTrayPlacementPreview({ ...base, stageWindowBounds: { x: 10, y: 100, width: 400, height: 228 }, pageX: 5, pageY: 150 }),
    undefined
  )
  assert.equal(
    createRoomEditorTrayPlacementPreview({ ...base, stageWindowBounds: { x: 10, y: 100, width: 400, height: 228 }, pageX: 50, pageY: 329 }),
    undefined
  )

  const inside = createRoomEditorTrayPlacementPreview({
    ...base,
    stageWindowBounds: { x: 10, y: 100, width: 400, height: 228 },
    pageX: 10 + 0.5 * 400,
    pageY: 100 + 0.7 * 228
  })
  assert.ok(inside)
  assert.equal(inside.isValid, true)
  assert.equal(inside.item.renderId, "chair_2")
  assert.equal(inside.item.kind === "furniture" && inside.item.rotation, "front")
  assert.ok(Math.abs(inside.item.x - 0.5) < 1e-9)
  assert.ok(Math.abs(inside.item.y - 0.7) < 1e-9)

  const blocked = createRoomEditorTrayPlacementPreview({ ...base, stageWindowBounds: unit, instanceId: "c3", pageX: 0.47, pageY: 0.77 })
  assert.equal(blocked?.isValid, false)
  assert.equal(blocked?.feedback, en.feedback.blocksAvatarPath)

  const offFloor = createRoomEditorTrayPlacementPreview({ ...base, item: wideSofa, stageWindowBounds: unit, pageX: 0.47, pageY: 0.8 })
  assert.equal(offFloor?.isValid, false)
  assert.equal(offFloor?.feedback, en.feedback.outsideFloor)
  assert.deepEqual(offFloor?.blockingRenderIds, ["table_1", "chair_1"])
})

test("stage previews move the selected furniture and ignore missing selections", () => {
  const scene = createScene()
  assert.equal(
    createRoomEditorStagePlacementPreview({ copy: en, scene, selectedInstanceId: "missing", point: { x: 0.5, y: 0.7 } }),
    undefined
  )
  const moved = createRoomEditorStagePlacementPreview({
    copy: en,
    scene,
    selectedInstanceId: "chair_1",
    point: { x: 0.35, y: 0.62 }
  })
  assert.ok(moved)
  assert.equal(moved.isValid, true)
  assert.equal(moved.item.renderId, "chair_1")
  assert.ok(Math.abs(moved.item.x - 0.35) < 1e-9)
  assert.ok(Math.abs(moved.item.y - 0.62) < 1e-9)
})

test("committing a preview keeps its render position and support metadata", () => {
  const item = createTestRenderItem({ renderId: "lamp_1", itemId: "lamp", x: 0.61, y: 0.47, placementSurface: "tabletop" })
  const placed = createRoomEditorPlacedItemFromPreview({
    item,
    isValid: true,
    supportingRenderIds: ["desk", "other"],
    supportParentRotation: "left",
    supportLocalPosition: { x: 0.25, y: 0.5 }
  }, item)
  assert.deepEqual(placed, {
    instanceId: "lamp_1",
    itemId: "lamp",
    x: 0.61,
    y: 0.47,
    rotation: "front",
    placementSurface: "tabletop",
    supportInstanceId: "desk",
    supportParentRotation: "left",
    supportLocalPosition: { x: 0.25, y: 0.5 }
  })
})
