import { createRoomPetMapFromRoom } from "../roomPet/roomPetRoomAdapter"
import { getRoomPetBeforeRenderId } from "../roomPet/roomPetRoomScene"
import type { RoomPoint2D, RoomShell, RoomV2FurnitureRenderItem, RoomV2RenderItem } from "../roomV2/roomV2.types"
import { getRoomV2FloorGridCellPoint, getRoomV2FloorGridProjection } from "../roomV2/roomV2FloorGrid"
import { getRoomV2FurnitureMobileRenderScale, isRoomV2LayeredFloorPiece } from "../roomV2/roomV2RenderSurface"

/**
 * Where a street window stands the chibi in its room: on a free floor cell (never on a bed, pouf or table), drawn in
 * the room's depth order, and preferably where nothing in front of it hides its body. Pure, in shell fractions.
 */
export interface StreetChibiSpot {
  /** The feet, as a fraction of the shell canvas. */
  readonly foot: RoomPoint2D
  /** The chibi draws just before this item (null: after every item). */
  readonly beforeRenderId: string | null
}

/** The floor point in front of the room's centre the windows framed before furniture was considered. */
export const STREET_CHIBI_SEED: RoomPoint2D = { x: 0.5, y: 0.66 }
/** Share of the chibi's box a piece in front may cover before the spot counts as hidden. */
const HIDDEN_SHARE = 0.04
/** A hidden spot costs more than walking across the whole room. */
const HIDDEN_PENALTY = 10

export function pickStreetChibiSpot(input: {
  readonly shell: RoomShell
  readonly renderItems: readonly RoomV2RenderItem[]
  /** The chibi's drawn box as shell fractions (feet at the bottom centre). */
  readonly chibi: { readonly width: number; readonly height: number }
  readonly seed?: RoomPoint2D
}): StreetChibiSpot {
  const { shell, renderItems, chibi } = input
  const seed = input.seed ?? STREET_CHIBI_SEED
  const fallback = { foot: seed, beforeRenderId: getRoomPetBeforeRenderId(renderItems, seed, null) }
  if (!shell.floorGrid) return fallback
  const projection = getRoomV2FloorGridProjection(shell.floorGrid)
  const furniture = renderItems.filter((item): item is RoomV2FurnitureRenderItem => item.kind === "furniture")
  const map = createRoomPetMapFromRoom({ projection, furniture })
  const upright = renderItems.filter((item) => !isRoomV2LayeredFloorPiece(item))
  let best: { spot: StreetChibiSpot; cost: number } | null = null
  for (const cell of map.cells) {
    const foot = getRoomV2FloorGridCellPoint(projection, cell.column, cell.row)
    const box = getChibiBox(foot, chibi)
    if (box.left < 0 || box.right > 1 || box.top < 0) continue
    const beforeRenderId = getRoomPetBeforeRenderId(renderItems, foot, null)
    const hidden = getHiddenShare(box, getItemsInFront(upright, beforeRenderId))
    const cost = Math.hypot(foot.x - seed.x, foot.y - seed.y) + (hidden > HIDDEN_SHARE ? HIDDEN_PENALTY + hidden : 0)
    if (!best || cost < best.cost) best = { spot: { foot, beforeRenderId }, cost }
  }
  return best?.spot ?? fallback
}

interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

function getChibiBox(foot: RoomPoint2D, chibi: { readonly width: number; readonly height: number }): Box {
  return { left: foot.x - chibi.width / 2, right: foot.x + chibi.width / 2, top: foot.y - chibi.height, bottom: foot.y }
}

function getItemsInFront(upright: readonly RoomV2RenderItem[], beforeRenderId: string | null): readonly RoomV2RenderItem[] {
  if (beforeRenderId === null) return []
  const index = upright.findIndex((item) => item.renderId === beforeRenderId)
  return index < 0 ? [] : upright.slice(index)
}

/** The item's drawn rectangle, the way the room renderer frames it (perspective scale is 1 in the 2.5D room). */
function getStreetItemBox(item: RoomV2RenderItem): Box {
  const offset = item.kind === "furniture" ? item.renderOffset : undefined
  const x = item.x + (offset?.x ?? 0)
  const y = item.y + (offset?.y ?? 0)
  const scale = getRoomV2FurnitureMobileRenderScale(item.kind)
  const width = item.width * scale
  const height = item.height * scale
  const left = x - width * item.anchor.x
  const top = y - height * item.anchor.y
  return { left, top, right: left + width, bottom: top + height }
}

function getHiddenShare(box: Box, inFront: readonly RoomV2RenderItem[]): number {
  const area = (box.right - box.left) * (box.bottom - box.top)
  if (area <= 0) return 0
  let covered = 0
  for (const item of inFront) {
    const other = getStreetItemBox(item)
    const width = Math.min(box.right, other.right) - Math.max(box.left, other.left)
    const height = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top)
    if (width > 0 && height > 0) covered += width * height
  }
  return Math.min(1, covered / area)
}
