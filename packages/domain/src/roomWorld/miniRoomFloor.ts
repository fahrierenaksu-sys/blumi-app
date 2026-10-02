import { ROOM_BLUMI_WORLD_FLOOR_GRID } from "./roomFloorGrid"
import {
  pointInRoomWorldPolygon,
  projectRoomWorldPointToPolygon,
  type RoomWorldPoint
} from "./roomWorldGeometry"

/**
 * The original shared-room walk polygon: a coarse heptagon that hangs past
 * the drawn floor's front lip and stops short of its side corners. Kept so
 * targets from clients that still walk it stay valid.
 */
export const MINI_ROOM_FLOOR: RoomWorldPoint[] = [
  { x: .48, y: .42 }, { x: .8, y: .55 }, { x: .83, y: .72 },
  { x: .7, y: .9 }, { x: .3, y: .9 }, { x: .17, y: .72 }, { x: .2, y: .55 }
]

/**
 * Every floor a shared-room walk target may lie on: the measured Blumi Home
 * floor that clients now walk (createRoomWorldFloorGeometry) and the legacy
 * polygon older clients still send.
 */
export const MINI_ROOM_WALK_FLOORS: readonly (readonly RoomWorldPoint[])[] = [
  ROOM_BLUMI_WORLD_FLOOR_GRID.outline,
  MINI_ROOM_FLOOR
]

export function isPointOnMiniRoomFloor(point: RoomWorldPoint): boolean {
  return MINI_ROOM_WALK_FLOORS.some((floor) => pointInRoomWorldPolygon(point, [...floor]))
}

/** Distance from a point to the nearest shared-room floor (0 when on one). */
export function getMiniRoomFloorDistance(point: RoomWorldPoint): number {
  if (isPointOnMiniRoomFloor(point)) return 0
  return Math.min(...MINI_ROOM_WALK_FLOORS.map((floor) => {
    const nearest = projectRoomWorldPointToPolygon(point, [...floor])
    return Math.hypot(nearest.x - point.x, nearest.y - point.y)
  }))
}
