import type { ResolvedRoomV2Scene, RoomPoint2D, RoomV2SeatWorldPoint } from "../roomV2/roomV2.types"
import { getRoomWorldBlockerShape, type RoomWorldPoint } from "./roomWorldGeometry"
import { ROOM_WORLD_AVATAR_COLLISION_CLEARANCE } from "./roomWorldRuntime"

/** The free space she needs around a standing spot (stage metric), as the layered seats' own approach rule uses. */
const SEAT_APPROACH_CLEARANCE = ROOM_WORLD_AVATAR_COLLISION_CLEARANCE * 1.05

export interface SeatApproach {
  approach: RoomPoint2D
  exit: RoomPoint2D
}

/**
 * Where she walks to sit on one seat in this scene. A seat reached from every side (a round pouf) keeps its front
 * spot while it is free; when another piece stands on it (two poufs facing each other, a pouf pushed to a table) she
 * comes from the first free side on the floor instead, and leaves the same way. Every other seat keeps its own spots.
 */
export function resolveSeatApproach(
  seat: RoomV2SeatWorldPoint,
  sourceRenderId: string,
  scene: Pick<ResolvedRoomV2Scene, "renderItems" | "shell">
): SeatApproach {
  const own = { approach: { ...seat.approach }, exit: { ...seat.exit } }
  if (!seat.alternativeApproaches?.length) return own
  const metricY = scene.shell ? scene.shell.canvasSize.height / scene.shell.canvasSize.width : 1
  const others = otherBlockerShapes(scene.renderItems, sourceRenderId)
  const floor = scene.shell?.floorGrid?.outline
  const onFloor = (point: RoomPoint2D) =>
    !floor || (isInsidePolygon(point, floor) && edgeDistance(point, floor, metricY) >= SEAT_APPROACH_CLEARANCE)
  const isFree = (point: RoomPoint2D) =>
    onFloor(point) && others.every((shape) => metricDistanceToPolygon(point, shape, metricY) >= SEAT_APPROACH_CLEARANCE)
  if (isFree(seat.approach)) return own
  const side = seat.alternativeApproaches.find(isFree)
  return side ? { approach: { ...side }, exit: { ...side } } : own
}

function otherBlockerShapes(
  items: ResolvedRoomV2Scene["renderItems"],
  sourceRenderId: string
): RoomWorldPoint[][] {
  return items.flatMap((item) => {
    if (item.kind !== "furniture" || item.renderId === sourceRenderId || !item.blocksMovement) return []
    if ((item.placementSurface ?? "floor") !== "floor") return []
    const size = item.footprint ?? { width: item.width, height: item.height }
    return [getRoomWorldBlockerShape({
      id: item.renderId,
      x: item.x,
      y: item.y,
      width: size.width,
      height: size.height,
      anchor: item.anchor,
      ...(item.collisionPolygon ? { polygon: item.collisionPolygon } : {})
    })]
  })
}

function metricDistanceToPolygon(point: RoomPoint2D, polygon: readonly RoomWorldPoint[], metricY: number): number {
  return isInsidePolygon(point, polygon) ? 0 : edgeDistance(point, polygon, metricY)
}

function edgeDistance(point: RoomPoint2D, polygon: readonly RoomWorldPoint[], metricY: number): number {
  let best = Infinity
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!
    const b = polygon[(index + 1) % polygon.length]!
    const dx = b.x - a.x
    const dy = (b.y - a.y) * metricY
    const px = point.x - a.x
    const py = (point.y - a.y) * metricY
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy))
  }
  return best
}

function isInsidePolygon(point: RoomPoint2D, polygon: readonly RoomWorldPoint[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]!
    const b = polygon[previous]!
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}
