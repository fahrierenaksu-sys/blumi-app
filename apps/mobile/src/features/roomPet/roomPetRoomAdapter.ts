import type { RoomPoint2D, RoomV2FurnitureRenderItem } from "../roomV2/roomV2.types"
import {
  getRoomV2FloorGridCellPoint,
  isRoomV2FloorGridPointOnFloor,
  snapRoomV2FloorGridCell,
  type RoomV2FloorGridProjection
} from "../roomV2/roomV2FloorGrid"
import type { RoomPetCell, RoomPetMap, RoomPetSpot, RoomPetSpotKind } from "./roomPet.types"
import { createRoomPetMap, findNearestFreeRoomPetCell, roomPetCellKey } from "./roomPetGrid"

/**
 * Reads the room the pet lives in from the existing room model (the floor
 * grid projection and the furniture render items) without changing either.
 *
 * - Walkable: a lattice cell whose centre is on the drawn floor and outside
 *   every floor piece that blocks movement (its calibrated collision polygon).
 * - Rug: a sleep spot on the covered cell nearest the rug's middle.
 * - Bed / sofa: a perch spot at the first seat's approach cell; the renderer
 *   draws the perched pet on the seat's cushion centre (the hip point when a
 *   seat has no cushion data) and depth-sorts it by the floor point under it.
 */

/** Rugs without a polygon: the inner part of the drawn rectangle counts as covered. */
const RUG_RECT_INSET = 0.18
const BED_ID_MARKER = "_bed_"

function isPointInPolygon(point: RoomPoint2D, polygon: readonly RoomPoint2D[]): boolean {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current]
    const b = polygon[previous]
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function isFloorPiece(item: RoomV2FurnitureRenderItem): boolean {
  return (item.placementSurface ?? "floor") === "floor"
}

function getBlockingPolygon(item: RoomV2FurnitureRenderItem): readonly RoomPoint2D[] | null {
  if (!item.blocksMovement || !isFloorPiece(item)) return null
  const polygon = item.collisionPolygon ?? item.placementPolygon
  return polygon && polygon.length >= 3 ? polygon : null
}

function getRugContains(item: RoomV2FurnitureRenderItem): (point: RoomPoint2D) => boolean {
  const polygon = item.placementPolygon ?? item.collisionPolygon
  if (polygon && polygon.length >= 3) return (point) => isPointInPolygon(point, polygon)
  const left = item.x - item.anchor.x * item.width
  const top = item.y - item.anchor.y * item.height
  const insetX = item.width * RUG_RECT_INSET
  const insetY = item.height * RUG_RECT_INSET
  return (point) =>
    point.x >= left + insetX && point.x <= left + item.width - insetX &&
    point.y >= top + insetY && point.y <= top + item.height - insetY
}

/** The pet cell under a stage point (an avatar's position, a seat's approach). */
export function getRoomPetCellAtStagePoint(projection: RoomV2FloorGridProjection, point: RoomPoint2D): RoomPetCell {
  return snapRoomV2FloorGridCell(projection, point.x, point.y)
}

function collectWalkableCells(
  projection: RoomV2FloorGridProjection,
  blockers: readonly (readonly RoomPoint2D[])[]
): { cell: RoomPetCell; center: RoomPoint2D }[] {
  const cells: { cell: RoomPetCell; center: RoomPoint2D }[] = []
  for (let row = projection.minRow; row <= projection.maxRow; row += 1) {
    for (let column = projection.minColumn; column <= projection.maxColumn; column += 1) {
      const center = getRoomV2FloorGridCellPoint(projection, column, row)
      if (!isRoomV2FloorGridPointOnFloor(projection, center.x, center.y)) continue
      if (blockers.some((polygon) => isPointInPolygon(center, polygon))) continue
      cells.push({ cell: { column, row }, center })
    }
  }
  return cells
}

function getSpotKind(item: RoomV2FurnitureRenderItem): RoomPetSpotKind | null {
  if (!isFloorPiece(item)) return null
  if (item.category === "rug") return "rug"
  if (!item.seatWorldPoints || item.seatWorldPoints.length === 0) return null
  return item.itemId.includes(BED_ID_MARKER) ? "bed" : "sofa"
}

function getRugSpotCell(
  item: RoomV2FurnitureRenderItem,
  walkable: readonly { cell: RoomPetCell; center: RoomPoint2D }[]
): RoomPetCell | null {
  const contains = getRugContains(item)
  const covered = walkable.filter((entry) => contains(entry.center))
  if (covered.length === 0) return null
  const middle = { x: item.x, y: item.y }
  const distance = (point: RoomPoint2D): number => (point.x - middle.x) ** 2 + (point.y - middle.y) ** 2
  return covered.reduce((best, entry) => (distance(entry.center) < distance(best.center) ? entry : best)).cell
}

function toSpot(
  item: RoomV2FurnitureRenderItem,
  projection: RoomV2FloorGridProjection,
  map: RoomPetMap,
  walkable: readonly { cell: RoomPetCell; center: RoomPoint2D }[]
): RoomPetSpot | null {
  const kind = getSpotKind(item)
  if (!kind) return null
  if (kind === "rug") {
    const cell = getRugSpotCell(item, walkable)
    return cell ? { id: item.renderId, kind, cell } : null
  }
  const seat = item.seatWorldPoints?.[0]
  if (!seat) return null
  const snapped = getRoomPetCellAtStagePoint(projection, seat.approach)
  const cell = map.walkableKeys.has(roomPetCellKey(snapped))
    ? snapped
    : findNearestFreeRoomPetCell(map, snapped, new Set())
  const perchAnchor = seat.cushion ?? { x: seat.seat.x, y: seat.seat.y - seat.seatHeight }
  const perchFloor = { x: perchAnchor.x, y: perchAnchor.y + seat.seatHeight }
  return cell ? { id: item.renderId, kind, cell, perchAnchor: { x: perchAnchor.x, y: perchAnchor.y }, perchFloor } : null
}

export function createRoomPetMapFromRoom(input: {
  readonly projection: RoomV2FloorGridProjection
  readonly furniture: readonly RoomV2FurnitureRenderItem[]
}): RoomPetMap {
  const blockers = input.furniture
    .map(getBlockingPolygon)
    .filter((polygon): polygon is readonly RoomPoint2D[] => polygon !== null)
  const walkable = collectWalkableCells(input.projection, blockers)
  const floorOnly = createRoomPetMap(walkable.map((entry) => entry.cell), [])
  const spots = input.furniture
    .map((item) => toSpot(item, input.projection, floorOnly, walkable))
    .filter((spot): spot is RoomPetSpot => spot !== null)
  return createRoomPetMap(floorOnly.cells, spots)
}
