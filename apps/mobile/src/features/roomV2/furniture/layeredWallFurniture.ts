import type { RoomV2FurnitureRenderItem } from "../roomV2.types"
import type { RoomCalibration, ShellPoint, WallSide } from "../calibration/roomCalibration"
import {
  checkWallPiece,
  snapWallPiece,
  stageFractionToWallSpot,
  wallSideAt,
  wallSpotToStageFraction,
  type WallPiecePolicy,
  type WallPieceShape
} from "../calibration/roomWallPlacement"
import type { LayeredFurnitureArt } from "./layeredFurniture"
import rawJaponClock from "./room_v3_clock_japon_flower/item.json"
import rawJaponFrame from "./room_v3_frame_japon_sakura/item.json"
import rawOyunBunnyPoster from "./room_v3_poster_oyun_bunny/item.json"
import rawOyunControllerPoster from "./room_v3_poster_oyun_controller/item.json"

/**
 * Wall pieces drawn from the room camera (Workbench `item.json` `wallVariants`).
 * A flat piece on a back wall has one drawing per wall, projected onto that wall's own measured plane: `right`
 * (rendered rotation 0, the wall along world X) and `left` (rotation 1, along world Z). The camera is orthographic,
 * so sliding the drawing along or up its wall is a pure translation. The wall under the saved anchor picks the
 * drawing; the anchor is the painting's centre (where the editor holds it); the id and saved `x`/`y` never change.
 */

export interface LayeredWallVariant {
  wall: WallSide
  size: [number, number]
  /** Sprite px of the painting's centre at its default mount height: the piece's anchor. */
  anchorPx: [number, number]
  /** Sprite px box around every drawn pixel: x0, y0, x1, y1 (`measured_bbox_px`). */
  artBoxPx: [number, number, number, number]
  /** Measured outline of the drawn pixels, sprite px (`outline_polygon_px`). */
  outlinePx: [number, number][]
}

export interface LayeredWallSpec {
  id: string
  /** Sprite px per shell px (zoom 1). */
  scale: number
  /** Allowed heights of the painting's centre above the floor (world units). */
  mountHeight: [number, number]
  variants: Record<WallSide, LayeredWallVariant>
}

/** Per wall piece id: each wall's layers (bundled with the app). */
export type LayeredWallAssets = Readonly<Record<string, Record<WallSide, LayeredFurnitureArt>>>

const WALL_SIDES: readonly WallSide[] = ["left", "right"]

export const LAYERED_WALL_SPECS: Readonly<Record<string, LayeredWallSpec>> = {
  room_v3_clock_japon_flower: parseLayeredWallSpec(rawJaponClock),
  room_v3_frame_japon_sakura: parseLayeredWallSpec(rawJaponFrame),
  room_v3_poster_oyun_bunny: parseLayeredWallSpec(rawOyunBunnyPoster),
  room_v3_poster_oyun_controller: parseLayeredWallSpec(rawOyunControllerPoster)
}

/** Reads and checks a Workbench wall `item.json`; throws on anything missing or not finite. */
export function parseLayeredWallSpec(raw: unknown): LayeredWallSpec {
  const root = record(raw, "item")
  const id = root.id
  if (typeof id !== "string" || !id) throw new Error("item.id must be a string")
  if (root.wallMount !== true) throw new Error(`${id}: wallMount must be true`)
  const scale = finite(root.scale, "scale")
  if (scale <= 0) throw new Error("scale must be positive")
  const raws = record(root.wallVariants, "wallVariants")
  const variants = {} as Record<WallSide, LayeredWallVariant>
  for (const wall of WALL_SIDES) variants[wall] = parseVariant(raws[wall], wall, scale)
  const mountHeight = pair(root.wallMountHeight, "wallMountHeight")
  if (!(mountHeight[0] < mountHeight[1])) throw new Error("wallMountHeight must be [min, max]")
  return { id, scale, mountHeight, variants }
}

function parseVariant(raw: unknown, wall: WallSide, scale: number): LayeredWallVariant {
  const path = `wallVariants.${wall}`
  const variant = record(raw, path)
  if (finite(variant.scale, `${path}.scale`) !== scale) throw new Error(`${path}.scale must equal item.scale`)
  const size = pair(variant.size_px, `${path}.size_px`)
  const base = pair(variant.anchor_px, `${path}.anchor_px`)
  const mount = finite(variant.mount_height_default, `${path}.mount_height_default`)
  const verticalPxPerUnit = finite(variant.vertical_px_per_unit, `${path}.vertical_px_per_unit`)
  const box = list(variant.measured_bbox_px, `${path}.measured_bbox_px`).map((value) => finite(value, path))
  if (box.length !== 4) throw new Error(`${path}.measured_bbox_px must have 4 numbers`)
  const outlinePx = list(variant.outline_polygon_px, `${path}.outline_polygon_px`)
    .map((point) => pair(point, `${path}.outline_polygon_px`))
  if (outlinePx.length < 3) throw new Error(`${path}.outline_polygon_px must be a polygon`)
  return {
    wall,
    size,
    // the file's anchor is the wall's base line under the painting; the painting's centre is mount units above it
    anchorPx: [base[0], base[1] - mount * verticalPxPerUnit],
    artBoxPx: [box[0]!, box[1]!, box[2]!, box[3]!],
    outlinePx
  }
}

/** One wall's drawing as the wall magnet reads it: box and anchor in stage fractions, the drawn pixels' bounds. */
export function getLayeredWallPieceShape(spec: LayeredWallSpec, wall: WallSide, c: RoomCalibration): WallPieceShape {
  const variant = spec.variants[wall]
  const [w, h] = variant.size
  const [x0, y0, x1, y1] = variant.artBoxPx
  return {
    width: w / spec.scale / c.canvas.width,
    height: h / spec.scale / c.canvas.height,
    anchor: { x: variant.anchorPx[0] / w, y: variant.anchorPx[1] / h },
    art: { minX: x0 / w, maxX: (x1 + 1) / w, minY: y0 / h, maxY: (y1 + 1) / h }
  }
}

/**
 * A layered wall piece where it was saved: the drawing of the wall under its anchor, whether it fits there (wall
 * span, skirting to cap, clear of the door, window and niche) and the strip the editor lights. Idempotent.
 */
export function calibrateLayeredWallRenderItem(
  item: RoomV2FurnitureRenderItem,
  spec: LayeredWallSpec,
  art: Record<WallSide, LayeredFurnitureArt>,
  c: RoomCalibration
): RoomV2FurnitureRenderItem {
  const wall = wallSideAt(c, item)
  const shape = getLayeredWallPieceShape(spec, wall, c)
  const fit = checkWallPiece({ ...shape, x: item.x, y: item.y }, item.surfacePlacementPolicy, c)
  const layers = art[wall]
  const { renderOffset: _offset, frontOcclusion: _occlusion, foregroundOcclusionAsset: _foreground, ...base } = item
  void _offset
  void _occlusion
  void _foreground
  return {
    ...base,
    asset: layers.back,
    usesMirroredRotation: false,
    width: shape.width,
    height: shape.height,
    anchor: shape.anchor,
    wallPlacement: { wall: fit.wall, isValid: fit.isValid && isMountHeightValid(spec, item, c), strip: fit.strip, cover: fit.cover },
    layered25d: { ...(layers.shadow ? { shadowAsset: layers.shadow } : {}), seats: [] }
  }
}

/** Whether the painting's centre (the anchor) is inside the piece's own mount heights. */
function isMountHeightValid(spec: LayeredWallSpec, point: ShellPoint, c: RoomCalibration): boolean {
  const { height } = stageFractionToWallSpot(c, wallSideAt(c, point), point)
  return height >= spec.mountHeight[0] - MOUNT_TOLERANCE && height <= spec.mountHeight[1] + MOUNT_TOLERANCE
}

const MOUNT_TOLERANCE = 1e-3

/**
 * The wall magnet for a layered wall piece held at a stage point: the drawing of the wall under the finger, its
 * centre kept inside its own mount heights, then the room's magnet (whole steps along and up the wall, slid off
 * openings). Returns the anchor's stage point.
 */
export function snapLayeredWallItem(
  spec: LayeredWallSpec,
  point: ShellPoint,
  policy: WallPiecePolicy | undefined,
  c: RoomCalibration
): ShellPoint {
  const wall = wallSideAt(c, point)
  const spot = stageFractionToWallSpot(c, wall, point)
  // the magnet snaps heights to quarter units: aim inside the range so the snapped centre stays in it
  const low = Math.ceil(spec.mountHeight[0] * 4 - 1e-6) / 4
  const high = Math.floor(spec.mountHeight[1] * 4 + 1e-6) / 4
  const height = Math.max(low, Math.min(high, spot.height))
  const target = wallSpotToStageFraction(c, { ...spot, height })
  return snapWallPiece(getLayeredWallPieceShape(spec, wall, c), target, policy, c).point
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value as Record<string, unknown>
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`)
  return value
}

function pair(value: unknown, path: string): [number, number] {
  const values = list(value, path)
  if (values.length !== 2) throw new Error(`${path} must have 2 numbers`)
  return [finite(values[0], path), finite(values[1], path)]
}
