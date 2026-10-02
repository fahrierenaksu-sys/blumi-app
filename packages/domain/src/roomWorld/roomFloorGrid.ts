import type { RoomWorldPoint } from "./roomWorldGeometry"

/**
 * The floor of a fixed-angle room shell, measured on the drawn art.
 *
 * The shell's floor is a slightly perspective (not perfectly isometric)
 * quadrilateral, so one affine grid cannot follow its tiles. A projective map
 * (homography) from tile coordinates to the canvas does: tile (i, j) has its
 * grout crossings at whole numbers, `i` running along the back-right wall and
 * `j` along the back-left wall. Everything is normalized to the shell canvas
 * (x / width, y / height), which is also the stage coordinate system every
 * renderer, the editor, avatar walking and the server use.
 *
 * This is the one floor model: the editor's placement grid, the walkable area
 * and the walk lattice (roomFloorNavigation) all derive from it.
 */
export interface RoomFloorGrid {
  id: string
  /**
   * Drawn grout crossings at tile (0, 0), (span, 0), (span, span), (0, span).
   * Measured, not authored (the mobile roomV2FloorGrid test overlays them).
   */
  latticeCorners: readonly [RoomWorldPoint, RoomWorldPoint, RoomWorldPoint, RoomWorldPoint]
  latticeSpan: number
  /** Placement and walk cells per drawn tile along each axis (2 = half tiles). */
  cellsPerTile: number
  /** The drawn floor's top surface, including the front bay. Convex. */
  outline: readonly RoomWorldPoint[]
}

/**
 * Blumi Home (room_v2_shell_blumi_world_v1, 1254x714), measured on the
 * shipped runtime webp. The lattice is a least-squares fit to 49 detected
 * grout crossings (largest residual 2.6 px on the 1254 px canvas); the
 * outline follows the floor's top edges: back corner (600, 271), right
 * (1209, 475), the front bay (767, 640) (617, 668) (468, 632) and left
 * (36, 474) px.
 */
export const ROOM_BLUMI_WORLD_FLOOR_GRID: RoomFloorGrid = {
  id: "room_v2_shell_blumi_world_v1.floor_grid.v1",
  latticeCorners: [
    { x: 0.47681, y: 0.42531 },
    { x: 0.8654, y: 0.67378 },
    { x: 0.47998, y: 0.92499 },
    { x: 0.09429, y: 0.67463 }
  ],
  latticeSpan: 7,
  cellsPerTile: 2,
  outline: [
    { x: 0.47847, y: 0.37955 },
    { x: 0.96411, y: 0.66527 },
    { x: 0.61164, y: 0.89636 },
    { x: 0.49203, y: 0.93557 },
    { x: 0.3732, y: 0.88515 },
    { x: 0.02871, y: 0.66387 }
  ]
}

/** The Blumi Home canvas in pixels: distances on its floor are measured in these proportions. */
export const ROOM_BLUMI_WORLD_CANVAS = { width: 1254, height: 714 } as const

/**
 * Plain-number homography: unit square (u, v) -> stage is
 * x = (f0 u + f1 v + f2) / w, y = (f3 u + f4 v + f5) / w, w = f6 u + f7 v + 1;
 * `inverse` is the row-major 3x3 inverse (stage -> unit square).
 */
export interface RoomFloorHomography {
  forward: number[]
  inverse: number[]
}

/** Heckbert's unit-square to quadrilateral map: (0,0), (1,0), (1,1), (0,1) -> corners. */
export function createRoomFloorHomography(
  corners: readonly [RoomWorldPoint, RoomWorldPoint, RoomWorldPoint, RoomWorldPoint]
): RoomFloorHomography {
  const [p0, p1, p2, p3] = corners
  const sx = p0.x - p1.x + p2.x - p3.x
  const sy = p0.y - p1.y + p2.y - p3.y
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const denominator = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / denominator
  const h = (dx1 * sy - sx * dy1) / denominator
  const forward = [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h
  ]
  return {
    forward,
    inverse: invert3x3([
      forward[0], forward[1], forward[2],
      forward[3], forward[4], forward[5],
      forward[6], forward[7], 1
    ])
  }
}

/** Stage point of a unit-square lattice coordinate. */
export function projectRoomFloorUnitPoint(
  homography: RoomFloorHomography,
  u: number,
  v: number
): RoomWorldPoint {
  const m = homography.forward
  const w = m[6] * u + m[7] * v + 1
  return {
    x: (m[0] * u + m[1] * v + m[2]) / w,
    y: (m[3] * u + m[4] * v + m[5]) / w
  }
}

/** Unit-square lattice coordinate under a stage point (exact inverse). */
export function unprojectRoomFloorPoint(
  homography: RoomFloorHomography,
  x: number,
  y: number
): { u: number; v: number } {
  const n = homography.inverse
  const w = n[6] * x + n[7] * y + n[8]
  return {
    u: (n[0] * x + n[1] * y + n[2]) / w,
    v: (n[3] * x + n[4] * y + n[5]) / w
  }
}

function invert3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, k] = m
  const A = e * k - f * h
  const B = -(d * k - f * g)
  const C = d * h - e * g
  const determinant = a * A + b * B + c * C
  return [
    A / determinant, -(b * k - c * h) / determinant, (b * f - c * e) / determinant,
    B / determinant, (a * k - c * g) / determinant, -(a * f - c * d) / determinant,
    C / determinant, -(a * h - b * g) / determinant, (a * e - b * d) / determinant
  ]
}
