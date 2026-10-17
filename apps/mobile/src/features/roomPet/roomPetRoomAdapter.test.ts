import assert from "node:assert/strict"
import test from "node:test"

import type { RoomPoint2D, RoomV2FurnitureRenderItem } from "../roomV2/roomV2.types"
import {
  createRoomV2FloorGridProjection,
  getRoomV2FloorGridCellPoint,
  isRoomV2FloorGridPointOnFloor,
  ROOM_V2_BLUMI_WORLD_FLOOR_GRID
} from "../roomV2/roomV2FloorGrid"
import { getMyRoomVisibleStageXRange, resolveMyRoomLayoutMetrics } from "../roomV2/myRoomLayoutMetrics"
import { resolveRoomV2MyRoomCamera } from "../roomV2/roomV2Camera"
import type { RoomPetCell, RoomPetEvent, RoomPetMap, RoomPetState } from "./roomPet.types"
import { roomPetCellKey } from "./roomPetGrid"
import { drawRoomPetInteger } from "./roomPetRng"
import { createRoomPetMapFromRoom, getRoomPetCellAtStagePoint, type RoomPetVisibleStage } from "./roomPetRoomAdapter"
import { getRoomPetDrawnHalfWidth } from "./roomPetSprite"
import { runTestRoomPet } from "./roomPetTestMap"
import { ROOM_PET_CAT_WHITE_SHEET_LAYOUT } from "./sheet/roomPetCatWhiteSheet"

const PROJECTION = createRoomV2FloorGridProjection(ROOM_V2_BLUMI_WORLD_FLOOR_GRID)
const MIDDLE_COLUMN = Math.round((PROJECTION.minColumn + PROJECTION.maxColumn) / 2)
const MIDDLE_ROW = Math.round((PROJECTION.minRow + PROJECTION.maxRow) / 2)

function square(center: RoomPoint2D, half: number): RoomPoint2D[] {
  return [
    { x: center.x - half, y: center.y - half },
    { x: center.x + half, y: center.y - half },
    { x: center.x + half, y: center.y + half },
    { x: center.x - half, y: center.y + half }
  ]
}

function item(overrides: Partial<RoomV2FurnitureRenderItem> & Pick<RoomV2FurnitureRenderItem, "renderId" | "itemId">): RoomV2FurnitureRenderItem {
  return {
    kind: "furniture",
    layer: "furniture",
    depth: 0,
    x: 0.5,
    y: 0.6,
    width: 0.1,
    height: 0.1,
    anchor: { x: 0.5, y: 0.5 },
    name: overrides.itemId,
    category: "misc",
    asset: { key: overrides.itemId, source: 1 },
    rotation: "front",
    usesMirroredRotation: false,
    blocksMovement: false,
    interactionType: "none",
    ...overrides
  }
}

const TABLE_CENTER = getRoomV2FloorGridCellPoint(PROJECTION, MIDDLE_COLUMN, MIDDLE_ROW)
const RUG_CENTER = getRoomV2FloorGridCellPoint(PROJECTION, MIDDLE_COLUMN - 3, MIDDLE_ROW + 2)
const BED_APPROACH = getRoomV2FloorGridCellPoint(PROJECTION, MIDDLE_COLUMN + 3, MIDDLE_ROW - 2)
const BED_SEAT = { x: BED_APPROACH.x + 0.02, y: BED_APPROACH.y - 0.05 }

const FURNITURE: RoomV2FurnitureRenderItem[] = [
  item({
    renderId: "table_1", itemId: "room_v3_coffeetable_japon_round", category: "table",
    blocksMovement: true, collisionPolygon: square(TABLE_CENTER, 0.03)
  }),
  item({
    renderId: "rug_1", itemId: "room_v3_rug_oyun_cloud", category: "rug",
    x: RUG_CENTER.x, y: RUG_CENTER.y, width: 0.16, height: 0.1
  }),
  item({
    renderId: "bed_1", itemId: "room_v3_bed_blumi_starter", category: "seating", interactionType: "seat",
    seatWorldPoints: [{ id: "lie", facing: "front", seatHeight: 0, seat: BED_SEAT, approach: BED_APPROACH, exit: BED_APPROACH }]
  }),
  item({
    renderId: "poster_1", itemId: "room_v3_poster_oyun_bunny", category: "wallDecor", placementSurface: "wall",
    blocksMovement: true, collisionPolygon: square(TABLE_CENTER, 0.5)
  })
]

test("walkable cells are on the drawn floor and outside blocking floor furniture", () => {
  const empty = createRoomPetMapFromRoom({ projection: PROJECTION, furniture: [] })
  const furnished = createRoomPetMapFromRoom({ projection: PROJECTION, furniture: FURNITURE })
  assert.ok(empty.cells.length > 50)
  for (const cell of furnished.cells) {
    const center = getRoomV2FloorGridCellPoint(PROJECTION, cell.column, cell.row)
    assert.ok(isRoomV2FloorGridPointOnFloor(PROJECTION, center.x, center.y))
  }
  assert.ok(!furnished.walkableKeys.has(roomPetCellKey({ column: MIDDLE_COLUMN, row: MIDDLE_ROW })))
  // the table removes a few cells; the wall poster removes none
  const removed = empty.cells.length - furnished.cells.length
  assert.ok(removed >= 1 && removed < 10, `removed ${removed}`)
})

test("rugs become sleep spots on a covered cell and beds become perches at their approach cell", () => {
  const map = createRoomPetMapFromRoom({ projection: PROJECTION, furniture: FURNITURE })
  const rug = map.spots.find((spot) => spot.id === "rug_1")
  const bed = map.spots.find((spot) => spot.id === "bed_1")
  assert.ok(rug && bed)
  assert.equal(rug.kind, "rug")
  assert.deepEqual(rug.cell, getRoomPetCellAtStagePoint(PROJECTION, RUG_CENTER))
  assert.equal(bed.kind, "bed")
  assert.deepEqual(bed.cell, getRoomPetCellAtStagePoint(PROJECTION, BED_APPROACH))
  assert.deepEqual(bed.perchAnchor, BED_SEAT)
  assert.equal(map.spots.length, 2, "table and poster are not spots")
  for (const spot of map.spots) assert.ok(map.walkableKeys.has(roomPetCellKey(spot.cell)))
})

test("a seat piece that is not a bed is a sofa perch", () => {
  const sofa = item({
    renderId: "sofa_1", itemId: "room_v3_sofa_japon_cream", category: "seating", interactionType: "seat",
    seatWorldPoints: [{ id: "left", facing: "front", seatHeight: 0, seat: BED_SEAT, approach: BED_APPROACH, exit: BED_APPROACH }]
  })
  const map = createRoomPetMapFromRoom({ projection: PROJECTION, furniture: [sofa] })
  assert.equal(map.spots[0]?.kind, "sofa")
})

const SHELL_CANVAS_WIDTH = 1254
const PET_HALF_WIDTH = getRoomPetDrawnHalfWidth(ROOM_PET_CAT_WHITE_SHEET_LAYOUT, SHELL_CANVAS_WIDTH)

function visibleStageFor(viewportWidth: number): RoomPetVisibleStage {
  const metrics = resolveMyRoomLayoutMetrics({
    viewportWidth,
    contentWidth: viewportWidth,
    availableContentHeight: 760,
    bottomContentInset: 90,
    camera: resolveRoomV2MyRoomCamera(undefined)
  })
  return { ...getMyRoomVisibleStageXRange(metrics.rendererScalePercent), petHalfWidth: PET_HALF_WIDTH }
}

function isPetOnScreen(visible: RoomPetVisibleStage, x: number): boolean {
  return x - visible.petHalfWidth >= visible.minX - 1e-9 && x + visible.petHalfWidth <= visible.maxX + 1e-9
}

function cellX(cell: RoomPetCell): number {
  return getRoomV2FloorGridCellPoint(PROJECTION, cell.column, cell.row).x
}

/** A bed in the far right floor corner, which the phone card cuts off. */
function cornerBed(): RoomV2FurnitureRenderItem {
  const corner = PROJECTION.outline.reduce((best, point) => (point.x > best.x ? point : best))
  const approach = { x: corner.x - 0.06, y: corner.y }
  return item({
    renderId: "bed_corner", itemId: "room_v3_bed_blumi_starter", category: "seating", interactionType: "seat",
    seatWorldPoints: [{ id: "lie", facing: "front", seatHeight: 0, seat: { x: corner.x - 0.03, y: corner.y - 0.04 }, approach, exit: approach }]
  })
}

test("the phone card cuts off the floor's side corners, so the pet's floor stops where the card does", () => {
  const visible = visibleStageFor(393)
  assert.ok(visible.minX > 0 && visible.maxX < 1, "the portrait card shows only the middle of the shell")
  const wholeFloor = createRoomPetMapFromRoom({ projection: PROJECTION, furniture: FURNITURE })
  assert.ok(wholeFloor.cells.some((cell) => !isPetOnScreen(visible, cellX(cell))), "the drawn floor reaches past the card")
  const map = createRoomPetMapFromRoom({ projection: PROJECTION, furniture: [...FURNITURE, cornerBed()], visibleStage: visible })
  assert.ok(map.cells.length > 30)
  for (const cell of map.cells) {
    const center = getRoomV2FloorGridCellPoint(PROJECTION, cell.column, cell.row)
    assert.ok(isRoomV2FloorGridPointOnFloor(PROJECTION, center.x, center.y))
    assert.ok(isPetOnScreen(visible, center.x), `cell ${roomPetCellKey(cell)} is off screen`)
  }
  assert.ok(!map.spots.some((spot) => spot.id === "bed_corner"), "a bed in a cut-off corner is no perch")
  for (const spot of map.spots) {
    assert.ok(map.walkableKeys.has(roomPetCellKey(spot.cell)))
    if (spot.perchAnchor) assert.ok(isPetOnScreen(visible, spot.perchAnchor.x))
  }
  const wide = visibleStageFor(800)
  assert.deepEqual([wide.minX, wide.maxX], [0, 1], "a wide stage shows the whole shell")
})

test("over a long random room life on a phone every place the pet stands, aims for or walks through is on screen", () => {
  for (const viewportWidth of [320, 393, 430]) {
    const visible = visibleStageFor(viewportWidth)
    const map: RoomPetMap = createRoomPetMapFromRoom({ projection: PROJECTION, furniture: [...FURNITURE, cornerBed()], visibleStage: visible })
    // the owner walks the whole drawn floor, cut-off corners included
    const ownerCells = createRoomPetMapFromRoom({ projection: PROJECTION, furniture: [] }).cells
    let driver = viewportWidth
    const draw = (min: number, max: number): number => {
      const next = drawRoomPetInteger(driver, min, max)
      driver = next.rngState
      return next.value
    }
    const eventsAt = (_tick: number, state: RoomPetState): RoomPetEvent[] => {
      const roll = draw(0, 199)
      const cell = ownerCells[draw(0, ownerCells.length - 1)]
      if (roll === 0) return state.owner ? [{ type: "ownerLeft" }] : [{ type: "ownerArrived", cell }]
      if (roll < 4 && state.owner) return [{ type: "ownerMoved", cell }]
      if (roll === 4 && state.owner) return [{ type: "ownerSat", cell, seatFurnitureId: "bed_1" }]
      if (roll === 5 && state.owner) return [{ type: "ownerStood", cell }]
      if (roll === 6) return [{ type: "tap" }]
      return []
    }
    const run = runTestRoomPet({ map, seed: viewportWidth, ticks: 20000, eventsAt, keepStates: true })
    run.states.forEach((state, index) => {
      const output = run.outputs[index]
      const where = `width ${viewportWidth}, tick ${index}`
      assert.ok(isPetOnScreen(visible, cellX(output.cell)), `${where}: stands off screen`)
      assert.ok(isPetOnScreen(visible, cellX(output.targetCell)), `${where}: aims off screen`)
      assert.ok(state.path.every((cell) => isPetOnScreen(visible, cellX(cell))), `${where}: walks off screen`)
      const perch = output.perchSpotId ? map.spots.find((spot) => spot.id === output.perchSpotId) : undefined
      if (perch?.perchAnchor) assert.ok(isPetOnScreen(visible, perch.perchAnchor.x), `${where}: perched off screen`)
    })
  }
})
