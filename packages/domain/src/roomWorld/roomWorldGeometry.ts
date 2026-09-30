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
const DEFAULT_SEGMENT_STEPS = 12
const DEFAULT_PATH_MARGIN = 0.035

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
  if (blocker.blocksMovement === false) return false
  if (blocker.polygon && blocker.polygon.length >= 3) {
    // The calibrated polygon is the authoritative contact shape. A small
    // clearance still uses the legacy bounds as a conservative path margin;
    // without clearance this avoids reintroducing rectangular false reds.
    if (!options?.clearance) {
      return pointInRoomWorldPolygon(point, blocker.polygon)
    }
  }
  const bounds = getRoomWorldBlockerBounds(blocker)
  const clearance = getRoomWorldClearance(options)
  return (
    point.x >= bounds.minX - clearance &&
    point.x <= bounds.maxX + clearance &&
    point.y >= bounds.minY - clearance &&
    point.y <= bounds.maxY + clearance
  )
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
  const insideWalkableArea = geometry.walkableAreas.some((area) =>
    pointInRoomWorldPolygon(point, area.points)
  )
  if (!insideWalkableArea) return false

  return !(geometry.blockers ?? []).some((blocker) =>
    isRoomWorldPointInsideBlocker(point, blocker, options)
  )
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

export function isRoomWorldSegmentClear(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  to: RoomWorldPoint
  steps?: number
  clearance?: number
}): boolean {
  const steps = Math.max(1, input.steps ?? DEFAULT_SEGMENT_STEPS)
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps
    const point = {
      x: input.from.x + (input.to.x - input.from.x) * progress,
      y: input.from.y + (input.to.y - input.from.y) * progress
    }
    if (
      !isRoomWorldPointWalkable(input.geometry, point, {
        clearance: input.clearance
      })
    ) {
      return false
    }
  }
  return true
}

export function resolveRoomWorldPath(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  to: RoomWorldPoint
  clearance?: number
}): RoomWorldPath | null {
  const clearance = getRoomWorldClearance(input)
  if (!isRoomWorldPointWalkable(input.geometry, input.to, { clearance })) return null
  if (
    isRoomWorldSegmentClear({
      geometry: input.geometry,
      from: input.from,
      to: input.to,
      clearance
    })
  ) {
    return [input.to]
  }

  const candidates = getRoomWorldPathCandidates(input.geometry, { clearance })
  const directWaypoint = findShortestClearPath({
    ...input,
    candidates,
    waypointCount: 1,
    clearance
  })
  if (directWaypoint) return directWaypoint

  return findShortestClearPath({
    ...input,
    candidates,
    waypointCount: 2,
    clearance
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

function getRoomWorldPathCandidates(
  geometry: RoomWorldGeometry,
  options?: RoomWorldClearanceOptions
): RoomWorldPoint[] {
  const clearance = getRoomWorldClearance(options)
  const candidates = (geometry.blockers ?? [])
    .filter((blocker) => blocker.blocksMovement !== false)
    .flatMap((blocker) => getBlockerCornerCandidates(blocker, { clearance }))
    .filter((candidate) =>
      isRoomWorldPointWalkable(geometry, candidate, { clearance })
    )

  return uniqueRoomWorldPoints(candidates)
}

function getBlockerCornerCandidates(
  blocker: RoomWorldBlocker,
  options?: RoomWorldClearanceOptions
): RoomWorldPoint[] {
  const bounds = getRoomWorldBlockerBounds(blocker)
  const margin = DEFAULT_PATH_MARGIN + getRoomWorldClearance(options)
  return [
    { x: bounds.minX - margin, y: bounds.minY - margin },
    { x: bounds.maxX + margin, y: bounds.minY - margin },
    { x: bounds.minX - margin, y: bounds.maxY + margin },
    { x: bounds.maxX + margin, y: bounds.maxY + margin }
  ]
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

function findShortestClearPath(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  to: RoomWorldPoint
  candidates: RoomWorldPoint[]
  waypointCount: 1 | 2
  clearance: number
}): RoomWorldPath | null {
  let shortestPath: RoomWorldPath | null = null
  let shortestDistance = Number.POSITIVE_INFINITY

  if (input.waypointCount === 1) {
    input.candidates.forEach((candidate) => {
      const path = [candidate, input.to]
      const distance = getRoomWorldPathDistance(input.from, path)
      if (distance >= shortestDistance) return
      if (
        !isRoomWorldPathClear(input.geometry, input.from, path, {
          clearance: input.clearance
        })
      ) {
        return
      }
      shortestPath = path
      shortestDistance = distance
    })
    return shortestPath
  }

  input.candidates.forEach((first) => {
    input.candidates.forEach((second) => {
      if (pointsEqual(first, second)) return
      const path = [first, second, input.to]
      const distance = getRoomWorldPathDistance(input.from, path)
      if (distance >= shortestDistance) return
      if (
        !isRoomWorldPathClear(input.geometry, input.from, path, {
          clearance: input.clearance
        })
      ) {
        return
      }
      shortestPath = path
      shortestDistance = distance
    })
  })

  return shortestPath
}

function isRoomWorldPathClear(
  geometry: RoomWorldGeometry,
  from: RoomWorldPoint,
  path: RoomWorldPath,
  options?: RoomWorldClearanceOptions
): boolean {
  let start = from
  for (const target of path) {
    if (
      !isRoomWorldSegmentClear({
        geometry,
        from: start,
        to: target,
        clearance: options?.clearance
      })
    ) {
      return false
    }
    start = target
  }
  return true
}

function getRoomWorldPathDistance(
  from: RoomWorldPoint,
  path: RoomWorldPath
): number {
  let distance = 0
  let start = from
  path.forEach((target) => {
    distance += Math.hypot(target.x - start.x, target.y - start.y)
    start = target
  })
  return distance
}

function uniqueRoomWorldPoints(points: RoomWorldPoint[]): RoomWorldPoint[] {
  const seen = new Set<string>()
  return points.filter((point) => {
    const key = `${point.x.toFixed(3)}:${point.y.toFixed(3)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function pointsEqual(first: RoomWorldPoint, second: RoomWorldPoint): boolean {
  return first.x === second.x && first.y === second.y
}

function getRoomWorldClearance(options?: RoomWorldClearanceOptions): number {
  return Math.max(0, options?.clearance ?? 0)
}
