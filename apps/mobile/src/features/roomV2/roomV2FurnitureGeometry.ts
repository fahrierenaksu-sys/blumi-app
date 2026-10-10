import type {
  FurnitureItem,
  RoomAnchor,
  RoomFootprint,
  RoomFurnitureDirectionalVisual,
  RoomFurnitureRotation,
  RoomFurnitureVisualContract,
  RoomSeatSpec,
  RoomV2SeatWorldPoint
} from "./roomV2.types"

/**
 * Shared furniture geometry for every room piece: rotation-aware footprints,
 * seat routes and directional visuals. Moved unchanged from the retired
 * Room V3 / VNext candidate contracts.
 */

/** The canonical avatar is 170 cm tall in the 0.30 normalized room stage. */
export const ROOM_STAGE_UNITS_PER_CM = 0.3 / 170
export const ROOM_FLOOR_DEPTH_UNITS_PER_CM = 0.075 / 100

export function getFurnitureFootprintForRotation(
  item: FurnitureItem,
  rotation: RoomFurnitureRotation
): RoomFootprint | undefined {
  return item.footprintByRotation?.[rotation] ?? item.footprint
}

/**
 * Placement uses the visible furniture contact base, while avatar movement
 * keeps using the larger physical blocker returned above.
 */
export function getFurniturePlacementFootprintForRotation(
  item: FurnitureItem,
  rotation: RoomFurnitureRotation
): RoomFootprint | undefined {
  return item.placementFootprintByRotation?.[rotation] ?? item.placementFootprint
}

export function getFurnitureSeatPoints(input: {
  seatSpec?: RoomSeatSpec
  x: number
  y: number
  width: number
  height: number
  rotation: RoomFurnitureRotation
  physicalSizeCm?: { width: number; depth: number; height: number }
}): RoomV2SeatWorldPoint[] {
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

export function getFurnitureDirectionalVisual(
  contract: RoomFurnitureVisualContract,
  direction: RoomFurnitureRotation
): RoomFurnitureDirectionalVisual | undefined {
  return contract.directions?.[direction]
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
      x: roundRoomCoordinate(input.x + local.x * ROOM_STAGE_UNITS_PER_CM),
      y: roundRoomCoordinate(input.y + local.y * ROOM_FLOOR_DEPTH_UNITS_PER_CM)
    }
  }
  const point = normalizedPoint ?? { x: 0, y: 0 }
  const local = rotatePoint(point, input.rotation)
  return {
    x: roundRoomCoordinate(input.x + local.x * input.width),
    y: roundRoomCoordinate(input.y + local.y * input.height)
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

function roundRoomCoordinate(value: number): number {
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
