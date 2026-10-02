import assert from "node:assert/strict"
import test from "node:test"
import { getMyRoomEditorCopy } from "../myRoomCopy"
import { resolveRoomV2Scene } from "../roomV2Selectors"
import type { ResolvedRoomV2Scene } from "../roomV2.types"
import {
  ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS,
  ROOM_EDITOR_DRAG_CELL_STEP,
  ROOM_EDITOR_DRAG_OUTSIDE_CELL,
  ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT,
  createRoomEditorDragHitRects,
  createRoomEditorStageDragPreview,
  createRoomEditorTrayDragPreview,
  findRoomEditorDragHitRect,
  getRoomEditorDragCell,
  getRoomEditorDragCellValue,
  getRoomEditorDragFeedback,
  getRoomEditorDragGhostFrame,
  getRoomEditorStageDragPoint,
  getRoomEditorTrayDragPoint,
  hasRoomEditorDragCellChanged,
  resolveRoomEditorDragRelease,
  shouldTickRoomEditorDragValidity
} from "./roomEditorDragModel"
import type { PlacementPreview } from "./roomEditorPlacementModel"
import {
  TEST_EDITOR_SHELL,
  createTestFurniture,
  createTestPlaced,
  createTestRenderItem
} from "./roomEditorTestFixtures"

const en = getMyRoomEditorCopy("en")
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
const stageBounds = { x: 10, y: 100, width: 400, height: 228 }

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

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`)
}

test("drag activation waits for a short hold and snaps to a 2% cell grid", () => {
  assert.equal(ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS, 220)
  assert.equal(ROOM_EDITOR_DRAG_CELL_STEP, 0.02)
  assert.deepEqual(getRoomEditorDragCell({ x: 0.5, y: 0.7, inside: true }, null), { column: 25, row: 35 })
  assert.deepEqual(getRoomEditorDragCell({ x: 0.509, y: 0.711, inside: true }, null), { column: 25, row: 36 })
  assert.deepEqual(
    getRoomEditorDragCell({ x: 0.5, y: 0.7, inside: false }, null),
    { column: ROOM_EDITOR_DRAG_OUTSIDE_CELL, row: ROOM_EDITOR_DRAG_OUTSIDE_CELL }
  )
  near(getRoomEditorDragCellValue(25), 0.5)
  near(getRoomEditorDragCellValue(36), 0.72)
  assert.equal(hasRoomEditorDragCellChanged(25, 35, 25, 35), false)
  assert.equal(hasRoomEditorDragCellChanged(25, 35, 26, 35), true)
  assert.equal(hasRoomEditorDragCellChanged(25, 35, 25, 34), true)
})

test("hit rects match the rendered furniture box and pick the top-most piece", () => {
  const back = createTestRenderItem({ renderId: "back", x: 0.5, y: 0.7 })
  const front = createTestRenderItem({ renderId: "front", x: 0.52, y: 0.72 })
  const avatar = { ...createTestRenderItem({ renderId: "avatar" }), kind: "avatar" } as never
  const rects = createRoomEditorDragHitRects([back, avatar, front])
  assert.deepEqual(rects.map((rect) => rect.renderId), ["back", "front"])
  near(rects[0].left, 0.46)
  near(rects[0].right, 0.54)
  near(rects[0].top, 0.58)
  near(rects[0].bottom, 0.7)
  assert.equal(rects[0].anchorX, 0.5)
  assert.equal(rects[0].anchorY, 0.7)
  // Overlap: the later (front) item is drawn on top and wins.
  assert.equal(findRoomEditorDragHitRect(rects, 0.5, 0.68), 1)
  assert.equal(findRoomEditorDragHitRect(rects, 0.47, 0.6), 0)
  assert.equal(findRoomEditorDragHitRect(rects, 0.1, 0.1), -1)
  assert.equal(findRoomEditorDragHitRect([], 0.5, 0.5), -1)
})

test("stage drag keeps the grab offset so the piece does not jump to the finger", () => {
  // Grabbed 0.01 right of and 0.05 above the anchor; finger moved to (220, 130) px.
  const point = getRoomEditorStageDragPoint({
    localX: 220,
    localY: 130,
    stageWidth: 400,
    stageHeight: 200,
    grabOffsetX: 0.01,
    grabOffsetY: -0.05
  })
  near(point.x, 0.54)
  near(point.y, 0.7)
  assert.equal(point.inside, true)
  const unmeasured = getRoomEditorStageDragPoint({
    localX: 220,
    localY: 130,
    stageWidth: 0,
    stageHeight: 200,
    grabOffsetX: 0,
    grabOffsetY: 0
  })
  assert.equal(unmeasured.inside, false)
})

test("tray drag maps a window point onto the measured stage, and off-stage is outside", () => {
  const inside = getRoomEditorTrayDragPoint({ absoluteX: 210, absoluteY: 259.6, lift: 0, bounds: stageBounds })
  near(inside.x, 0.5)
  near(inside.y, 0.7)
  assert.equal(inside.inside, true)
  assert.equal(getRoomEditorTrayDragPoint({ absoluteX: 210, absoluteY: 400, lift: 0, bounds: stageBounds }).inside, false)
  assert.equal(getRoomEditorTrayDragPoint({ absoluteX: 5, absoluteY: 150, lift: 0, bounds: stageBounds }).inside, false)
  assert.equal(getRoomEditorTrayDragPoint({ absoluteX: 210, absoluteY: 150, lift: 0, bounds: undefined }).inside, false)
  assert.equal(
    getRoomEditorTrayDragPoint({ absoluteX: 210, absoluteY: 150, lift: 0, bounds: { ...stageBounds, height: 0 } }).inside,
    false
  )
})

test("a tray drag holds the piece's contact point above the fingertip", () => {
  assert.ok(ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT >= 24, "the landing spot must clear a fingertip")
  const lifted = getRoomEditorTrayDragPoint({
    absoluteX: 210,
    absoluteY: 259.6 + ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT,
    lift: ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT,
    bounds: stageBounds
  })
  near(lifted.x, 0.5)
  near(lifted.y, 0.7)
  // A finger just below the room already holds the piece over the front row.
  const belowStage = getRoomEditorTrayDragPoint({
    absoluteX: 210,
    absoluteY: stageBounds.y + stageBounds.height + 10,
    lift: ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT,
    bounds: stageBounds
  })
  assert.equal(belowStage.inside, true)
})

test("stage drag previews use the existing placement rules at the snapped cell", () => {
  const scene = createScene()
  const moved = createRoomEditorStageDragPreview({ copy: en, scene, renderId: "chair_1", floor: null, column: 18, row: 31 })
  assert.ok(moved)
  assert.equal(moved.isValid, true)
  assert.equal(moved.item.renderId, "chair_1")
  near(moved.item.x, 0.36)
  near(moved.item.y, 0.62)
  const blocked = createRoomEditorStageDragPreview({ copy: en, scene, renderId: "chair_1", floor: null, column: 33, row: 31 })
  assert.equal(blocked?.isValid, false)
  assert.equal(
    createRoomEditorStageDragPreview({ copy: en, scene, renderId: "missing", floor: null, column: 18, row: 31 }),
    undefined
  )
})

test("tray drag previews place a new instance at the drop cell and ignore off-stage cells", () => {
  const scene = createScene()
  const base = { copy: en, scene, stageWindowBounds: stageBounds, item: chair, instanceId: "chair_2", rotation: "front" as const, floor: null }
  const dropped = createRoomEditorTrayDragPreview({ ...base, column: 25, row: 35 })
  assert.ok(dropped)
  assert.equal(dropped.isValid, true)
  assert.equal(dropped.item.renderId, "chair_2")
  near(dropped.item.x, 0.5)
  near(dropped.item.y, 0.7)
  assert.equal(
    createRoomEditorTrayDragPreview({ ...base, column: ROOM_EDITOR_DRAG_OUTSIDE_CELL, row: ROOM_EDITOR_DRAG_OUTSIDE_CELL }),
    undefined
  )
  assert.equal(createRoomEditorTrayDragPreview({ ...base, stageWindowBounds: undefined, column: 25, row: 35 }), undefined)
})

test("release commits a valid move, springs back an invalid one, and cancels a non-move or off-stage drop", () => {
  const valid: PlacementPreview = { item: createTestRenderItem(), isValid: true }
  const invalid: PlacementPreview = { item: createTestRenderItem(), isValid: false, feedback: en.feedback.outsideFloor }
  const avatarPreview: PlacementPreview = {
    item: { ...createTestRenderItem(), kind: "avatar" } as never,
    isValid: true
  }
  assert.equal(resolveRoomEditorDragRelease({ source: "stage", moved: true, inside: true, preview: valid }), "commit")
  assert.equal(resolveRoomEditorDragRelease({ source: "stage", moved: true, inside: true, preview: invalid }), "reject")
  assert.equal(resolveRoomEditorDragRelease({ source: "stage", moved: true, inside: true, preview: undefined }), "reject")
  assert.equal(resolveRoomEditorDragRelease({ source: "stage", moved: true, inside: true, preview: avatarPreview }), "reject")
  assert.equal(resolveRoomEditorDragRelease({ source: "stage", moved: false, inside: true, preview: valid }), "cancel")
  assert.equal(resolveRoomEditorDragRelease({ source: "tray", moved: true, inside: true, preview: valid }), "commit")
  assert.equal(resolveRoomEditorDragRelease({ source: "tray", moved: true, inside: true, preview: invalid }), "reject")
  assert.equal(resolveRoomEditorDragRelease({ source: "tray", moved: true, inside: false, preview: undefined }), "cancel")
  assert.equal(resolveRoomEditorDragRelease({ source: "tray", moved: false, inside: false, preview: undefined }), "cancel")
})

test("ROOM-10: a drag ticks once each time the spot flips between valid and invalid", () => {
  const valid: PlacementPreview = { item: createTestRenderItem(), isValid: true }
  const invalid: PlacementPreview = { item: createTestRenderItem(), isValid: false }
  assert.equal(shouldTickRoomEditorDragValidity(undefined, valid), false, "entering the stage is not a flip")
  assert.equal(shouldTickRoomEditorDragValidity(valid, invalid), true)
  assert.equal(shouldTickRoomEditorDragValidity(invalid, valid), true)
  assert.equal(shouldTickRoomEditorDragValidity(valid, { ...valid }), false, "a new cell with the same validity is silent")
  assert.equal(shouldTickRoomEditorDragValidity(invalid, undefined), false, "leaving the stage is silent")
})

test("drag feedback prefers the preview's own message and falls back per validity", () => {
  assert.equal(getRoomEditorDragFeedback(undefined, en), undefined)
  assert.equal(getRoomEditorDragFeedback({ item: createTestRenderItem(), isValid: true }, en), en.feedback.releaseToPlace)
  assert.equal(
    getRoomEditorDragFeedback({ item: createTestRenderItem(), isValid: true, feedback: en.feedback.tightButUsable }, en),
    en.feedback.tightButUsable
  )
  assert.equal(
    getRoomEditorDragFeedback({ item: createTestRenderItem(), isValid: false }, en),
    en.feedback.chooseCompatibleSurface
  )
  assert.equal(
    getRoomEditorDragFeedback({ item: createTestRenderItem(), isValid: false, feedback: en.feedback.outsideFloor }, en),
    en.feedback.outsideFloor
  )
})

test("the ghost frame matches the rendered size and is offset to its anchor", () => {
  const frame = getRoomEditorDragGhostFrame(createTestRenderItem(), { width: 400, height: 200 })
  near(frame.width, 32)
  near(frame.height, 24)
  near(frame.offsetX, -16)
  near(frame.offsetY, -24)
})
