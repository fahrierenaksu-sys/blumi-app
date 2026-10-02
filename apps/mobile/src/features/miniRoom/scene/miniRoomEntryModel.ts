import {
  deriveRoomWorldFacing,
  type RoomWorldGeometry,
  type RoomWorldPoint
} from "../../roomWorld/roomWorldGeometry"
import {
  combineRoomWorldMovementPlans,
  createRoomWorldMovementPlan,
  type RoomWorldMovementPlan,
  type RoomWorldMovementSegment,
  type RoomWorldMovementTiming,
  type RoomWorldOccupant
} from "../../roomWorld/roomWorldRuntime"
import type { RoomShellEntry } from "../../roomV2/roomV2.types"

/**
 * The partner's walk in (local presentation only): from the shell's door
 * threshold onto the doorstep, then the ordinary floor route to `to`, the
 * authoritative position. One walk with one speed and one start and stop
 * ramp, so it reads like any other step. Null when the route is blocked
 * (furniture in front of the door): the scene then fades the partner in at
 * `to` instead.
 */
export function createMiniRoomEntryPlan(input: {
  geometry: RoomWorldGeometry
  entry: RoomShellEntry
  to: RoomWorldPoint
  timing: RoomWorldMovementTiming
  clearance: number
  occupants?: RoomWorldOccupant[]
  movingOccupantId?: string
}): RoomWorldMovementPlan | null {
  const { door, doorstep } = input.entry
  const floorRoute = createRoomWorldMovementPlan({
    geometry: input.geometry,
    from: doorstep,
    to: input.to,
    clearance: input.clearance,
    timing: input.timing,
    occupants: input.occupants,
    movingOccupantId: input.movingOccupantId
  })
  if (!floorRoute) return null
  const threshold: RoomWorldMovementSegment = {
    from: { x: door.x, y: door.y },
    to: { x: doorstep.x, y: doorstep.y },
    facing: deriveRoomWorldFacing(door, doorstep),
    distance: Math.hypot(doorstep.x - door.x, doorstep.y - door.y),
    durationMs: 0,
    isFinal: false
  }
  return combineRoomWorldMovementPlans([
    { target: { x: doorstep.x, y: doorstep.y }, path: [{ x: doorstep.x, y: doorstep.y }], segments: [threshold], timing: input.timing },
    floorRoute
  ])
}
