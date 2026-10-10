import {
  floorToStageFraction,
  leftWallX,
  rightWallZ,
  ROOM_CALIBRATION,
  worldToStage,
  type RoomCalibration,
  type ShellPoint,
  type WallOpening,
  type WallSide,
  type WorldPoint
} from "./roomCalibration"

/**
 * Wall pieces (frames, clocks, posters, shelves) on the MEASURED back walls. The
 * painted walls are 0.7° / 1.7° off the floor tiles, so a wall piece is placed on the wall's own vertical plane
 * (room_calibration.json `walls.left/right`), never on the tile lattice: a spot is (wall, along, height), along
 * being world Z on the left wall and world X on the right wall. Pure maths in stage fractions; stored rooms keep
 * their `x`/`y` (the anchor's stage point), so nothing saved changes meaning.
 */

/** A spot on a back wall's plane. */
export interface WallSpot {
  wall: WallSide
  /** World Z on the left wall, world X on the right wall. */
  along: number
  /** World height above the floor. */
  height: number
}

/** The wall rectangle a piece's drawing covers (world units on its wall). */
export interface WallCover {
  alongMin: number
  alongMax: number
  heightMin: number
  heightMax: number
}

/** Where the drawn art sits inside a piece's box (fractions of the box). */
export interface WallPieceArt {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** A wall piece's drawing: its box and anchor in stage fractions (as a render item has them). */
export interface WallPieceShape {
  width: number
  height: number
  anchor: { x: number; y: number }
  /** The art's opaque bounds in the box, when measured (`WALL_PIECE_ART`). */
  art?: WallPieceArt
}

/**
 * Measured opaque bounds of the wall pieces' art, as fractions of their room box (alpha bbox of the runtime
 * sprite, contain-fitted in the catalog box). Unlisted pieces use the contained square.
 */
export const WALL_PIECE_ART: Readonly<Record<string, WallPieceArt>> = {
  // furniture_bookshelf_v1.webp: 1024 px canvas, alpha bbox x 206-833, y 58-982; box 0.168 x 0.252 of 1254 x 714
  room_v2_cute_bookshelf: { minX: 0.245, maxX: 0.768, minY: 0.057, maxY: 0.959 }
}

export type WallPiecePolicy = "avoid_openings" | "opening"

export interface WallFit {
  wall: WallSide
  spot: WallSpot
  /** The anchor's stage point (fractions, 6 decimals like a saved spot). */
  point: ShellPoint
  /** Inside its wall's span and height, clear of the door, window and niche (or on the window for curtains). */
  isValid: boolean
  cover: WallCover
  /** The soft strip of wall behind the piece (stage quad: base start, base end, top end, top start). */
  strip: ShellPoint[]
}

/**
 * The magnet's steps along the wall and up it (world units). Along the wall it steps one painted tile, so a piece
 * keeps the floor's rhythm and every step is wider on screen than the drag's finger cell (0.02 of the stage, about
 * 25 shell px; a tile along a wall is about 35 px), so sliding never skips a step. Up the wall a quarter unit is
 * about 24 px.
 */
export const WALL_SNAP_ALONG = 0.5
export const WALL_SNAP_HEIGHT = 0.25
/** The lowest a wall piece's drawing reaches: clear of the skirting (world units above the floor). */
export const WALL_PIECE_MIN_HEIGHT = 0.3
/** Kept clear of the back corner and of the walls' front ends (world units). */
export const WALL_PIECE_END_MARGIN = 0.05
/** How far along the wall (world units) the magnet slides a piece off a door, window or niche. */
export const WALL_OPENING_SEARCH = 2
/** The highlight strip reaches this far (world units) past the piece on each side. */
export const WALL_STRIP_MARGIN = 0.2
/** Openings a piece with the "opening" policy (curtains) hangs on. */
const HANGING_OPENING_IDS: ReadonlySet<string> = new Set(["window"])
const FIT_TOLERANCE = 1e-3

const STAGE_FRACTION = { width: 1, height: 1 }

export function wallSpotToWorld(c: RoomCalibration, spot: WallSpot): WorldPoint {
  return spot.wall === "left"
    ? { x: leftWallX(c, spot.along), y: spot.height, z: spot.along }
    : { x: spot.along, y: spot.height, z: rightWallZ(c, spot.along) }
}

export function wallSpotToStageFraction(c: RoomCalibration, spot: WallSpot): ShellPoint {
  return worldToStage(c, wallSpotToWorld(c, spot), STAGE_FRACTION)
}

/** The spot on `wall`'s plane drawn at a stage point: the exact inverse of `wallSpotToStageFraction`. */
export function stageFractionToWallSpot(c: RoomCalibration, wall: WallSide, p: ShellPoint): WallSpot {
  const origin = wallSpotToStageFraction(c, { wall, along: 0, height: 0 })
  const a = wallSpotToStageFraction(c, { wall, along: 1, height: 0 })
  const h = wallSpotToStageFraction(c, { wall, along: 0, height: 1 })
  const ax = a.x - origin.x
  const ay = a.y - origin.y
  const hx = h.x - origin.x
  const hy = h.y - origin.y
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  const det = ax * hy - hx * ay
  return { wall, along: (dx * hy - hx * dy) / det, height: (ax * dy - dx * ay) / det }
}

/** The back corner's stage x: left of it is the left wall, right of it the right wall (at every height). */
export function wallSideAt(c: RoomCalibration, p: ShellPoint): WallSide {
  return p.x < floorToStageFraction(c, c.floorPolygon[0]!).x ? "left" : "right"
}

/** A wall's span along its plane: from the back corner to its front end on the painted floor. */
export function wallSpan(c: RoomCalibration, wall: WallSide): [number, number] {
  const corner = c.floorPolygon[0]!
  return wall === "left"
    ? [corner.z, c.floorPolygon[c.floorPolygon.length - 1]!.z]
    : [corner.x, c.floorPolygon[1]!.x]
}

/**
 * The drawn art inside a piece's box (fractions of the box). A room sprite is a square canvas drawn "contain", so
 * without a measurement the art is the box's centred square; measured pieces give their opaque bounds.
 */
export function getWallPieceArt(piece: WallPieceShape, stageAspect: number): WallPieceArt {
  if (piece.art) return piece.art
  // the box in px is width x (height / aspect); the contained square has the smaller side
  const widthPx = piece.width * stageAspect
  const side = Math.min(widthPx, piece.height)
  const insetX = (1 - side / widthPx) / 2
  const insetY = (1 - side / piece.height) / 2
  return { minX: insetX, maxX: 1 - insetX, minY: insetY, maxY: 1 - insetY }
}

/**
 * The wall a piece's art covers, relative to its anchor's spot (the map is affine, so this is the same anywhere on
 * that wall). Along the wall from the art's left and right edges (screen x alone decides `along`); up the wall
 * from its top and bottom edges through the art's middle, so a flat drawing on a slanted wall is not padded by
 * the slant.
 */
export function wallPieceExtent(c: RoomCalibration, wall: WallSide, piece: WallPieceShape): WallCover {
  const origin = wallSpotToStageFraction(c, { wall, along: 0, height: 0 })
  const art = getWallPieceArt(piece, c.canvas.width / c.canvas.height)
  const left = origin.x + piece.width * (art.minX - piece.anchor.x)
  const right = origin.x + piece.width * (art.maxX - piece.anchor.x)
  const top = origin.y + piece.height * (art.minY - piece.anchor.y)
  const bottom = origin.y + piece.height * (art.maxY - piece.anchor.y)
  const middleX = (left + right) / 2
  const alongs = [left, right].map((x) => stageFractionToWallSpot(c, wall, { x, y: origin.y }).along)
  const heights = [top, bottom].map((y) => stageFractionToWallSpot(c, wall, { x: middleX, y }).height)
  return {
    alongMin: Math.min(...alongs),
    alongMax: Math.max(...alongs),
    heightMin: Math.min(...heights),
    heightMax: Math.max(...heights)
  }
}

function coverAt(spot: WallSpot, extent: WallCover): WallCover {
  return {
    alongMin: spot.along + extent.alongMin,
    alongMax: spot.along + extent.alongMax,
    heightMin: spot.height + extent.heightMin,
    heightMax: spot.height + extent.heightMax
  }
}

function overlapsOpening(cover: WallCover, opening: WallOpening): boolean {
  return cover.alongMin < opening.along[1] - FIT_TOLERANCE &&
    cover.alongMax > opening.along[0] + FIT_TOLERANCE &&
    cover.heightMin < opening.height[1] - FIT_TOLERANCE &&
    cover.heightMax > opening.height[0] + FIT_TOLERANCE
}

function isCoverValid(c: RoomCalibration, wall: WallSide, cover: WallCover, policy: WallPiecePolicy): boolean {
  const [start, end] = wallSpan(c, wall)
  const inside =
    cover.alongMin >= start + WALL_PIECE_END_MARGIN - FIT_TOLERANCE &&
    cover.alongMax <= end - WALL_PIECE_END_MARGIN + FIT_TOLERANCE &&
    cover.heightMin >= WALL_PIECE_MIN_HEIGHT - FIT_TOLERANCE &&
    cover.heightMax <= c.wallHeight + FIT_TOLERANCE
  if (!inside) return false
  const openings = c.openings.filter((opening) => opening.wall === wall)
  if (policy === "opening") {
    return openings.some((opening) => HANGING_OPENING_IDS.has(opening.id) && overlapsOpening(cover, opening))
  }
  return !openings.some((opening) => overlapsOpening(cover, opening))
}

function fitAt(c: RoomCalibration, spot: WallSpot, extent: WallCover, policy: WallPiecePolicy): WallFit {
  const cover = coverAt(spot, extent)
  return {
    wall: spot.wall,
    spot,
    point: roundStage(wallSpotToStageFraction(c, spot)),
    isValid: isCoverValid(c, spot.wall, cover, policy),
    cover,
    strip: getWallStrip(c, spot.wall, cover)
  }
}

/** A wall piece where it is (its saved or previewed anchor), without moving it: is it on a wall, and clear? */
export function checkWallPiece(
  piece: WallPieceShape & ShellPoint,
  policy: WallPiecePolicy = "avoid_openings",
  c: RoomCalibration = ROOM_CALIBRATION
): WallFit {
  const wall = wallSideAt(c, piece)
  const spot = stageFractionToWallSpot(c, wall, piece)
  const fit = fitAt(c, spot, wallPieceExtent(c, wall, piece), policy)
  // the piece stays exactly where it was saved
  return { ...fit, point: { x: piece.x, y: piece.y } }
}

/**
 * The magnet: a wall piece held at stage point `target` goes onto the wall under it, flush on the measured plane,
 * on the next whole step along and up the wall, kept inside the wall's span and between the skirting and the
 * cap. Over a door, window or niche it slides along the wall to the nearest clear step (up to
 * WALL_OPENING_SEARCH units); curtains instead hang centred on the window of that wall. When nothing nearby is
 * clear the spot is returned invalid, so the editor shows it red and the drop springs back.
 */
export function snapWallPiece(
  piece: WallPieceShape,
  target: ShellPoint,
  policy: WallPiecePolicy = "avoid_openings",
  c: RoomCalibration = ROOM_CALIBRATION
): WallFit {
  const wall = wallSideAt(c, target)
  const raw = stageFractionToWallSpot(c, wall, target)
  const extent = wallPieceExtent(c, wall, piece)
  const [start, end] = wallSpan(c, wall)
  const alongLow = start + WALL_PIECE_END_MARGIN - extent.alongMin
  const alongHigh = end - WALL_PIECE_END_MARGIN - extent.alongMax
  const heightLow = WALL_PIECE_MIN_HEIGHT - extent.heightMin
  const heightHigh = c.wallHeight - extent.heightMax
  const spotAt = (along: number, height: number): WallSpot => ({
    wall,
    along: clamp(along, alongLow, alongHigh),
    height: clamp(height, heightLow, heightHigh)
  })
  if (policy === "opening") {
    const window = nearestOpening(c.openings.filter((opening) =>
      opening.wall === wall && HANGING_OPENING_IDS.has(opening.id)), raw.along)
    if (window) {
      return fitAt(c, spotAt(middle(window.along), middle(window.height)), extent, policy)
    }
  }
  const height = snap(raw.height, WALL_SNAP_HEIGHT)
  const along = snap(raw.along, WALL_SNAP_ALONG)
  const first = fitAt(c, spotAt(along, height), extent, policy)
  if (first.isValid) return first
  const steps = Math.round(WALL_OPENING_SEARCH / WALL_SNAP_ALONG)
  // try the side the finger is on first, then the other, one step further each time
  const towardFinger = raw.along >= along ? 1 : -1
  for (let step = 1; step <= steps; step += 1) {
    for (const side of [towardFinger, -towardFinger]) {
      const fit = fitAt(c, spotAt(along + side * step * WALL_SNAP_ALONG, height), extent, policy)
      if (fit.isValid) return fit
    }
  }
  return first
}

/** The strip of wall behind a cover, floor to cap, a little wider than the piece (stage quad). */
export function getWallStrip(c: RoomCalibration, wall: WallSide, cover: WallCover): ShellPoint[] {
  const [start, end] = wallSpan(c, wall)
  const from = clamp(cover.alongMin - WALL_STRIP_MARGIN, start, end)
  const to = clamp(cover.alongMax + WALL_STRIP_MARGIN, start, end)
  return [
    { wall, along: from, height: 0 },
    { wall, along: to, height: 0 },
    { wall, along: to, height: c.wallHeight },
    { wall, along: from, height: c.wallHeight }
  ].map((spot) => roundStage(wallSpotToStageFraction(c, spot)))
}

function nearestOpening(openings: WallOpening[], along: number): WallOpening | undefined {
  let best: WallOpening | undefined
  let bestDistance = Infinity
  for (const opening of openings) {
    const distance = Math.abs(middle(opening.along) - along)
    if (distance < bestDistance) {
      best = opening
      bestDistance = distance
    }
  }
  return best
}

function middle(range: [number, number]): number {
  return (range[0] + range[1]) / 2
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step
}

function clamp(value: number, low: number, high: number): number {
  if (low > high) return (low + high) / 2
  return Math.max(low, Math.min(high, value))
}

/** Stage coordinates keep 6 decimals (sub-pixel on any canvas), as persisted points do. */
function roundStage(point: ShellPoint): ShellPoint {
  return { x: Math.round(point.x * 1e6) / 1e6, y: Math.round(point.y * 1e6) / 1e6 }
}
