import type {
  FurnitureItem,
  RoomAnchor,
  RoomFootprint,
  RoomFurnitureRotation,
  RoomSeatSpec,
  RoomShell,
  UserRoomDecor,
  RoomV2SeatWorldPoint
} from "./roomV2.types"
import {
  ROOM_VNEXT_FLOOR_DEPTH_UNITS_PER_CM,
  ROOM_VNEXT_CANONICAL_STAGE_UNITS_PER_CM
} from "./roomVNextScale"

export const ROOM_V3_DECOR_SCHEMA_VERSION = 3

export type RoomV3SeatPointWorldPosition = RoomV2SeatWorldPoint

export function getRoomV3FootprintForRotation(
  item: FurnitureItem,
  rotation: RoomFurnitureRotation
): RoomFootprint | undefined {
  return item.footprintByRotation?.[rotation] ?? item.footprint
}

/**
 * Placement uses the visible furniture contact base, while avatar movement
 * keeps using the larger physical blocker returned above.
 */
export function getRoomV3PlacementFootprintForRotation(
  item: FurnitureItem,
  rotation: RoomFurnitureRotation
): RoomFootprint | undefined {
  return item.placementFootprintByRotation?.[rotation] ?? item.placementFootprint
}

export function getRoomV3SeatPoints(input: {
  seatSpec?: RoomSeatSpec
  x: number
  y: number
  width: number
  height: number
  rotation: RoomFurnitureRotation
  physicalSizeCm?: { width: number; depth: number; height: number }
}): RoomV3SeatPointWorldPosition[] {
  const { seatSpec } = input
  if (
    !seatSpec ||
    seatSpec.capacity !== seatSpec.seatPoints.length ||
    seatSpec.seatPoints.some(
      (seatPoint) =>
        (!seatPoint.approachPoint && !seatPoint.approachPointCm) ||
        (!seatPoint.exitPoint && !seatPoint.exitPointCm) ||
        !Number.isFinite(seatPoint.seatHeight)
    )
  ) return []

  return seatSpec.seatPoints.map((seatPoint) => ({
    id: seatPoint.id,
    facing: rotateFacing(seatPoint.facing ?? "front", input.rotation),
    seatHeight: seatPoint.seatHeight!,
    seat: toWorldPoint(input, seatPoint.localPositionCm, { x: seatPoint.x, y: seatPoint.y }),
    approach: toWorldPoint(input, seatPoint.approachPointCm, seatPoint.approachPoint),
    exit: toWorldPoint(input, seatPoint.exitPointCm, seatPoint.exitPoint)
  }))
}

export function migrateRoomV2DecorToV3(input: {
  decor: UserRoomDecor
  targetShell: RoomShell
}): UserRoomDecor {
  const targetGeometryVersion = input.targetShell.geometryVersion ?? "room_v2"
  if (
    input.decor.schemaVersion === ROOM_V3_DECOR_SCHEMA_VERSION &&
    input.decor.geometryVersion === targetGeometryVersion &&
    input.decor.roomShellId === input.targetShell.id
  ) {
    return {
      ...input.decor,
      ...(input.decor.migration
        ? { migration: { ...input.decor.migration } }
        : {}),
      placedItems: input.decor.placedItems.map((item) => ({ ...item }))
    }
  }

  const fromSchemaVersion = input.decor.schemaVersion ?? 2
  return {
    schemaVersion: ROOM_V3_DECOR_SCHEMA_VERSION,
    geometryVersion: targetGeometryVersion,
    migration: {
      fromSchemaVersion,
      sourceShellId: input.decor.roomShellId
    },
    roomShellId: input.targetShell.id,
    placedItems: input.decor.placedItems.map((item) => ({ ...item }))
  }
}

function toWorldPoint(input: {
  x: number
  y: number
  width: number
  height: number
  rotation: RoomFurnitureRotation
  physicalSizeCm?: { width: number; depth: number; height: number }
}, physicalPointCm?: { x: number; y: number }, normalizedPoint?: RoomAnchor): RoomAnchor {
  if (physicalPointCm && input.physicalSizeCm) {
    const local = rotatePhysicalPoint(physicalPointCm, input.rotation)
    return {
      x: roundRoomV3Coordinate(input.x + local.x * ROOM_VNEXT_CANONICAL_STAGE_UNITS_PER_CM),
      y: roundRoomV3Coordinate(input.y + local.y * ROOM_VNEXT_FLOOR_DEPTH_UNITS_PER_CM)
    }
  }
  const point = normalizedPoint ?? { x: 0, y: 0 }
  const local = rotatePoint(point, input.rotation)
  return {
    x: roundRoomV3Coordinate(input.x + local.x * input.width),
    y: roundRoomV3Coordinate(input.y + local.y * input.height)
  }
}

function rotatePhysicalPoint(
  point: { x: number; y: number },
  rotation: RoomFurnitureRotation
): { x: number; y: number } {
  if (rotation === "back") return { x: -point.x, y: -point.y }
  if (rotation === "left") return { x: point.y, y: -point.x }
  if (rotation === "right") return { x: -point.y, y: point.x }
  return { ...point }
}

function roundRoomV3Coordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function rotatePoint(
  point: RoomAnchor,
  rotation: RoomFurnitureRotation
): RoomAnchor {
  if (rotation === "back") return { x: -point.x, y: -point.y }
  if (rotation === "left") return { x: point.y, y: -point.x }
  if (rotation === "right") return { x: -point.y, y: point.x }
  return { ...point }
}

function rotateFacing(
  facing: RoomFurnitureRotation,
  rotation: RoomFurnitureRotation
): RoomFurnitureRotation {
  const directions: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
  const facingIndex = directions.indexOf(facing)
  const rotationIndex = directions.indexOf(rotation)
  return directions[(facingIndex + rotationIndex) % directions.length]
}
