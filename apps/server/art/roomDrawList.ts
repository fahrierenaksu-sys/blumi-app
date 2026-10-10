/**
 * The room showcase draw list, bundled into `dist/art/roomDrawList.cjs` by `scripts/build-art-pack.mjs` (esbuild).
 * It runs the app's own pure room calibration (`apps/mobile/src/features/roomV2/{calibration,furniture}`: item
 * specs from `item.json`, floor cells, wall fit, depth), so the Discover picture puts every piece where My Room
 * draws it, with the app's own asset tables (`layeredFurnitureAssets.ts`): the pack builder bundles every image
 * `require` as its path under `roomV2/` (a symmetric piece reuses its r0 files exactly as in the app), and that path
 * is the file's art-pack path. No React Native and no image is loaded here.
 *
 * Draw order is My Room's with nobody seated: shell, flat rugs, every floor shadow, wall pieces, then the other
 * pieces far to near by depth, each with its back layer (with no sitter the back layer is the whole piece).
 */
import { ROOM_CALIBRATION } from "../../mobile/src/features/roomV2/calibration/roomCalibration"
import {
  calibrateLayeredFurnitureRenderItem,
  LAYERED_FURNITURE_SPECS,
  type LayeredFurnitureArt,
  type LayeredRotationIndex
} from "../../mobile/src/features/roomV2/furniture/layeredFurniture"
import {
  LAYERED_FURNITURE_ASSETS,
  LAYERED_WALL_ASSETS
} from "../../mobile/src/features/roomV2/furniture/layeredFurnitureAssets"
import { ROOM_AVATAR_25D_LAYERED_FLOOR_ENTRIES } from "../../mobile/src/features/roomV2/furniture/layeredFurnitureCatalog"
import {
  calibrateLayeredWallRenderItem,
  LAYERED_WALL_SPECS
} from "../../mobile/src/features/roomV2/furniture/layeredWallFurniture"
import type { RoomV2FurnitureRenderItem } from "../../mobile/src/features/roomV2/roomV2.types"

export const ROOM_SHELL_ID = "room_v2_shell_blumi_world_v1"
export const ROOM_SHELL_ART_PATH = "room/room_shell_blumi_world_v1.webp"

export interface RoomDrawPlacedItem {
  instanceId: string
  itemId: string
  x: number
  y: number
  rotation: "front" | "back" | "left" | "right"
}

/** One layer to composite, in shell canvas pixels (`canvas` below), drawn in list order. */
export interface RoomDrawOp {
  path: string
  left: number
  top: number
  width: number
  height: number
}

export interface RoomDrawList {
  canvas: { width: number; height: number }
  shellPath: string
  ops: RoomDrawOp[]
  /** Placed items that have no drawing in this pack (legacy, unknown): skipped, never thrown. */
  skipped: number
}

const FLAT_IDS = new Set(ROOM_AVATAR_25D_LAYERED_FLOOR_ENTRIES.filter((entry) => entry.flat).map((entry) => entry.id))
const ROTATIONS: readonly LayeredRotationIndex[] = [0, 1, 2, 3]

/** The art-pack path of one bundled layer (the builder turns each image `require` into its path). */
const artPath = (asset: unknown): string => String((asset as { source: unknown }).source)

function artPaths(art: LayeredFurnitureArt): string[] {
  return [art.back, art.shadow].filter(Boolean).map(artPath)
}

/** Every art-pack path a placed piece of this id can name (the pack builder copies exactly these). */
export function listRoomItemArtPaths(itemId: string): string[] {
  const wall = LAYERED_WALL_ASSETS[itemId]
  const floor = LAYERED_FURNITURE_ASSETS[itemId]
  const layers = wall ? [wall.left, wall.right] : floor ? ROTATIONS.map((r) => floor[r]) : []
  return [...new Set(layers.flatMap(artPaths))]
}

export function listDrawableRoomItemIds(): string[] {
  return [
    ...Object.keys(LAYERED_FURNITURE_SPECS).filter((id) => LAYERED_FURNITURE_ASSETS[id]),
    ...Object.keys(LAYERED_WALL_SPECS).filter((id) => LAYERED_WALL_ASSETS[id])
  ]
}

interface Calibrated {
  item: RoomV2FurnitureRenderItem
  flat: boolean
  wall: boolean
}

function calibrate(placed: RoomDrawPlacedItem, hasFile: (path: string) => boolean): Calibrated | null {
  const base = {
    kind: "furniture",
    renderId: placed.instanceId,
    itemId: placed.itemId,
    x: placed.x,
    y: placed.y,
    depth: placed.y,
    rotation: placed.rotation
  } as unknown as RoomV2FurnitureRenderItem
  if (!listRoomItemArtPaths(placed.itemId).every(hasFile)) return null
  const wallSpec = LAYERED_WALL_SPECS[placed.itemId]
  const wallArt = LAYERED_WALL_ASSETS[placed.itemId]
  if (wallSpec && wallArt) {
    return { item: calibrateLayeredWallRenderItem(base, wallSpec, wallArt, ROOM_CALIBRATION), flat: false, wall: true }
  }
  const spec = LAYERED_FURNITURE_SPECS[placed.itemId]
  const art = LAYERED_FURNITURE_ASSETS[placed.itemId]
  if (!spec || !art) return null
  return {
    item: calibrateLayeredFurnitureRenderItem(base, spec, art, ROOM_CALIBRATION),
    flat: FLAT_IDS.has(placed.itemId),
    wall: false
  }
}

function op(item: RoomV2FurnitureRenderItem, path: string, canvas: { width: number; height: number }): RoomDrawOp {
  const offset = item.renderOffset ?? { x: 0, y: 0 }
  return {
    path,
    left: (item.x + offset.x - item.width * item.anchor.x) * canvas.width,
    top: (item.y + offset.y - item.height * item.anchor.y) * canvas.height,
    width: item.width * canvas.width,
    height: item.height * canvas.height
  }
}

const assetPath = artPath

/** The draw list for saved decor; unknown or undrawable items are skipped and counted. */
export function resolveRoomDrawList(
  placedItems: readonly RoomDrawPlacedItem[],
  hasFile: (path: string) => boolean
): RoomDrawList {
  const canvas = { width: ROOM_CALIBRATION.canvas.width, height: ROOM_CALIBRATION.canvas.height }
  const calibrated: Calibrated[] = []
  let skipped = 0
  for (const placed of placedItems) {
    const entry = calibrate(placed, hasFile)
    if (entry) calibrated.push(entry)
    else skipped += 1
  }
  const byDepth = (a: Calibrated, b: Calibrated) => (a.item.depth ?? a.item.y) - (b.item.depth ?? b.item.y)
  const flats = calibrated.filter((entry) => entry.flat).sort(byDepth)
  const walls = calibrated.filter((entry) => entry.wall).sort(byDepth)
  const standing = calibrated.filter((entry) => !entry.flat && !entry.wall).sort(byDepth)
  const ops: RoomDrawOp[] = [
    ...flats.map((entry) => op(entry.item, assetPath(entry.item.asset), canvas)),
    ...calibrated
      .filter((entry) => entry.item.layered25d?.shadowAsset)
      .map((entry) => op(entry.item, assetPath(entry.item.layered25d!.shadowAsset), canvas)),
    ...walls.map((entry) => op(entry.item, assetPath(entry.item.asset), canvas)),
    ...standing.map((entry) => op(entry.item, assetPath(entry.item.asset), canvas))
  ]
  return { canvas, shellPath: ROOM_SHELL_ART_PATH, ops, skipped }
}
