import {
  deriveRoomWorldFacing,
  isRoomWorldPointWalkable,
  type RoomWorldFacing,
  type RoomWorldGeometry,
  type RoomWorldPoint
} from "../../roomWorld/roomWorldGeometry"
import {
  ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
  ROOM_WORLD_AVATAR_PERSONAL_SPACE_RADIUS
} from "../../roomWorld/roomWorldRuntime"

/** Sideways distance that keeps a standing avatar out of the seat's approach/exit lane. */
export const MINI_ROOM_REFUSED_SEAT_SIDE_OFFSET =
  ROOM_WORLD_AVATAR_PERSONAL_SPACE_RADIUS * 2 + ROOM_WORLD_AVATAR_COLLISION_CLEARANCE

/**
 * Where an avatar waits after the server refused its claim on a seat the
 * partner holds: beside the seat's approach point, facing the seat. Standing
 * on the approach point itself would block the sitter's exit lane (the exit
 * point lies further along the same line), so the avatar steps to one side.
 * Data-driven from the seat rig (seat + approach), never furniture ids, and
 * deterministic from shared room data, so both phones agree.
 */
export function resolveMiniRoomRefusedSeatStand(input: {
  geometry: RoomWorldGeometry
  seat: RoomWorldPoint
  approach?: RoomWorldPoint
}): { point: RoomWorldPoint; facing: RoomWorldFacing } {
  const approach = input.approach ?? input.seat
  const laneX = approach.x - input.seat.x
  const laneY = approach.y - input.seat.y
  const length = Math.hypot(laneX, laneY)
  const side = length > 0 ? { x: -laneY / length, y: laneX / length } : { x: 1, y: 0 }
  const offset = MINI_ROOM_REFUSED_SEAT_SIDE_OFFSET
  const candidates = [
    { x: approach.x + side.x * offset, y: approach.y + side.y * offset },
    { x: approach.x - side.x * offset, y: approach.y - side.y * offset },
    approach
  ]
  const point = candidates.find((candidate) => isRoomWorldPointWalkable(input.geometry, candidate, {
    clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE
  })) ?? approach
  return { point, facing: deriveRoomWorldFacing(point, input.seat) }
}
