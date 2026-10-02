import assert from "node:assert/strict"
import test from "node:test"
import { getMyRoomEditorCopy } from "../myRoomCopy"
import {
  getRoomV2FloorGridCellPoint,
  getRoomV2FloorGridProjection,
  isRoomV2FloorGridPointOnFloor,
  ROOM_V2_BLUMI_WORLD_FLOOR_GRID
} from "../roomV2FloorGrid"
import {
  isRoomV2FurnitureFootprintOnFloor,
  resolvePlacedFurnitureRenderItem,
  resolveRoomV2Scene,
  validateRoomV2DraftPlacements,
  validateRoomV2FurniturePlacement
} from "../roomV2Selectors"
import type { ResolvedRoomV2Scene, UserRoomDecor } from "../roomV2.types"
import {
  createRoomEditorDragHitRects,
  createRoomEditorStageDragPreview,
  createRoomEditorTrayDragPreview,
  getRoomEditorDragCell,
  getRoomEditorDragCellWindowPoint,
  getRoomEditorDragFloorGrid,
  getRoomEditorStageDragPoint,
  getRoomEditorTrayDragPoint,
  resolveRoomEditorDragRelease,
  ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT
} from "./roomEditorDragModel"
import {
  createRoomEditorFloorOverlay,
  getRoomEditorDragGhostPlate,
  getRoomEditorParallelogramMatrix,
  ROOM_EDITOR_FLOOR_SHAPE_BASE
} from "./roomEditorFloorGridModel"
import {
  createRoomEditorPlacedItemFromPreview,
  createRoomEditorStagePlacementPreview,
  ROOM_V2_FLOOR_GRID_FIT_RINGS
} from "./roomEditorPlacementModel"
import {
  TEST_FLOOR_GRID_SHELL,
  createTestFurniture,
  createTestPlaced
} from "./roomEditorTestFixtures"

const en = getMyRoomEditorCopy("en")
const chair = createTestFurniture()
const poster = createTestFurniture({ id: "poster", name: "Poster", category: "wallDecor", placementSurface: "wall" })
const floor = getRoomV2FloorGridProjection(ROOM_V2_BLUMI_WORLD_FLOOR_GRID)
// A 390 pt phone in "fill" zoom: the room is 1.2x the screen wide.
const stage = { x: -39, y: 120, width: 468, height: 266.5 }

function cellPoint(column: number, row: number) {
  const point = getRoomV2FloorGridCellPoint(floor, column, row)
  return { x: Math.round(point.x * 1e6) / 1e6, y: Math.round(point.y * 1e6) / 1e6 }
}

function createScene(placedItems: UserRoomDecor["placedItems"]): ResolvedRoomV2Scene {
  return resolveRoomV2Scene({
    roomShellCatalog: [TEST_FLOOR_GRID_SHELL],
    furnitureCatalog: [chair, poster],
    decor: { roomShellId: TEST_FLOOR_GRID_SHELL.id, placedItems },
    defaultRoomShellId: TEST_FLOOR_GRID_SHELL.id
  })
}

const placedChairCell = { column: 6, row: 8 }
const scene = createScene([
  createTestPlaced({ ...cellPoint(placedChairCell.column, placedChairCell.row) })
])

/** A tray finger whose held contact point is on the centre of `cell`. */
function fingerOverCell(column: number, row: number) {
  const window = getRoomEditorDragCellWindowPoint({ floor, column, row, stage })
  return { absoluteX: window.x, absoluteY: window.y + ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT }
}

test("floor pieces drag on the floor grid; wall pieces keep the plain stage grid", () => {
  assert.equal(getRoomEditorDragFloorGrid(chair, TEST_FLOOR_GRID_SHELL), floor)
  assert.equal(getRoomEditorDragFloorGrid(poster, TEST_FLOOR_GRID_SHELL), null)
  const rects = createRoomEditorDragHitRects(scene.renderItems, scene.shell)
  assert.equal(rects[0].usesFloorGrid, true)
})

test("a tray drop snaps to the cell under the held point and commits exactly where it was shown", () => {
  const target = { column: 4, row: 3 }
  const finger = fingerOverCell(target.column, target.row)
  // Wobble inside the cell: the snapped cell does not change.
  for (const wobble of [0, 3, -3]) {
    const point = getRoomEditorTrayDragPoint({
      absoluteX: finger.absoluteX + wobble,
      absoluteY: finger.absoluteY - wobble / 2,
      lift: ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT,
      bounds: stage
    })
    assert.equal(point.inside, true)
    assert.deepEqual(getRoomEditorDragCell(point, floor), target)
  }
  const preview = createRoomEditorTrayDragPreview({
    copy: en,
    scene,
    stageWindowBounds: stage,
    item: chair,
    instanceId: "chair_2",
    rotation: "front",
    floor,
    ...target
  })
  assert.ok(preview)
  assert.equal(preview.isValid, true)
  // The ghost sits on the cell's centre; the preview and the commit use it too.
  assert.deepEqual({ x: preview.item.x, y: preview.item.y }, cellPoint(target.column, target.row))
  assert.equal(resolveRoomEditorDragRelease({ source: "tray", moved: true, inside: true, preview }), "commit")
  assert.equal(preview.item.kind, "furniture")
  if (preview.item.kind !== "furniture") return
  const committed = createRoomEditorPlacedItemFromPreview(preview, preview.item)
  assert.deepEqual({ x: committed.x, y: committed.y }, { x: preview.item.x, y: preview.item.y })
  assert.equal(committed.itemId, "chair")
})

test("a drop onto a placed piece's footprint shows invalid and names the blocker", () => {
  const preview = createRoomEditorTrayDragPreview({
    copy: en,
    scene,
    stageWindowBounds: stage,
    item: chair,
    instanceId: "chair_2",
    rotation: "front",
    floor,
    ...placedChairCell
  })
  assert.ok(preview)
  assert.equal(preview.isValid, false)
  assert.deepEqual(preview.blockingRenderIds, ["chair_1"])
  assert.equal(resolveRoomEditorDragRelease({ source: "tray", moved: true, inside: true, preview }), "reject")
})

test("a footprint that would hang past the drawn floor is fitted to the nearest cell on it", () => {
  // The back corner cell: the chair's footprint (above its anchor) would sit on the wall.
  const corner = { column: floor.minColumn + 1, row: floor.minRow + 1 }
  const preview = createRoomEditorTrayDragPreview({
    copy: en,
    scene,
    stageWindowBounds: stage,
    item: chair,
    instanceId: "chair_2",
    rotation: "front",
    floor,
    ...corner
  })
  assert.ok(preview && preview.item.kind === "furniture")
  assert.ok(isRoomV2FurnitureFootprintOnFloor(preview.item, [...ROOM_V2_BLUMI_WORLD_FLOOR_GRID.outline]))
  const fitted = getRoomEditorDragCell({ x: preview.item.x, y: preview.item.y, inside: true }, floor)
  assert.notDeepEqual(fitted, corner)
  assert.ok(Math.max(Math.abs(fitted.column - corner.column), Math.abs(fitted.row - corner.row)) <= ROOM_V2_FLOOR_GRID_FIT_RINGS)
  // The fitted spot is a cell centre, so the ghost can be moved onto it exactly.
  assert.deepEqual({ x: preview.item.x, y: preview.item.y }, cellPoint(fitted.column, fitted.row))
})

test("moving a placed piece keeps the grab offset and lands on the snapped cell", () => {
  const chairRender = scene.renderItems.find((item) => item.renderId === "chair_1")
  assert.ok(chairRender)
  // Grabbed 0.01 right of and 0.05 above the anchor, then moved two cells along i.
  const destination = cellPoint(placedChairCell.column + 2, placedChairCell.row)
  const point = getRoomEditorStageDragPoint({
    localX: (destination.x + 0.01) * stage.width,
    localY: (destination.y - 0.05) * stage.height,
    stageWidth: stage.width,
    stageHeight: stage.height,
    grabOffsetX: 0.01,
    grabOffsetY: -0.05
  })
  const cell = getRoomEditorDragCell(point, floor)
  assert.deepEqual(cell, { column: placedChairCell.column + 2, row: placedChairCell.row })
  const preview = createRoomEditorStageDragPreview({ copy: en, scene, renderId: "chair_1", floor, ...cell })
  assert.ok(preview?.isValid)
  assert.deepEqual({ x: preview.item.x, y: preview.item.y }, destination)
})

test("a floor tap snaps to the same grid as a drag", () => {
  const tapped = createRoomEditorStagePlacementPreview({
    copy: en,
    scene,
    selectedInstanceId: "chair_1",
    point: { x: cellPoint(9, 9).x + 0.004, y: cellPoint(9, 9).y - 0.002 }
  })
  assert.ok(tapped)
  assert.deepEqual({ x: tapped.item.x, y: tapped.item.y }, cellPoint(9, 9))
})

test("placement is bounded by the drawn floor, not the avatar walk polygon", () => {
  const at = (x: number, y: number) => {
    const item = resolvePlacedFurnitureRenderItem(createTestPlaced({ instanceId: "probe", x, y }), chair)
    assert.ok(item)
    return validateRoomV2FurniturePlacement({ scene: createScene([]), candidate: item })
  }
  // On the drawn floor near the right corner, outside the old heptagon.
  assert.equal(isRoomV2FloorGridPointOnFloor(floor, 0.86, 0.66), true)
  assert.equal(at(0.86, 0.66).isValid, true)
  // Inside the old heptagon but on the front lip below the drawn floor.
  assert.equal(isRoomV2FloorGridPointOnFloor(floor, 0.31, 0.895), false)
  assert.deepEqual(at(0.31, 0.895).issueIds, ["outside_placeable_area"])
})

test("pieces saved on the old looser floor stay savable until the user moves them", () => {
  const offFloor = createTestPlaced({ instanceId: "legacy", x: 0.31, y: 0.895 })
  const decor = { roomShellId: TEST_FLOOR_GRID_SHELL.id, placedItems: [offFloor] }
  const legacyScene = createScene([offFloor])
  const untouched = validateRoomV2DraftPlacements({
    scene: legacyScene,
    decor,
    furnitureCatalog: [chair],
    untouchedFrom: decor
  })
  assert.equal(untouched.isValid, true)
  const moved = { ...decor, placedItems: [{ ...offFloor, x: 0.32 }] }
  const movedValidation = validateRoomV2DraftPlacements({
    scene: createScene(moved.placedItems),
    decor: moved,
    furnitureCatalog: [chair],
    untouchedFrom: decor
  })
  assert.equal(movedValidation.isValid, false)
})

test("the floor overlay draws the drawn grout lines and the footprint cells in the verdict's tone", () => {
  const preview = createRoomEditorTrayDragPreview({
    copy: en,
    scene,
    stageWindowBounds: stage,
    item: chair,
    instanceId: "chair_2",
    rotation: "front",
    floor,
    column: 4,
    row: 3
  })
  const overlay = createRoomEditorFloorOverlay({ shell: scene.shell, preview, stage })
  assert.ok(overlay)
  assert.equal(overlay.tone, "valid")
  assert.ok(overlay.lines.length >= 16)
  assert.ok(overlay.cells.length >= 1)
  const invalid = createRoomEditorFloorOverlay({
    shell: scene.shell,
    preview: preview && { ...preview, isValid: false },
    stage
  })
  assert.equal(invalid?.tone, "invalid")
  // No overlay for wall pieces, shells without a grid, or an unmeasured stage.
  assert.equal(createRoomEditorFloorOverlay({ shell: scene.shell, preview: undefined, stage }), undefined)
  assert.equal(createRoomEditorFloorOverlay({ shell: { ...TEST_FLOOR_GRID_SHELL, floorGrid: undefined }, preview, stage }), undefined)
  assert.equal(createRoomEditorFloorOverlay({ shell: scene.shell, preview, stage: { width: 0, height: 0 } }), undefined)
})

test("parallelogram matrices map the base square onto the cell's edges", () => {
  const alongI = { x: 26, y: 9 }
  const alongJ = { x: -25, y: 9.5 }
  const m = getRoomEditorParallelogramMatrix(alongI, alongJ)
  const half = ROOM_EDITOR_FLOOR_SHAPE_BASE / 2
  // Column-major: x' = m0 x + m4 y + m12, y' = m1 x + m5 y + m13 (about the view centre).
  const map = (x: number, y: number) => ({ x: m[0] * x + m[4] * y + m[12], y: m[1] * x + m[5] * y + m[13] })
  const corner = map(half, half)
  assert.ok(Math.abs(corner.x - (alongI.x + alongJ.x) / 2) < 1e-9)
  assert.ok(Math.abs(corner.y - (alongI.y + alongJ.y) / 2) < 1e-9)
  const chairRender = scene.renderItems[0]
  assert.equal(chairRender.kind, "furniture")
  if (chairRender.kind !== "furniture") return
  const plate = getRoomEditorDragGhostPlate(chairRender, stage)
  // The plate is centred on the footprint, which sits just above a bottom anchor.
  assert.ok(plate.top + half < 0)
})
