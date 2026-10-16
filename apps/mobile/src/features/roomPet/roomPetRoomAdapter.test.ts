import assert from "node:assert/strict"
import test from "node:test"

import type { RoomPoint2D, RoomV2FurnitureRenderItem } from "../roomV2/roomV2.types"
import {
  createRoomV2FloorGridProjection,
  getRoomV2FloorGridCellPoint,
  isRoomV2FloorGridPointOnFloor,
  ROOM_V2_BLUMI_WORLD_FLOOR_GRID
} from "../roomV2/roomV2FloorGrid"
import { roomPetCellKey } from "./roomPetGrid"
import { createRoomPetMapFromRoom, getRoomPetCellAtStagePoint } from "./roomPetRoomAdapter"

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
