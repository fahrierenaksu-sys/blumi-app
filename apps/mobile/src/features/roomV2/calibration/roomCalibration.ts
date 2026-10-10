import rawCalibration from "./room_calibration.json"

/**
 * The measured camera of the Blumi Home shell (room_v2_shell_blumi_world_v1), from the Workbench's
 * `avatar25-v2/furniture/room_calibration.json` (copied verbatim next to this file). Pure maths, no React.
 *
 * World frame (lab40 / three.js): X runs right-down along the right wall, Z left-down along the left wall, Y up;
 * 1 unit = 1 painted floor tile; placement cells are 0.5 units. Shell px: the shell image at zoom 1, x right,
 * y down. Stage fractions: shell px divided by the canvas size (the app's stage coordinates).
 *
 * The camera is orthographic, so the floor (Y = 0) maps to the screen by one affine map: screen y grows with
 * X + Z, which is therefore the depth key (larger = nearer the camera).
 */

export interface FloorPoint {
  /** World X. */
  x: number
  /** World Z. */
  z: number
}

export interface WorldPoint {
  x: number
  y: number
  z: number
}

export interface ShellPoint {
  x: number
  y: number
}

export interface StageSize {
  width: number
  height: number
}

/** An axis-aligned floor box in world units (a footprint made of whole cells, possibly shifted to a wall). */
export interface FloorBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** A measured wall base line: `X = atT0 + perUnit * Z` (left wall) or `Z = atT0 + perUnit * X` (right wall). */
export interface WallBaseLine {
  atT0: number
  perUnit: number
}

/** A painted opening on a back wall: the door, the window or the lamp niche. Nothing hangs over it. */
export interface WallOpening {
  id: string
  wall: WallSide
  /** Along the wall: world Z on the left wall, world X on the right wall. */
  along: [number, number]
  /** World height above the floor. */
  height: [number, number]
}

export type WallSide = "left" | "right"

export interface RoomCalibration {
  version: string
  shellSha256: string
  canvas: StageSize
  /** Shell px of the world origin. */
  origin: ShellPoint
  /** Shell px per world unit along the screen axes. */
  pxPerUnit: number
  /** World directions of screen right and screen up. */
  screenRight: [number, number, number]
  screenUp: [number, number, number]
  /** The painted floor's top edge (back corner, right wall end, the front bay, left wall end). */
  floorPolygon: FloorPoint[]
  /** The floor her foot centre may stand on: the painted floor inset by her foot radius. */
  walkablePolygon: FloorPoint[]
  footRadius: number
  leftWall: WallBaseLine
  rightWall: WallBaseLine
  /** The walls' height up to the underside of their top cap (world units): wall pieces stay below it. */
  wallHeight: number
  /** The door, window and lamp niche (room_calibration.json `walls.features`). */
  openings: WallOpening[]
  cell: number
  /** Her height in world units in the lab (lab40 charScale 1.55 x 2.0). */
  avatarHeight: number
  /** The worked example: ground truth for the conversions. */
  example: { world: WorldPoint; shell: ShellPoint; worldUp: WorldPoint; shellUp: ShellPoint }
}

export const ROOM_CALIBRATION_VERSION = "blumi-room-calibration-1"

/** Reads and checks the calibration file; throws on anything missing or not a finite number. */
export function parseRoomCalibration(raw: unknown): RoomCalibration {
  const root = record(raw, "calibration")
  const version = text(root.version, "version")
  if (version !== ROOM_CALIBRATION_VERSION) throw new Error(`Unsupported room calibration version: ${version}`)
  const shell = record(root.shell, "shell")
  const camera = record(root.camera, "camera")
  const axes = record(camera.screen_axes_world, "camera.screen_axes_world")
  const floor = record(root.floor, "floor")
  const walls = record(root.walls, "walls")
  const grid = record(root.grid, "grid")
  const avatar = record(root.avatar, "avatar")
  const example = record(record(root.conversion, "conversion").example, "conversion.example")
  const size = numbers(shell.size_px, 2, "shell.size_px")
  const origin = numbers(camera.world_origin_shell_px, 2, "camera.world_origin_shell_px")
  return {
    version,
    shellSha256: text(shell.sha256, "shell.sha256"),
    canvas: { width: size[0]!, height: size[1]! },
    origin: { x: origin[0]!, y: origin[1]! },
    pxPerUnit: positive(camera.px_per_world_unit, "camera.px_per_world_unit"),
    screenRight: numbers(axes.right, 3, "screen right") as [number, number, number],
    screenUp: numbers(axes.up, 3, "screen up") as [number, number, number],
    floorPolygon: floorPolygon(floor.painted_floor_polygon_world_xz, "floor.painted_floor_polygon_world_xz"),
    walkablePolygon: floorPolygon(floor.walkable_polygon_world_xz, "floor.walkable_polygon_world_xz"),
    footRadius: positive(floor.foot_radius, "floor.foot_radius"),
    leftWall: wall(walls.left, "walls.left"),
    rightWall: wall(walls.right, "walls.right"),
    wallHeight: positive(walls.height_to_cap_underside, "walls.height_to_cap_underside"),
    openings: wallOpenings(walls.features, "walls.features"),
    cell: positive(grid.cell, "grid.cell"),
    avatarHeight: positive(avatar.height_world, "avatar.height_world"),
    example: {
      world: worldPoint(example.world, "example.world"),
      shell: shellPoint(example.shell_px, "example.shell_px"),
      worldUp: worldPoint(example.world_1_unit_up, "example.world_1_unit_up"),
      shellUp: shellPoint(example.shell_px_1_unit_up, "example.shell_px_1_unit_up")
    }
  }
}

/** The bundled Blumi Home calibration. */
export const ROOM_CALIBRATION: RoomCalibration = parseRoomCalibration(rawCalibration)

// ---- world <-> shell px <-> stage ----

export function worldToShell(c: RoomCalibration, p: WorldPoint): ShellPoint {
  const [rx, ry, rz] = c.screenRight
  const [ux, uy, uz] = c.screenUp
  return {
    x: c.origin.x + c.pxPerUnit * (rx * p.x + ry * p.y + rz * p.z),
    y: c.origin.y - c.pxPerUnit * (ux * p.x + uy * p.y + uz * p.z)
  }
}

export function floorToShell(c: RoomCalibration, p: FloorPoint): ShellPoint {
  return worldToShell(c, { x: p.x, y: 0, z: p.z })
}

/** The floor point (Y = 0) under a shell px: the exact inverse of `floorToShell`. */
export function shellToFloor(c: RoomCalibration, s: ShellPoint): FloorPoint {
  const [rx, , rz] = c.screenRight
  const [ux, , uz] = c.screenUp
  // dx = k (rx X + rz Z), dy = -k (ux X + uz Z)
  const dx = (s.x - c.origin.x) / c.pxPerUnit
  const dy = -(s.y - c.origin.y) / c.pxPerUnit
  const det = rx * uz - rz * ux
  return { x: (dx * uz - rz * dy) / det, z: (rx * dy - ux * dx) / det }
}

/** Stage px for a stage of `stage` px (stage fractions with `{ width: 1, height: 1 }`). */
export function worldToStage(c: RoomCalibration, p: WorldPoint, stage: StageSize): ShellPoint {
  const s = worldToShell(c, p)
  return { x: (s.x / c.canvas.width) * stage.width, y: (s.y / c.canvas.height) * stage.height }
}

export function floorToStage(c: RoomCalibration, p: FloorPoint, stage: StageSize): ShellPoint {
  return worldToStage(c, { x: p.x, y: 0, z: p.z }, stage)
}

/** The floor point under a stage px (a tap, or a stage-fraction point with `{ width: 1, height: 1 }`). */
export function stageToFloor(c: RoomCalibration, p: ShellPoint, stage: StageSize): FloorPoint {
  return shellToFloor(c, { x: (p.x / stage.width) * c.canvas.width, y: (p.y / stage.height) * c.canvas.height })
}

const STAGE_FRACTION: StageSize = { width: 1, height: 1 }

export function floorToStageFraction(c: RoomCalibration, p: FloorPoint): ShellPoint {
  return floorToStage(c, p, STAGE_FRACTION)
}

export function stageFractionToFloor(c: RoomCalibration, p: ShellPoint): FloorPoint {
  return stageToFloor(c, p, STAGE_FRACTION)
}

// ---- floor polygons ----

export function isPointInFloorPolygon(p: FloorPoint, polygon: readonly FloorPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

export function isFloorPointWalkable(c: RoomCalibration, p: FloorPoint): boolean {
  return isPointInFloorPolygon(p, c.walkablePolygon)
}

/** The point itself when walkable, else the nearest point of the walkable floor (world distance). */
export function nearestWalkableFloorPoint(c: RoomCalibration, p: FloorPoint): FloorPoint {
  if (isFloorPointWalkable(c, p)) return { x: p.x, z: p.z }
  const polygon = c.walkablePolygon
  let best = polygon[0]!
  let bestDistance = Infinity
  for (let i = 0; i < polygon.length; i += 1) {
    const q = closestPointOnSegment(p, polygon[i]!, polygon[(i + 1) % polygon.length]!)
    const distance = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = q
    }
  }
  // a hair inside, so the result is walkable by the same point test
  const centre = polygonCentroid(polygon)
  const length = Math.hypot(centre.x - best.x, centre.z - best.z) || 1
  return { x: best.x + ((centre.x - best.x) / length) * INSIDE_NUDGE, z: best.z + ((centre.z - best.z) / length) * INSIDE_NUDGE }
}

const INSIDE_NUDGE = 1e-3

/**
 * The point where a floor point outside `polygon` meets it when moved straight down the screen (along +X +Z, the
 * floor direction that keeps screen x), or null when that line misses the polygon.
 */
export function dropFloorPointOnto(p: FloorPoint, polygon: readonly FloorPoint[]): FloorPoint | null {
  if (isPointInFloorPolygon(p, polygon)) return { x: p.x, z: p.z }
  let enter = Infinity
  for (let i = 0; i < polygon.length; i += 1) {
    const t = rayEntersSegment(p, polygon[i]!, polygon[(i + 1) % polygon.length]!)
    if (t !== null && t < enter) enter = t
  }
  if (!Number.isFinite(enter)) return null
  return { x: p.x + enter, z: p.z + enter }
}

/**
 * Where a tap at a stage-fraction point walks her. On the floor: that floor point, kept on the walkable floor.
 * Above the back walls (the tap's floor point lies behind a wall): the walkable spot straight below the tap, in
 * front of that wall's skirting. Off the floor's front or sides: the nearest walkable spot.
 */
export function resolveTapFloorTarget(c: RoomCalibration, stageFraction: ShellPoint): FloorPoint {
  const floor = stageFractionToFloor(c, stageFraction)
  if (!isPointInFloorPolygon(floor, c.floorPolygon) && dropFloorPointOnto(floor, c.floorPolygon)) {
    const below = dropFloorPointOnto(floor, c.walkablePolygon)
    if (below) return nearestWalkableFloorPoint(c, { x: below.x + INSIDE_NUDGE, z: below.z + INSIDE_NUDGE })
  }
  return nearestWalkableFloorPoint(c, floor)
}

// ---- depth ----

/** Draw-order key of a floor point: larger is nearer the camera (screen y grows with X + Z). */
export function floorDepthKey(p: FloorPoint): number {
  return p.x + p.z
}

/**
 * Whether feet at `p` are in front of an upright piece standing on `box`: past its front face on either floor
 * axis. When the point is past the box on one axis and behind it on the other (beside it on screen), the
 * depth keys decide.
 */
export function isFloorPointInFrontOfBox(p: FloorPoint, box: FloorBox): boolean {
  const frontOnX = p.x >= box.maxX
  const frontOnZ = p.z >= box.maxZ
  const behindOnX = p.x <= box.minX
  const behindOnZ = p.z <= box.minZ
  if ((frontOnX && !behindOnZ) || (frontOnZ && !behindOnX)) return true
  if ((behindOnX && !frontOnZ) || (behindOnZ && !frontOnX)) return false
  return floorDepthKey(p) > (box.maxX + box.minX + box.maxZ + box.minZ) / 2
}

// ---- avatar size ----

/** Shell px per world unit of height (a point one unit up moves straight up by this). */
export function verticalPxPerUnit(c: RoomCalibration): number {
  return c.pxPerUnit * c.screenUp[1]
}

/** Her drawn height in stage px for a world height: one scale for every axis and every spot in the room. */
export function avatarFigureHeightPx(c: RoomCalibration, worldHeight: number, stageHeightPx: number): number {
  return ((worldHeight * verticalPxPerUnit(c)) / c.canvas.height) * stageHeightPx
}

// ---- grid ----

export interface FloorCell {
  i: number
  j: number
}

export function floorCellOf(c: RoomCalibration, p: FloorPoint): FloorCell {
  return { i: Math.floor(p.x / c.cell), j: Math.floor(p.z / c.cell) }
}

export function floorCellCentre(c: RoomCalibration, cell: FloorCell): FloorPoint {
  return { x: (cell.i + 0.5) * c.cell, z: (cell.j + 0.5) * c.cell }
}

/** The box's corners on the floor: back, right, front, left on screen. */
export function floorBoxCorners(box: FloorBox): FloorPoint[] {
  return [
    { x: box.minX, z: box.minZ },
    { x: box.maxX, z: box.minZ },
    { x: box.maxX, z: box.maxZ },
    { x: box.minX, z: box.maxZ }
  ]
}

/** A footprint of whole cells (possibly moved flush to a wall) split into its cells, back to front. */
export function floorBoxCells(box: FloorBox, cell: number): FloorBox[] {
  const columns = Math.max(1, Math.round((box.maxX - box.minX) / cell))
  const rows = Math.max(1, Math.round((box.maxZ - box.minZ) / cell))
  const cells: FloorBox[] = []
  for (let i = 0; i < columns; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const minX = box.minX + i * cell
      const minZ = box.minZ + j * cell
      cells.push({ minX, maxX: minX + cell, minZ, maxZ: minZ + cell })
    }
  }
  return cells
}

export function leftWallX(c: RoomCalibration, z: number): number {
  return c.leftWall.atT0 + c.leftWall.perUnit * z
}

export function rightWallZ(c: RoomCalibration, x: number): number {
  return c.rightWall.atT0 + c.rightWall.perUnit * x
}

/** Gap kept between a wall-flush footprint and the wall's base line (world units): it touches, never crosses. */
export const WALL_FLUSH_GAP = 0.01

/**
 * A footprint of whole cells whose back is less than a cell from a back wall goes flush against that wall's
 * measured base line (the painted walls are 0.7° / 1.7° off the tiles, so the last row is a sliver of 0.1-0.5
 * units, or cut by the wall): it neither floats in front of the wall nor sinks into it. A footprint a whole cell
 * or more into a wall stays there (and is off the floor); other footprints are unchanged.
 */
export function fitFloorBoxToWalls(c: RoomCalibration, box: FloorBox): FloorBox {
  let next = { ...box }
  const wallX = Math.max(leftWallX(c, next.minZ), leftWallX(c, next.maxZ))
  const gapX = next.minX - wallX
  if (gapX > -c.cell && gapX < c.cell) next = shiftFloorBox(next, WALL_FLUSH_GAP - gapX, 0)
  const wallZ = Math.max(rightWallZ(c, next.minX), rightWallZ(c, next.maxX))
  const gapZ = next.minZ - wallZ
  if (gapZ > -c.cell && gapZ < c.cell) next = shiftFloorBox(next, 0, WALL_FLUSH_GAP - gapZ)
  return next
}

export function shiftFloorBox(box: FloorBox, dx: number, dz: number): FloorBox {
  return { minX: box.minX + dx, maxX: box.maxX + dx, minZ: box.minZ + dz, maxZ: box.maxZ + dz }
}

/** Whether every corner of the box is on the painted floor (behind no wall, before the front edge). */
export function isFloorBoxOnFloor(c: RoomCalibration, box: FloorBox): boolean {
  return floorBoxCorners(box).every((corner) => isPointInFloorPolygon(corner, c.floorPolygon))
}

// ---- helpers ----

function closestPointOnSegment(p: FloorPoint, a: FloorPoint, b: FloorPoint): FloorPoint {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSquared = dx * dx + dz * dz
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSquared))
  return { x: a.x + dx * t, z: a.z + dz * t }
}

/** Parameter t >= 0 where the ray p + t (1, 1) crosses segment a-b, or null. */
function rayEntersSegment(p: FloorPoint, a: FloorPoint, b: FloorPoint): number | null {
  const ex = b.x - a.x
  const ez = b.z - a.z
  // p + t (1, 1) = a + s e  =>  t - s ex = wx, t - s ez = wz
  const det = ez - ex
  if (Math.abs(det) < 1e-12) return null
  const wx = a.x - p.x
  const wz = a.z - p.z
  const s = (wx - wz) / det
  const t = wx + s * ex
  if (t < 0 || s < 0 || s > 1) return null
  return t
}

function polygonCentroid(polygon: readonly FloorPoint[]): FloorPoint {
  let x = 0
  let z = 0
  for (const point of polygon) {
    x += point.x
    z += point.z
  }
  return { x: x / polygon.length, z: z / polygon.length }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Room calibration: ${name} missing`)
  return value as Record<string, unknown>
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Room calibration: ${name} missing`)
  return value
}

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Room calibration: ${name} is not a number`)
  return value
}

function positive(value: unknown, name: string): number {
  const number = finite(value, name)
  if (number <= 0) throw new Error(`Room calibration: ${name} must be positive`)
  return number
}

function numbers(value: unknown, count: number, name: string): number[] {
  if (!Array.isArray(value) || value.length !== count) throw new Error(`Room calibration: ${name} needs ${count} numbers`)
  return value.map((entry, index) => finite(entry, `${name}[${index}]`))
}

function floorPolygon(value: unknown, name: string): FloorPoint[] {
  if (!Array.isArray(value) || value.length < 3) throw new Error(`Room calibration: ${name} needs a polygon`)
  return value.map((entry, index) => {
    const [x, z] = numbers(entry, 2, `${name}[${index}]`)
    return { x: x!, z: z! }
  })
}

function wall(value: unknown, name: string): WallBaseLine {
  const line = record(value, name)
  return { atT0: finite(line.at_t0, `${name}.at_t0`), perUnit: finite(line.per_unit, `${name}.per_unit`) }
}

function wallOpenings(value: unknown, name: string): WallOpening[] {
  return Object.entries(record(value, name)).map(([id, entry]) => {
    const feature = record(entry, `${name}.${id}`)
    const side = text(feature.wall, `${name}.${id}.wall`)
    if (side !== "left" && side !== "right") throw new Error(`Room calibration: ${name}.${id}.wall must be left or right`)
    const [alongStart, alongEnd] = numbers(feature.along, 2, `${name}.${id}.along`)
    const [bottom, top] = numbers(feature.y, 2, `${name}.${id}.y`)
    return { id, wall: side, along: [alongStart!, alongEnd!], height: [bottom!, top!] }
  })
}

function worldPoint(value: unknown, name: string): WorldPoint {
  const [x, y, z] = numbers(value, 3, name)
  return { x: x!, y: y!, z: z! }
}

function shellPoint(value: unknown, name: string): ShellPoint {
  const [x, y] = numbers(value, 2, name)
  return { x: x!, y: y! }
}
