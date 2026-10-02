import type {
  RoomWorldBlocker,
  RoomWorldGeometry,
  RoomWorldPath,
  RoomWorldPoint
} from "./roomWorldGeometry"
import {
  createRoomFloorHomography,
  projectRoomFloorUnitPoint,
  unprojectRoomFloorPoint,
  type RoomFloorHomography
} from "./roomFloorGrid"

/**
 * Room floor navigation: the walkable area, exact collision, A* on the floor
 * lattice and path smoothing. Pure and deterministic, so both phones of a
 * shared room compute the same path from the same input, and the server can
 * reason about the same floor.
 *
 * All geometry runs in "metric" space: stage coordinates scaled per axis by
 * `geometry.metric` (the canvas proportions), so a clearance is a real
 * distance on the drawn floor rather than a stretched one. Without a metric
 * the axes are 1:1, as every room was before.
 *
 * - A point is walkable when it lies inside a walkable area at least
 *   `edgeMargin` from its edge, outside every blocking footprint and at least
 *   `clearance` from it.
 * - A segment is clear when every point on it is walkable (tested exactly,
 *   segment against polygon, never by sampling).
 * - A path is A* over the lattice nodes (half-tile cells on a measured floor)
 *   with the start and goal attached by clear segments, then string-pulled
 *   (each point jumps to the farthest later point it can see).
 */

const EPSILON = 1e-9
/** How far a resolved point is pushed past the exact clearance boundary. */
const RESOLVE_PUSH = 1e-4
/** Lattice node size when a room has no measured floor (room units). */
const FALLBACK_NODE_SPACING = 0.025

export interface RoomWorldFloorLattice {
  /** Stage corners of the unit-square lattice, (0,0) (1,0) (1,1) (0,1). */
  corners: readonly [RoomWorldPoint, RoomWorldPoint, RoomWorldPoint, RoomWorldPoint]
  /** Lattice nodes per unit side (tile span x cells per tile). */
  divisions: number
}

export interface RoomWorldMetric {
  /** Multiplier for x distances (1 = canvas widths). */
  x: number
  /** Multiplier for y distances (canvas height / width on a measured floor). */
  y: number
}

interface Obstacle {
  polygon: number[]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface NavSpace {
  mx: number
  my: number
  areas: number[][]
  /** Per area: convex, so a segment between two walkable points stays walkable. */
  convex: boolean[]
  obstacles: Obstacle[]
  clearance: number
  edgeMargin: number
}

interface NavGrid {
  homography: RoomFloorHomography
  divisions: number
  c0: number
  r0: number
  columns: number
  rows: number
  /** Metric position of every node. */
  nx: Float64Array
  ny: Float64Array
  walkable: Uint8Array
}

const spaceCache = new WeakMap<RoomWorldGeometry, Map<number, NavSpace>>()
const gridCache = new WeakMap<NavSpace, NavGrid>()
const geometryOfSpace = new WeakMap<NavSpace, RoomWorldGeometry>()

function getNavSpace(geometry: RoomWorldGeometry, clearance: number): NavSpace {
  let byClearance = spaceCache.get(geometry)
  if (!byClearance) {
    byClearance = new Map()
    spaceCache.set(geometry, byClearance)
  }
  const cached = byClearance.get(clearance)
  if (cached) return cached
  const mx = geometry.metric?.x ?? 1
  const my = geometry.metric?.y ?? 1
  const areas = geometry.walkableAreas
    .filter((area) => area.points.length >= 3)
    .map((area) => toMetricPolygon(area.points, mx, my))
  const space: NavSpace = {
    mx,
    my,
    areas,
    convex: areas.map(isConvexPolygon),
    obstacles: (geometry.blockers ?? [])
      .filter((blocker) => blocker.blocksMovement !== false)
      .map((blocker) => createObstacle(getBlockerShape(blocker), mx, my)),
    clearance: Math.max(0, clearance),
    edgeMargin: Math.max(0, geometry.edgeMargin ?? 0)
  }
  byClearance.set(clearance, space)
  geometryOfSpace.set(space, geometry)
  return space
}

/** The footprint a blocker occupies: its calibrated polygon, else its bounds. */
export function getRoomWorldBlockerShape(blocker: RoomWorldBlocker): RoomWorldPoint[] {
  return getBlockerShape(blocker)
}

function getBlockerShape(blocker: RoomWorldBlocker): RoomWorldPoint[] {
  if (blocker.polygon && blocker.polygon.length >= 3) return blocker.polygon
  const anchor = blocker.anchor ?? { x: 0.5, y: 1 }
  const minX = blocker.x - blocker.width * anchor.x
  const minY = blocker.y - blocker.height * anchor.y
  return [
    { x: minX, y: minY },
    { x: minX + blocker.width, y: minY },
    { x: minX + blocker.width, y: minY + blocker.height },
    { x: minX, y: minY + blocker.height }
  ]
}

function toMetricPolygon(points: readonly RoomWorldPoint[], mx: number, my: number): number[] {
  const flat: number[] = []
  for (const point of points) flat.push(point.x * mx, point.y * my)
  return flat
}

function createObstacle(points: readonly RoomWorldPoint[], mx: number, my: number): Obstacle {
  const polygon = toMetricPolygon(points, mx, my)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let index = 0; index < polygon.length; index += 2) {
    minX = Math.min(minX, polygon[index]!)
    maxX = Math.max(maxX, polygon[index]!)
    minY = Math.min(minY, polygon[index + 1]!)
    maxY = Math.max(maxY, polygon[index + 1]!)
  }
  return { polygon, minX, maxX, minY, maxY }
}

// ── Exact primitives on flat metric polygons ───────────────────────────────

function pointInPolygon(px: number, py: number, polygon: number[]): boolean {
  let inside = false
  const count = polygon.length / 2
  for (let current = 0, previous = count - 1; current < count; previous = current++) {
    const ax = polygon[current * 2]!
    const ay = polygon[current * 2 + 1]!
    const bx = polygon[previous * 2]!
    const by = polygon[previous * 2 + 1]!
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): boolean {
  const d1 = cross(cx, cy, dx, dy, ax, ay)
  const d2 = cross(cx, cy, dx, dy, bx, by)
  const d3 = cross(ax, ay, bx, by, cx, cy)
  const d4 = cross(ax, ay, bx, by, dx, dy)
  if (((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
      ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))) return true
  return false
}

function segmentSegmentDistance(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): number {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0
  return Math.min(
    pointSegmentDistance(ax, ay, cx, cy, dx, dy),
    pointSegmentDistance(bx, by, cx, cy, dx, dy),
    pointSegmentDistance(cx, cy, ax, ay, bx, by),
    pointSegmentDistance(dx, dy, ax, ay, bx, by)
  )
}

function boundaryDistance(px: number, py: number, polygon: number[]): number {
  let best = Infinity
  const count = polygon.length / 2
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count
    best = Math.min(best, pointSegmentDistance(
      px, py, polygon[index * 2]!, polygon[index * 2 + 1]!, polygon[next * 2]!, polygon[next * 2 + 1]!
    ))
  }
  return best
}

function segmentBoundaryDistance(ax: number, ay: number, bx: number, by: number, polygon: number[]): number {
  let best = Infinity
  const count = polygon.length / 2
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count
    best = Math.min(best, segmentSegmentDistance(
      ax, ay, bx, by, polygon[index * 2]!, polygon[index * 2 + 1]!, polygon[next * 2]!, polygon[next * 2 + 1]!
    ))
    if (best === 0) return 0
  }
  return best
}

function nearestBoundaryPoint(px: number, py: number, polygon: number[]): { x: number; y: number; edge: number } {
  let best = { x: polygon[0]!, y: polygon[1]!, edge: 0 }
  let bestDistance = Infinity
  const count = polygon.length / 2
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count
    const ax = polygon[index * 2]!
    const ay = polygon[index * 2 + 1]!
    const dx = polygon[next * 2]! - ax
    const dy = polygon[next * 2 + 1]! - ay
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0
    const x = ax + dx * t
    const y = ay + dy * t
    const distance = Math.hypot(px - x, py - y)
    if (distance < bestDistance - EPSILON) {
      bestDistance = distance
      best = { x, y, edge: index }
    }
  }
  return best
}

/** Unit normal of a polygon edge pointing into the polygon. */
function inwardEdgeNormal(polygon: number[], edge: number): { x: number; y: number } {
  const count = polygon.length / 2
  const next = (edge + 1) % count
  const ax = polygon[edge * 2]!
  const ay = polygon[edge * 2 + 1]!
  const dx = polygon[next * 2]! - ax
  const dy = polygon[next * 2 + 1]! - ay
  const length = Math.hypot(dx, dy) || 1
  const normal = { x: -dy / length, y: dx / length }
  const probe = 1e-6
  const mx = ax + dx / 2 + normal.x * probe
  const my = ay + dy / 2 + normal.y * probe
  return pointInPolygon(mx, my, polygon) ? normal : { x: -normal.x, y: -normal.y }
}

// ── Walkability ────────────────────────────────────────────────────────────

function isAreaPointWalkable(space: NavSpace, px: number, py: number): boolean {
  for (const area of space.areas) {
    if (!pointInPolygon(px, py, area) && boundaryDistance(px, py, area) > EPSILON) continue
    if (space.edgeMargin > 0 && boundaryDistance(px, py, area) < space.edgeMargin - EPSILON) continue
    return true
  }
  return false
}

function isObstacleBlockingPoint(space: NavSpace, obstacle: Obstacle, px: number, py: number): boolean {
  const reach = space.clearance
  if (px < obstacle.minX - reach || px > obstacle.maxX + reach ||
      py < obstacle.minY - reach || py > obstacle.maxY + reach) return false
  if (pointInPolygon(px, py, obstacle.polygon)) return true
  return boundaryDistance(px, py, obstacle.polygon) < reach - EPSILON
}

function isMetricPointWalkable(space: NavSpace, px: number, py: number): boolean {
  if (!isAreaPointWalkable(space, px, py)) return false
  for (const obstacle of space.obstacles) {
    if (isObstacleBlockingPoint(space, obstacle, px, py)) return false
  }
  return true
}

function isConvexPolygon(polygon: number[]): boolean {
  const count = polygon.length / 2
  let sign = 0
  for (let index = 0; index < count; index += 1) {
    const a = index
    const b = (index + 1) % count
    const c = (index + 2) % count
    const turn = cross(
      polygon[a * 2]!, polygon[a * 2 + 1]!, polygon[b * 2]!, polygon[b * 2 + 1]!, polygon[c * 2]!, polygon[c * 2 + 1]!
    )
    if (Math.abs(turn) <= EPSILON) continue
    if (sign === 0) sign = Math.sign(turn)
    else if (Math.sign(turn) !== sign) return false
  }
  return true
}

function isAreaSegmentClear(space: NavSpace, ax: number, ay: number, bx: number, by: number): boolean {
  for (let areaIndex = 0; areaIndex < space.areas.length; areaIndex += 1) {
    const area = space.areas[areaIndex]!
    if (space.convex[areaIndex]) {
      // Distance to a convex boundary is concave along a segment inside it:
      // both ends walkable means the whole segment is.
      const aOk = (pointInPolygon(ax, ay, area) || boundaryDistance(ax, ay, area) <= EPSILON) &&
        (space.edgeMargin <= 0 || boundaryDistance(ax, ay, area) >= space.edgeMargin - EPSILON)
      if (!aOk) continue
      const bOk = (pointInPolygon(bx, by, area) || boundaryDistance(bx, by, area) <= EPSILON) &&
        (space.edgeMargin <= 0 || boundaryDistance(bx, by, area) >= space.edgeMargin - EPSILON)
      if (bOk) return true
      continue
    }
    const aInside = pointInPolygon(ax, ay, area) || boundaryDistance(ax, ay, area) <= EPSILON
    const bInside = pointInPolygon(bx, by, area) || boundaryDistance(bx, by, area) <= EPSILON
    if (!aInside || !bInside) continue
    if (space.edgeMargin > 0) {
      if (segmentBoundaryDistance(ax, ay, bx, by, area) < space.edgeMargin - EPSILON) continue
      return true
    }
    if (crossesBoundary(ax, ay, bx, by, area)) continue
    return true
  }
  return false
}

function crossesBoundary(ax: number, ay: number, bx: number, by: number, polygon: number[]): boolean {
  const count = polygon.length / 2
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count
    if (segmentsIntersect(
      ax, ay, bx, by, polygon[index * 2]!, polygon[index * 2 + 1]!, polygon[next * 2]!, polygon[next * 2 + 1]!
    )) return true
  }
  return false
}

function isObstacleBlockingSegment(
  space: NavSpace, obstacle: Obstacle, ax: number, ay: number, bx: number, by: number
): boolean {
  const reach = space.clearance
  if (Math.max(ax, bx) < obstacle.minX - reach || Math.min(ax, bx) > obstacle.maxX + reach ||
      Math.max(ay, by) < obstacle.minY - reach || Math.min(ay, by) > obstacle.maxY + reach) return false
  if (pointInPolygon(ax, ay, obstacle.polygon) || pointInPolygon(bx, by, obstacle.polygon)) return true
  if (reach > 0) return segmentBoundaryDistance(ax, ay, bx, by, obstacle.polygon) < reach - EPSILON
  if (crossesBoundary(ax, ay, bx, by, obstacle.polygon)) return true
  return pointInPolygon((ax + bx) / 2, (ay + by) / 2, obstacle.polygon)
}

/**
 * Whether every point of a segment is walkable. `escapeStart` lets a walk
 * leave a spot that is no longer walkable (furniture placed under a standing
 * avatar, a record from an older floor): footprints the start is already in
 * or too close to may be left, but never crossed, and the floor edge is not
 * checked until the walk is back on the floor.
 */
function isMetricSegmentClear(
  space: NavSpace, ax: number, ay: number, bx: number, by: number, escapeStart: boolean
): boolean {
  const startOnFloor = isAreaPointWalkable(space, ax, ay)
  if (!(escapeStart && !startOnFloor)) {
    if (!isAreaSegmentClear(space, ax, ay, bx, by)) return false
  } else if (!isAreaPointWalkable(space, bx, by)) {
    return false
  }
  for (const obstacle of space.obstacles) {
    if (escapeStart && isObstacleBlockingPoint(space, obstacle, ax, ay)) {
      if (pointInPolygon(ax, ay, obstacle.polygon)) continue
      if (pointInPolygon(bx, by, obstacle.polygon)) return false
      if (segmentBoundaryDistance(ax, ay, bx, by, obstacle.polygon) === 0) return false
      continue
    }
    if (isObstacleBlockingSegment(space, obstacle, ax, ay, bx, by)) return false
  }
  return true
}

/**
 * A step between two walkable lattice nodes: on a convex floor only the
 * footprints can block it (both ends are already on the floor).
 */
function isLatticeStepClear(space: NavSpace, ax: number, ay: number, bx: number, by: number): boolean {
  if (space.areas.length !== 1 || !space.convex[0]) return isMetricSegmentClear(space, ax, ay, bx, by, false)
  for (const obstacle of space.obstacles) {
    if (isObstacleBlockingSegment(space, obstacle, ax, ay, bx, by)) return false
  }
  return true
}

export function isRoomWorldPointWalkableExact(
  geometry: RoomWorldGeometry,
  point: RoomWorldPoint,
  clearance: number
): boolean {
  const space = getNavSpace(geometry, clearance)
  return isMetricPointWalkable(space, point.x * space.mx, point.y * space.my)
}

export function isRoomWorldSegmentClearExact(
  geometry: RoomWorldGeometry,
  from: RoomWorldPoint,
  to: RoomWorldPoint,
  clearance: number,
  options?: { escapeStart?: boolean }
): boolean {
  const space = getNavSpace(geometry, clearance)
  return isMetricSegmentClear(
    space, from.x * space.mx, from.y * space.my, to.x * space.mx, to.y * space.my, options?.escapeStart ?? false
  )
}

/**
 * Whether a point is inside a blocker's footprint or within `clearance` of it
 * (axes 1:1; a geometry's metric applies through the walkability functions).
 */
export function isRoomWorldPointNearBlockerExact(
  point: RoomWorldPoint,
  blocker: RoomWorldBlocker,
  clearance: number
): boolean {
  if (blocker.blocksMovement === false) return false
  const polygon = toMetricPolygon(getBlockerShape(blocker), 1, 1)
  if (pointInPolygon(point.x, point.y, polygon)) return true
  return clearance > 0 && boundaryDistance(point.x, point.y, polygon) < clearance - EPSILON
}

// ── Lattice ─────────────────────────────────────────────────────────────────

function getNavGrid(space: NavSpace): NavGrid {
  const cached = gridCache.get(space)
  if (cached) return cached
  const geometry = geometryOfSpace.get(space)!
  const lattice = geometry.floor ?? createFallbackLattice(geometry)
  const homography = createRoomFloorHomography(lattice.corners)
  const divisions = lattice.divisions
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const area of geometry.walkableAreas) {
    for (const point of area.points) {
      const unit = unprojectRoomFloorPoint(homography, point.x, point.y)
      minU = Math.min(minU, unit.u)
      maxU = Math.max(maxU, unit.u)
      minV = Math.min(minV, unit.v)
      maxV = Math.max(maxV, unit.v)
    }
  }
  const c0 = Number.isFinite(minU) ? Math.floor(minU * divisions) : 0
  const r0 = Number.isFinite(minV) ? Math.floor(minV * divisions) : 0
  const columns = Number.isFinite(maxU) ? Math.ceil(maxU * divisions) - c0 + 1 : 0
  const rows = Number.isFinite(maxV) ? Math.ceil(maxV * divisions) - r0 + 1 : 0
  const count = Math.max(0, columns * rows)
  const nx = new Float64Array(count)
  const ny = new Float64Array(count)
  const walkable = new Uint8Array(count)
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const index = column * rows + row
      const point = projectRoomFloorUnitPoint(homography, (c0 + column) / divisions, (r0 + row) / divisions)
      nx[index] = point.x * space.mx
      ny[index] = point.y * space.my
      walkable[index] = isMetricPointWalkable(space, nx[index]!, ny[index]!) ? 1 : 0
    }
  }
  const grid = { homography, divisions, c0, r0, columns, rows, nx, ny, walkable }
  gridCache.set(space, grid)
  return grid
}

function createFallbackLattice(geometry: RoomWorldGeometry): RoomWorldFloorLattice {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const area of geometry.walkableAreas) {
    for (const point of area.points) {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }
  }
  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) {
    minX = 0; maxX = 1; minY = 0; maxY = 1
  }
  const mx = geometry.metric?.x ?? 1
  const my = geometry.metric?.y ?? 1
  const extent = Math.max((maxX - minX) * mx, (maxY - minY) * my)
  return {
    corners: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ],
    divisions: Math.max(8, Math.ceil(extent / FALLBACK_NODE_SPACING))
  }
}

/** Walkable lattice nodes as stage points (debug overlays and tests). */
export function getRoomWorldWalkableNodes(geometry: RoomWorldGeometry, clearance: number): RoomWorldPoint[] {
  const space = getNavSpace(geometry, clearance)
  const grid = getNavGrid(space)
  const nodes: RoomWorldPoint[] = []
  for (let index = 0; index < grid.walkable.length; index += 1) {
    if (grid.walkable[index]) nodes.push({ x: grid.nx[index]! / space.mx, y: grid.ny[index]! / space.my })
  }
  return nodes
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]
]

/**
 * Walkable nodes near a metric point that a clear segment joins to it,
 * searching outward ring by ring until some are found (then one ring more).
 */
function collectAttachedNodes(
  space: NavSpace,
  grid: NavGrid,
  px: number,
  py: number,
  toPoint: boolean,
  escapeStart: boolean
): number[] {
  const unit = unprojectRoomFloorPoint(grid.homography, px / space.mx, py / space.my)
  const centerColumn = Math.round(unit.u * grid.divisions) - grid.c0
  const centerRow = Math.round(unit.v * grid.divisions) - grid.r0
  const attached: number[] = []
  const maxRing = Math.max(grid.columns, grid.rows)
  let foundAtRing = -1
  for (let ring = 0; ring <= maxRing; ring += 1) {
    if (foundAtRing >= 0 && ring > foundAtRing + 1) break
    for (let column = centerColumn - ring; column <= centerColumn + ring; column += 1) {
      for (let row = centerRow - ring; row <= centerRow + ring; row += 1) {
        if (Math.max(Math.abs(column - centerColumn), Math.abs(row - centerRow)) !== ring) continue
        if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) continue
        const index = column * grid.rows + row
        if (!grid.walkable[index]) continue
        const clear = toPoint
          ? isMetricSegmentClear(space, grid.nx[index]!, grid.ny[index]!, px, py, false)
          : isMetricSegmentClear(space, px, py, grid.nx[index]!, grid.ny[index]!, escapeStart)
        if (clear) attached.push(index)
      }
    }
    if (attached.length > 0 && foundAtRing < 0) foundAtRing = ring
  }
  return attached
}

/** A deterministic binary min-heap on (priority, index). */
class NodeHeap {
  private readonly items: number[] = []
  private readonly priorities: number[] = []
  get size(): number { return this.items.length }
  push(item: number, priority: number): void {
    this.items.push(item)
    this.priorities.push(priority)
    let index = this.items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (!this.less(index, parent)) break
      this.swap(index, parent)
      index = parent
    }
  }
  pop(): number {
    const top = this.items[0]!
    const lastItem = this.items.pop()!
    const lastPriority = this.priorities.pop()!
    if (this.items.length > 0) {
      this.items[0] = lastItem
      this.priorities[0] = lastPriority
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < this.items.length && this.less(left, smallest)) smallest = left
        if (right < this.items.length && this.less(right, smallest)) smallest = right
        if (smallest === index) break
        this.swap(index, smallest)
        index = smallest
      }
    }
    return top
  }
  private less(a: number, b: number): boolean {
    const pa = this.priorities[a]!
    const pb = this.priorities[b]!
    if (Math.abs(pa - pb) > 1e-12) return pa < pb
    return this.items[a]! < this.items[b]!
  }
  private swap(a: number, b: number): void {
    const item = this.items[a]!
    this.items[a] = this.items[b]!
    this.items[b] = item
    const priority = this.priorities[a]!
    this.priorities[a] = this.priorities[b]!
    this.priorities[b] = priority
  }
}

function findLatticePath(
  space: NavSpace,
  grid: NavGrid,
  sx: number,
  sy: number,
  gx: number,
  gy: number
): number[] | null {
  const count = grid.walkable.length
  const startIndex = count
  const goalIndex = count + 1
  const startNodes = collectAttachedNodes(space, grid, sx, sy, false, true)
  if (startNodes.length === 0) return null
  const goalNodes = new Set(collectAttachedNodes(space, grid, gx, gy, true, false))
  if (goalNodes.size === 0) return null
  const g = new Float64Array(count + 2).fill(Infinity)
  const parent = new Int32Array(count + 2).fill(-1)
  const closed = new Uint8Array(count + 2)
  const heuristic = (index: number): number =>
    index === goalIndex ? 0 : Math.hypot(grid.nx[index]! - gx, grid.ny[index]! - gy)
  const heap = new NodeHeap()
  g[startIndex] = 0
  heap.push(startIndex, 0)
  const relax = (from: number, to: number, cost: number): void => {
    const next = g[from]! + cost
    if (next >= g[to]! - 1e-12) return
    g[to] = next
    parent[to] = from
    heap.push(to, next + heuristic(to))
  }
  while (heap.size > 0) {
    const current = heap.pop()
    if (closed[current]) continue
    closed[current] = 1
    if (current === goalIndex) break
    if (current === startIndex) {
      for (const node of startNodes) relax(startIndex, node, Math.hypot(grid.nx[node]! - sx, grid.ny[node]! - sy))
      continue
    }
    const column = Math.floor(current / grid.rows)
    const row = current % grid.rows
    const cx = grid.nx[current]!
    const cy = grid.ny[current]!
    if (goalNodes.has(current)) relax(current, goalIndex, Math.hypot(gx - cx, gy - cy))
    for (const [dc, dr] of NEIGHBOURS) {
      const nextColumn = column + dc
      const nextRow = row + dr
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= grid.columns || nextRow >= grid.rows) continue
      const next = nextColumn * grid.rows + nextRow
      if (closed[next] || !grid.walkable[next]) continue
      // A diagonal step never cuts a blocked corner.
      if (dc !== 0 && dr !== 0 && (
        !grid.walkable[(column + dc) * grid.rows + row] || !grid.walkable[column * grid.rows + row + dr]
      )) continue
      const nx = grid.nx[next]!
      const ny = grid.ny[next]!
      if (!isLatticeStepClear(space, cx, cy, nx, ny)) continue
      relax(current, next, Math.hypot(nx - cx, ny - cy))
    }
  }
  if (!Number.isFinite(g[goalIndex]!)) return null
  const nodes: number[] = []
  for (let index = parent[goalIndex]!; index !== startIndex && index >= 0; index = parent[index]!) nodes.push(index)
  return nodes.reverse()
}

/**
 * A walking path from `from` to `to`: the points to walk through after
 * `from`, ending exactly at `to`, or null when `to` is not walkable or cannot
 * be reached. Straight when the straight line is clear.
 */
export function resolveRoomWorldNavigationPath(input: {
  geometry: RoomWorldGeometry
  from: RoomWorldPoint
  to: RoomWorldPoint
  clearance: number
}): RoomWorldPath | null {
  const space = getNavSpace(input.geometry, input.clearance)
  const sx = input.from.x * space.mx
  const sy = input.from.y * space.my
  const gx = input.to.x * space.mx
  const gy = input.to.y * space.my
  if (!isMetricPointWalkable(space, gx, gy)) return null
  if (isMetricSegmentClear(space, sx, sy, gx, gy, true)) return [{ x: input.to.x, y: input.to.y }]
  const grid = getNavGrid(space)
  const nodes = findLatticePath(space, grid, sx, sy, gx, gy)
  if (!nodes) return null
  const xs = [sx, ...nodes.map((node) => grid.nx[node]!), gx]
  const ys = [sy, ...nodes.map((node) => grid.ny[node]!), gy]
  // String pulling: from each kept point, jump to the farthest visible one.
  const path: RoomWorldPoint[] = []
  let anchor = 0
  const last = xs.length - 1
  while (anchor < last) {
    let next = last
    while (next > anchor + 1 && !isMetricSegmentClear(space, xs[anchor]!, ys[anchor]!, xs[next]!, ys[next]!, anchor === 0)) {
      next -= 1
    }
    path.push(next === last
      ? { x: input.to.x, y: input.to.y }
      : { x: xs[next]! / space.mx, y: ys[next]! / space.my })
    anchor = next
  }
  return path
}

/**
 * The walkable point nearest `target` (measured on the floor's metric): the
 * target itself when walkable; else the point just outside the clearance of
 * the footprint it falls in, or just inside the floor edge; else the nearest
 * walkable lattice node. With `from`, only a point the avatar can reach from
 * there qualifies. Never a far clamp toward the middle of the room.
 */
export function resolveRoomWorldNearestWalkablePoint(input: {
  geometry: RoomWorldGeometry
  target: RoomWorldPoint
  clearance: number
  from?: RoomWorldPoint
}): RoomWorldPoint | null {
  const space = getNavSpace(input.geometry, input.clearance)
  const tx = input.target.x * space.mx
  const ty = input.target.y * space.my
  const reachable = (point: RoomWorldPoint): boolean => !input.from || Boolean(resolveRoomWorldNavigationPath({
    geometry: input.geometry,
    from: input.from,
    to: point,
    clearance: input.clearance
  }))
  if (isMetricPointWalkable(space, tx, ty) && reachable(input.target)) return { x: input.target.x, y: input.target.y }

  const candidates: { x: number; y: number }[] = []
  let frontier = [{ x: tx, y: ty }]
  for (let round = 0; round < 3 && frontier.length > 0; round += 1) {
    const next: { x: number; y: number }[] = []
    for (const point of frontier) {
      for (const pushed of pushOutOfConstraints(space, point.x, point.y)) {
        if (isMetricPointWalkable(space, pushed.x, pushed.y)) candidates.push(pushed)
        else next.push(pushed)
      }
    }
    frontier = next
  }
  const grid = getNavGrid(space)
  for (let index = 0; index < grid.walkable.length; index += 1) {
    if (grid.walkable[index]) candidates.push({ x: grid.nx[index]!, y: grid.ny[index]! })
  }
  candidates.sort((left, right) => {
    const delta = Math.hypot(left.x - tx, left.y - ty) - Math.hypot(right.x - tx, right.y - ty)
    if (Math.abs(delta) > 1e-12) return delta
    return left.x - right.x || left.y - right.y
  })
  const attempts = input.from ? 6 : 1
  for (let index = 0; index < Math.min(attempts, candidates.length); index += 1) {
    const candidate = candidates[index]!
    const point = { x: candidate.x / space.mx, y: candidate.y / space.my }
    if (reachable(point)) return point
  }
  if (!input.from) return null
  // The nearest spot cut off from the avatar (a wall of furniture between):
  // the nearest lattice node of the floor the avatar can actually reach.
  let best = -1
  let bestDistance = Infinity
  for (const node of collectReachableNodes(space, grid, input.from.x * space.mx, input.from.y * space.my)) {
    const distance = Math.hypot(grid.nx[node]! - tx, grid.ny[node]! - ty)
    if (distance < bestDistance - 1e-12 || (Math.abs(distance - bestDistance) <= 1e-12 && node < best)) {
      best = node
      bestDistance = distance
    }
  }
  return best >= 0 ? { x: grid.nx[best]! / space.mx, y: grid.ny[best]! / space.my } : null
}

/** Every lattice node a walk from a metric point can reach (breadth first). */
function collectReachableNodes(space: NavSpace, grid: NavGrid, sx: number, sy: number): number[] {
  const seen = new Uint8Array(grid.walkable.length)
  const queue = collectAttachedNodes(space, grid, sx, sy, false, true)
  for (const node of queue) seen[node] = 1
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!
    const column = Math.floor(current / grid.rows)
    const row = current % grid.rows
    for (const [dc, dr] of NEIGHBOURS) {
      const nextColumn = column + dc
      const nextRow = row + dr
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= grid.columns || nextRow >= grid.rows) continue
      const next = nextColumn * grid.rows + nextRow
      if (seen[next] || !grid.walkable[next]) continue
      if (dc !== 0 && dr !== 0 && (
        !grid.walkable[(column + dc) * grid.rows + row] || !grid.walkable[column * grid.rows + row + dr]
      )) continue
      if (!isLatticeStepClear(space, grid.nx[current]!, grid.ny[current]!, grid.nx[next]!, grid.ny[next]!)) continue
      seen[next] = 1
      queue.push(next)
    }
  }
  return queue
}

/** Each constraint the point violates, resolved on its own by the smallest move. */
function pushOutOfConstraints(space: NavSpace, px: number, py: number): { x: number; y: number }[] {
  const pushed: { x: number; y: number }[] = []
  if (!isAreaPointWalkable(space, px, py)) {
    for (const area of space.areas) {
      const nearest = nearestBoundaryPoint(px, py, area)
      const inside = pointInPolygon(px, py, area)
      let dx = inside ? px - nearest.x : nearest.x - px
      let dy = inside ? py - nearest.y : nearest.y - py
      const length = Math.hypot(dx, dy)
      if (length <= EPSILON) {
        const normal = inwardEdgeNormal(area, nearest.edge)
        dx = normal.x; dy = normal.y
      } else {
        dx /= length; dy /= length
      }
      const distance = space.edgeMargin + RESOLVE_PUSH
      pushed.push({ x: nearest.x + dx * distance, y: nearest.y + dy * distance })
    }
  }
  for (const obstacle of space.obstacles) {
    if (!isObstacleBlockingPoint(space, obstacle, px, py)) continue
    const nearest = nearestBoundaryPoint(px, py, obstacle.polygon)
    const inside = pointInPolygon(px, py, obstacle.polygon)
    let dx = inside ? nearest.x - px : px - nearest.x
    let dy = inside ? nearest.y - py : py - nearest.y
    const length = Math.hypot(dx, dy)
    if (length <= EPSILON) {
      const normal = inwardEdgeNormal(obstacle.polygon, nearest.edge)
      dx = -normal.x; dy = -normal.y
    } else {
      dx /= length; dy /= length
    }
    const distance = space.clearance + RESOLVE_PUSH
    pushed.push({ x: nearest.x + dx * distance, y: nearest.y + dy * distance })
  }
  return pushed
}
