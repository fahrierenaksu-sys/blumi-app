import {
  isRoomWorldPointNearBlockerExact,
  isRoomWorldPointWalkableExact,
  isRoomWorldSegmentClearExact,
  resolveRoomWorldNavigationPath,
  type RoomWorldFloorLattice,
  type RoomWorldMetric
} from "./roomFloorNavigation"
import type { RoomFloorGrid } from "./roomFloorGrid"

export type RoomWorldFacing = "front" | "back" | "left" | "right"

export const ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON = 0.002

export interface RoomWorldPoint {
  x: number
  y: number
}

export interface RoomWorldAnchor {
  x: number
  y: number
}

export interface RoomWorldWalkableArea {
  id: string
  points: RoomWorldPoint[]
}

export interface RoomWorldBlocker {
  id?: string
  x: number
  y: number
  width: number
  height: number
  anchor?: RoomWorldAnchor
  /** Optional calibrated physical polygon. Bounds remain as a legacy fallback. */
  polygon?: RoomWorldPoint[]
  blocksMovement?: boolean
}

export interface RoomWorldGeometry {
  walkableAreas: RoomWorldWalkableArea[]
  blockers?: RoomWorldBlocker[]
  /** The walk lattice (a measured floor grid); derived from the walkable bounds when absent. */
  floor?: RoomWorldFloorLattice
  /** Per-axis distance scale (the canvas proportions); 1:1 when absent. */
  metric?: RoomWorldMetric
  /** Distance kept from the walkable area's edge, in metric units; 0 when absent. */
  edgeMargin?: number
}

/**
 * Distance the avatar's feet keep from the drawn floor's edge on a measured
 * floor, in canvas widths (about 15 px on the 1254 px canvas): feet never
 * stand on the floor's lip.
 */
export const ROOM_WORLD_FLOOR_EDGE_MARGIN = 0.012

/** Walk lattice nodes per placement cell along each axis. */
export const ROOM_WORLD_WALK_NODES_PER_CELL = 2

/**
 * The walkable floor of a shell with a measured floor grid: the drawn floor
 * outline, the half-tile lattice for paths and the canvas proportions for
 * distances. One model for My Room, MiniRoom and the server.
 */
export function createRoomWorldFloorGeometry(
  grid: RoomFloorGrid,
  canvas: { width: number; height: number }
): Required<Pick<RoomWorldGeometry, "walkableAreas" | "floor" | "metric" | "edgeMargin">> {
  return {
    walkableAreas: [{
      id: grid.id,
      points: grid.outline.map((point) => ({ x: point.x, y: point.y }))
    }],
    floor: {
      corners: grid.latticeCorners,
      // Two walk nodes per placement cell (quarter tiles): a gap between two
      // pieces of furniture narrower than a half tile is still found.
      divisions: grid.latticeSpan * grid.cellsPerTile * ROOM_WORLD_WALK_NODES_PER_CELL
    },
    metric: { x: 1, y: canvas.height / canvas.width },
    edgeMargin: ROOM_WORLD_FLOOR_EDGE_MARGIN
  }
}

export type RoomWorldHotspotKind = "seat" | "stand" | "activity"

export interface RoomWorldHotspot {
  id: string
  /** Stable furniture-local seat identifier used by the avatar rig. */
  seatId?: string
  kind: RoomWorldHotspotKind
  x: number
  y: number
  facing?: RoomWorldFacing
  /** Normalized furniture-local seat height for avatar sitting alignment. */
  seatHeight?: number
  /** Render depth used after arrival; navigation y and draw order are distinct. */
  renderDepth?: number
  approachPoint?: RoomWorldPoint
  exitPoint?: RoomWorldPoint
  sourceRenderId?: string
}

export interface RoomWorldBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type RoomWorldPath = RoomWorldPoint[]

export interface RoomWorldClearanceOptions {
  clearance?: number
}

const DEFAULT_BLOCKER_ANCHOR: RoomWorldAnchor = { x: 0.5, y: 1 }

export function pointInRoomWorldPolygon(
  point: RoomWorldPoint,
  polygon: RoomWorldPoint[]
): boolean {
  let inside = false
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const currentPoint = polygon[current]
    const previousPoint = polygon[previous]
    if (isPointOnRoomWorldSegment(previousPoint, point, currentPoint)) {
      return true
    }
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x
    if (crosses) inside = !inside
  }
  return inside
}

function isPointOnRoomWorldSegment(
  start: RoomWorldPoint,
  point: RoomWorldPoint,
  end: RoomWorldPoint
): boolean {
  const cross = (point.x - start.x) * (end.y - start.y) -
    (point.y - start.y) * (end.x - start.x)
  if (Math.abs(cross) > 0.0000001) return false
  return point.x >= Math.min(start.x, end.x) - 0.0000001 &&
    point.x <= Math.max(start.x, end.x) + 0.0000001 &&
    point.y >= Math.min(start.y, end.y) - 0.0000001 &&
    point.y <= Math.max(start.y, end.y) + 0.0000001
}

export function projectRoomWorldPointToPolygon(
  point: RoomWorldPoint,
  polygon: RoomWorldPoint[]
): RoomWorldPoint {
  if (polygon.length < 3 || pointInRoomWorldPolygon(point, polygon)) {
    return point
  }

  let nearestPoint = polygon[0]
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const candidate = getNearestPointOnRoomWorldSegment(point, start, end)
    const distance = getRoomWorldPointDistanceSquared(point, candidate)
    if (distance < nearestDistance) {
      nearestPoint = candidate
      nearestDistance = distance
    }
  }
  return nearestPoint
}

export function getRoomWorldBlockerBounds(
  blocker: RoomWorldBlocker
): RoomWorldBounds {
  if (blocker.polygon && blocker.polygon.length > 0) {
    return {
      minX: Math.min(...blocker.polygon.map((point) => point.x)),
      maxX: Math.max(...blocker.polygon.map((point) => point.x)),
      minY: Math.min(...blocker.polygon.map((point) => point.y)),
      maxY: Math.max(...blocker.polygon.map((point) => point.y))
    }
  }
  const anchor = blocker.anchor ?? DEFAULT_BLOCKER_ANCHOR
  const minX = blocker.x - blocker.width * anchor.x
  const minY = blocker.y - blocker.height * anchor.y
  return {
    minX,
    maxX: minX + blocker.width,
    minY,
    maxY: minY + blocker.height
  }
}

export function isRoomWorldPointInsideBlocker(
  point: RoomWorldPoint,
  blocker: RoomWorldBlocker,
  options?: RoomWorldClearanceOptions
): boolean {
  // The calibrated polygon (else the bounds) is the contact shape; clearance
  // is an exact distance from it, never its inflated bounding box.
  return isRoomWorldPointNearBlockerExact(point, blocker, getRoomWorldClearance(options))
}

/** Returns true when two calibrated convex/concave world polygons overlap. */
export function doRoomWorldPolygonsOverlap(
  left: readonly RoomWorldPoint[],
  right: readonly RoomWorldPoint[]
): boolean {
  if (left.length < 3 || right.length < 3) return false
  if (left.some((point) => pointInRoomWorldPolygon(point, [...right])) ||
      right.some((point) => pointInRoomWorldPolygon(point, [...left]))) {
    return true
  }
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const leftStart = left[leftIndex]
    const leftEnd = left[(leftIndex + 1) % left.length]
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const rightStart = right[rightIndex]
      const rightEnd = right[(rightIndex + 1) % right.length]
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return true
      }
    }
  }
  return false
}

function segmentsIntersect(
  firstStart: RoomWorldPoint,
  firstEnd: RoomWorldPoint,
  secondStart: RoomWorldPoint,
  secondEnd: RoomWorldPoint
): boolean {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart)
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd)
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart)
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd)
  if (firstOrientation === 0 && onSegment(firstStart, secondStart, firstEnd)) return true
  if (secondOrientation === 0 && onSegment(firstStart, secondEnd, firstEnd)) return true
  if (thirdOrientation === 0 && onSegment(secondStart, firstStart, secondEnd)) return true
  if (fourthOrientation === 0 && onSegment(secondStart, firstEnd, secondEnd)) return true
  return firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation
}

function orientation(
  first: RoomWorldPoint,
  second: RoomWorldPoint,
  third: RoomWorldPoint
): -1 | 0 | 1 {
  const value = (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  if (Math.abs(value) <= 0.0000001) return 0
  return value < 0 ? -1 : 1
}

function onSegment(
  start: RoomWorldPoint,
  point: RoomWorldPoint,
  end: RoomWorldPoint
): boolean {
  return point.x >= Math.min(start.x, end.x) - 0.0000001 &&
    point.x <= Math.max(start.x, end.x) + 0.0000001 &&
    point.y >= Math.min(start.y, end.y) - 0.0000001 &&
    point.y <= Math.max(start.y, end.y) + 0.0000001
}

export function isRoomWorldPointWalkable(
  geometry: RoomWorldGeometry,
  point: RoomWorldPoint,
  options?: RoomWorldClearanceOptions
): boolean {
  return isRoomWorldPointWalkableExact(geometry, point, getRoomWorldClearance(options))
}

export function omitRoomWorldBlockers(
  geometry: RoomWorldGeometry,
  blockerIds: string[]
): RoomWorldGeometry {
  if (!blockerIds.length || !geometry.blockers?.length) return geometry
  const ignoredBlockerIds = new Set(blockerIds)
  return {
    ...geometry,
    blockers: geometry.blockers.filter((blocker) =>
      !blocker.id || !ignoredBlockerIds.has(blocker.id)
    )
  }
}

/** Whether every point of the segment is walkable (exact, not sampled). */
export function isRoomWorldSegmentClear(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  to: RoomWorldPoint
  /** Ignored: kept for callers of the sampled check this replaced. */
  steps?: number
  clearance?: number
}): boolean {
  return isRoomWorldSegmentClearExact(input.geometry, input.from, input.to, getRoomWorldClearance(input))
}

/**
 * The points to walk through after `from`, ending exactly at `to`; null when
 * `to` is not walkable or not reachable. A* over the floor lattice with
 * string pulling (roomFloorNavigation): deterministic, so both phones of a
 * shared room plan the same walk.
 */
export function resolveRoomWorldPath(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  to: RoomWorldPoint
  clearance?: number
}): RoomWorldPath | null {
  return resolveRoomWorldNavigationPath({
    geometry: input.geometry,
    from: input.from,
    to: input.to,
    clearance: getRoomWorldClearance(input)
  })
}

export function deriveRoomWorldFacing(
  from: RoomWorldPoint,
  to: RoomWorldPoint
): RoomWorldFacing {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left"
  }
  return dy >= 0 ? "front" : "back"
}

function getRoomWorldClearance(options?: RoomWorldClearanceOptions): number {
  return Math.max(0, options?.clearance ?? 0)
}

function getNearestPointOnRoomWorldSegment(
  point: RoomWorldPoint,
  start: RoomWorldPoint,
  end: RoomWorldPoint
): RoomWorldPoint {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 0) return start
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  )
  return {
    x: start.x + dx * t,
    y: start.y + dy * t
  }
}

function getRoomWorldPointDistanceSquared(
  a: RoomWorldPoint,
  b: RoomWorldPoint
): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
