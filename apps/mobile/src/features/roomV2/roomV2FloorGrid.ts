import {
  createRoomFloorHomography,
  ROOM_BLUMI_WORLD_FLOOR_GRID,
  type RoomFloorGrid
} from "@blumi/domain"
import type { RoomWorldPoint } from "../roomWorld/roomWorldGeometry"

/**
 * The placement floor of a fixed-angle room shell, measured on the drawn art.
 * The data and the homography live in @blumi/domain (roomFloorGrid), the one
 * floor model avatar walking and the server use too; this module adds the
 * editor's cell lattice and the UI-thread (worklet) projections.
 *
 * Everything is normalized to the shell canvas (x / width, y / height), which
 * is also the stage coordinate system the renderer and the editor use.
 */
export type RoomV2FloorGrid = RoomFloorGrid

/**
 * Plain-number form of a floor grid for the UI thread: forward and inverse
 * homography coefficients plus the cell range. Gesture worklets receive it
 * through a shared value; nothing in it is a function or class.
 */
export interface RoomV2FloorGridProjection {
  /** Unit square (u, v) -> stage: x = (m0 u + m1 v + m2) / w, w = m6 u + m7 v + 1. */
  forward: number[]
  /** Stage -> unit square, row-major 3x3. */
  inverse: number[]
  span: number
  cellsPerTile: number
  /** The outline's extent in tile coordinates. */
  tileBounds: { minI: number; maxI: number; minJ: number; maxJ: number }
  minColumn: number
  maxColumn: number
  minRow: number
  maxRow: number
  outline: RoomWorldPoint[]
}

export interface RoomV2FloorGridCell {
  column: number
  row: number
}

export interface RoomV2FloorGridSegment {
  from: RoomWorldPoint
  to: RoomWorldPoint
}

/** A placement cell drawn as a parallelogram: its centre and its two edge vectors. */
export interface RoomV2FloorGridCellShape {
  column: number
  row: number
  center: RoomWorldPoint
  alongI: RoomWorldPoint
  alongJ: RoomWorldPoint
}

/** Blumi Home (room_v2_shell_blumi_world_v1, 1254x714): see ROOM_BLUMI_WORLD_FLOOR_GRID. */
export const ROOM_V2_BLUMI_WORLD_FLOOR_GRID: RoomV2FloorGrid = ROOM_BLUMI_WORLD_FLOOR_GRID

export function createRoomV2FloorGridProjection(grid: RoomV2FloorGrid): RoomV2FloorGridProjection {
  const { forward, inverse } = createRoomFloorHomography(grid.latticeCorners)
  const { cellsPerTile } = grid
  const base = {
    forward,
    inverse,
    span: grid.latticeSpan,
    cellsPerTile
  }
  const tiles = grid.outline.map((point) =>
    unprojectRoomV2FloorGridPoint(base, point.x, point.y)
  )
  const tileBounds = {
    minI: Math.min(...tiles.map((tile) => tile.i)),
    maxI: Math.max(...tiles.map((tile) => tile.i)),
    minJ: Math.min(...tiles.map((tile) => tile.j)),
    maxJ: Math.max(...tiles.map((tile) => tile.j))
  }
  return {
    ...base,
    tileBounds,
    minColumn: Math.ceil(tileBounds.minI * cellsPerTile),
    maxColumn: Math.floor(tileBounds.maxI * cellsPerTile),
    minRow: Math.ceil(tileBounds.minJ * cellsPerTile),
    maxRow: Math.floor(tileBounds.maxJ * cellsPerTile),
    outline: grid.outline.map((point) => ({ ...point }))
  }
}

const projectionCache = new WeakMap<RoomV2FloorGrid, RoomV2FloorGridProjection>()

/** One projection per grid object; shells share the catalog's grid. */
export function getRoomV2FloorGridProjection(grid: RoomV2FloorGrid): RoomV2FloorGridProjection {
  const cached = projectionCache.get(grid)
  if (cached) return cached
  const projection = createRoomV2FloorGridProjection(grid)
  projectionCache.set(grid, projection)
  return projection
}

/**
 * The polygon floor furniture must stay inside: the drawn floor when the
 * shell has a measured grid, else the legacy avatar walk polygon. The walk
 * polygon (MINI_ROOM_FLOOR) is a coarse heptagon: it hangs past the front
 * lip and stops well short of the side corners, so it never matched the art.
 */
export function getRoomV2ShellFloorPlacementPolygon(
  shell: { floorGrid?: RoomV2FloorGrid; walkablePolygon?: RoomWorldPoint[] } | null | undefined
): RoomWorldPoint[] | undefined {
  if (shell?.floorGrid) return [...shell.floorGrid.outline]
  return shell?.walkablePolygon
}

/** Stage point of a tile coordinate. */
export function projectRoomV2FloorGridTilePoint(
  projection: RoomV2FloorGridProjection,
  i: number,
  j: number
): RoomWorldPoint {
  "worklet"
  const m = projection.forward
  const u = i / projection.span
  const v = j / projection.span
  const w = m[6] * u + m[7] * v + 1
  return {
    x: (m[0] * u + m[1] * v + m[2]) / w,
    y: (m[3] * u + m[4] * v + m[5]) / w
  }
}

/** Tile coordinate under a stage point (exact inverse of the projection). */
export function unprojectRoomV2FloorGridPoint(
  projection: Pick<RoomV2FloorGridProjection, "inverse" | "span">,
  x: number,
  y: number
): { i: number; j: number } {
  "worklet"
  const n = projection.inverse
  const w = n[6] * x + n[7] * y + n[8]
  return {
    i: ((n[0] * x + n[1] * y + n[2]) / w) * projection.span,
    j: ((n[3] * x + n[4] * y + n[5]) / w) * projection.span
  }
}

/** Stage point at the centre of a placement cell. */
export function getRoomV2FloorGridCellPoint(
  projection: RoomV2FloorGridProjection,
  column: number,
  row: number
): RoomWorldPoint {
  "worklet"
  return projectRoomV2FloorGridTilePoint(
    projection,
    column / projection.cellsPerTile,
    row / projection.cellsPerTile
  )
}

export function isRoomV2FloorGridPointOnFloor(
  projection: RoomV2FloorGridProjection,
  x: number,
  y: number
): boolean {
  "worklet"
  const outline = projection.outline
  let inside = false
  for (let current = 0, previous = outline.length - 1; current < outline.length; previous = current++) {
    const a = outline[current]
    const b = outline[previous]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/**
 * The placement cell nearest a stage point, kept on the drawn floor: the
 * point's tile coordinate is rounded to the cell lattice, clamped to the
 * floor's tile bounds, then walked toward the floor's middle until the cell
 * centre is inside the drawn outline (the front bay cuts the corner).
 */
export function snapRoomV2FloorGridCell(
  projection: RoomV2FloorGridProjection,
  x: number,
  y: number
): RoomV2FloorGridCell {
  "worklet"
  const tile = unprojectRoomV2FloorGridPoint(projection, x, y)
  const perTile = projection.cellsPerTile
  let column = Math.min(projection.maxColumn, Math.max(projection.minColumn, Math.round(tile.i * perTile)))
  let row = Math.min(projection.maxRow, Math.max(projection.minRow, Math.round(tile.j * perTile)))
  const middleColumn = Math.round((projection.minColumn + projection.maxColumn) / 2)
  const middleRow = Math.round((projection.minRow + projection.maxRow) / 2)
  for (let step = 0; step < 64; step += 1) {
    const point = getRoomV2FloorGridCellPoint(projection, column, row)
    if (isRoomV2FloorGridPointOnFloor(projection, point.x, point.y)) break
    if (column === middleColumn && row === middleRow) break
    column += Math.sign(middleColumn - column)
    row += Math.sign(middleRow - row)
  }
  return { column, row }
}

/** Stage point of the cell nearest `point` (JS convenience over the worklets). */
export function snapRoomV2FloorGridPoint(
  projection: RoomV2FloorGridProjection,
  point: RoomWorldPoint
): RoomWorldPoint {
  const cell = snapRoomV2FloorGridCell(projection, point.x, point.y)
  return roundRoomV2FloorGridPoint(getRoomV2FloorGridCellPoint(projection, cell.column, cell.row))
}

/** Persisted coordinates keep 6 decimals: sub-pixel on any canvas, stable across round trips. */
export function roundRoomV2FloorGridPoint(point: RoomWorldPoint): RoomWorldPoint {
  return {
    x: Math.round(point.x * 1e6) / 1e6,
    y: Math.round(point.y * 1e6) / 1e6
  }
}

/**
 * Cells ordered by distance from `start` (ring by ring, nearest centre first
 * inside a ring), limited to the floor lattice. Used to fit a footprint to
 * the nearest cell where it stays on the drawn floor.
 */
export function getRoomV2FloorGridCellsNear(
  projection: RoomV2FloorGridProjection,
  start: RoomV2FloorGridCell,
  maxRing: number
): RoomV2FloorGridCell[] {
  const cells: RoomV2FloorGridCell[] = []
  for (let ring = 0; ring <= maxRing; ring += 1) {
    const ringCells: { cell: RoomV2FloorGridCell; distance: number }[] = []
    for (let column = start.column - ring; column <= start.column + ring; column += 1) {
      for (let row = start.row - ring; row <= start.row + ring; row += 1) {
        if (Math.max(Math.abs(column - start.column), Math.abs(row - start.row)) !== ring) continue
        if (
          column < projection.minColumn || column > projection.maxColumn ||
          row < projection.minRow || row > projection.maxRow
        ) continue
        ringCells.push({
          cell: { column, row },
          distance: (column - start.column) ** 2 + (row - start.row) ** 2
        })
      }
    }
    ringCells.sort((left, right) => left.distance - right.distance)
    cells.push(...ringCells.map((entry) => entry.cell))
  }
  return cells
}

/** A cell as a parallelogram in stage coordinates, for drawing highlights. */
export function getRoomV2FloorGridCellShape(
  projection: RoomV2FloorGridProjection,
  column: number,
  row: number
): RoomV2FloorGridCellShape {
  const half = 0.5 / projection.cellsPerTile
  const i = column / projection.cellsPerTile
  const j = row / projection.cellsPerTile
  const iMinus = projectRoomV2FloorGridTilePoint(projection, i - half, j)
  const iPlus = projectRoomV2FloorGridTilePoint(projection, i + half, j)
  const jMinus = projectRoomV2FloorGridTilePoint(projection, i, j - half)
  const jPlus = projectRoomV2FloorGridTilePoint(projection, i, j + half)
  return {
    column,
    row,
    center: projectRoomV2FloorGridTilePoint(projection, i, j),
    alongI: { x: iPlus.x - iMinus.x, y: iPlus.y - iMinus.y },
    alongJ: { x: jPlus.x - jMinus.x, y: jPlus.y - jMinus.y }
  }
}

/**
 * Cells whose centres a footprint covers. `contains` is the footprint test
 * (the same polygon or bounds placement validation uses).
 */
export function getRoomV2FloorGridCellsCoveredBy(
  projection: RoomV2FloorGridProjection,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  contains: (point: RoomWorldPoint) => boolean
): RoomV2FloorGridCell[] {
  const corners = [
    unprojectRoomV2FloorGridPoint(projection, bounds.minX, bounds.minY),
    unprojectRoomV2FloorGridPoint(projection, bounds.maxX, bounds.minY),
    unprojectRoomV2FloorGridPoint(projection, bounds.minX, bounds.maxY),
    unprojectRoomV2FloorGridPoint(projection, bounds.maxX, bounds.maxY)
  ]
  const perTile = projection.cellsPerTile
  const minColumn = Math.floor(Math.min(...corners.map((corner) => corner.i)) * perTile)
  const maxColumn = Math.ceil(Math.max(...corners.map((corner) => corner.i)) * perTile)
  const minRow = Math.floor(Math.min(...corners.map((corner) => corner.j)) * perTile)
  const maxRow = Math.ceil(Math.max(...corners.map((corner) => corner.j)) * perTile)
  const cells: RoomV2FloorGridCell[] = []
  for (let column = minColumn; column <= maxColumn; column += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const center = getRoomV2FloorGridCellPoint(projection, column, row)
      if (!isRoomV2FloorGridPointOnFloor(projection, center.x, center.y)) continue
      if (contains(center)) cells.push({ column, row })
    }
  }
  return cells
}

/** Drawn grout lines (whole tile coordinates) clipped to the floor outline. */
export function getRoomV2FloorGridLines(
  projection: RoomV2FloorGridProjection
): RoomV2FloorGridSegment[] {
  const { minI, maxI, minJ, maxJ } = projection.tileBounds
  const segments: RoomV2FloorGridSegment[] = []
  for (let i = Math.ceil(minI); i <= Math.floor(maxI); i += 1) {
    const segment = clipSegmentToConvexPolygon(
      projectRoomV2FloorGridTilePoint(projection, i, minJ),
      projectRoomV2FloorGridTilePoint(projection, i, maxJ),
      projection.outline
    )
    if (segment) segments.push(segment)
  }
  for (let j = Math.ceil(minJ); j <= Math.floor(maxJ); j += 1) {
    const segment = clipSegmentToConvexPolygon(
      projectRoomV2FloorGridTilePoint(projection, minI, j),
      projectRoomV2FloorGridTilePoint(projection, maxI, j),
      projection.outline
    )
    if (segment) segments.push(segment)
  }
  return segments
}

/** Cyrus-Beck clipping against a convex polygon of either winding. */
function clipSegmentToConvexPolygon(
  from: RoomWorldPoint,
  to: RoomWorldPoint,
  polygon: readonly RoomWorldPoint[]
): RoomV2FloorGridSegment | null {
  const direction = { x: to.x - from.x, y: to.y - from.y }
  const area = polygon.reduce((total, point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    return total + point.x * next.y - next.x * point.y
  }, 0)
  const orientation = area > 0 ? 1 : -1
  let enter = 0
  let exit = 1
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    // Inward normal of the edge for this winding.
    const normal = {
      x: -(end.y - start.y) * orientation,
      y: (end.x - start.x) * orientation
    }
    const numerator = normal.x * (from.x - start.x) + normal.y * (from.y - start.y)
    const denominator = normal.x * direction.x + normal.y * direction.y
    if (Math.abs(denominator) < 1e-12) {
      if (numerator < 0) return null
      continue
    }
    const t = -numerator / denominator
    if (denominator > 0) enter = Math.max(enter, t)
    else exit = Math.min(exit, t)
    if (enter > exit) return null
  }
  return {
    from: { x: from.x + direction.x * enter, y: from.y + direction.y * enter },
    to: { x: from.x + direction.x * exit, y: from.y + direction.y * exit }
  }
}
