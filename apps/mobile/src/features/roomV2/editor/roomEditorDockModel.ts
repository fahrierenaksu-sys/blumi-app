import type { FurnitureCategory } from "../roomV2.types"
import type {
  RoomEditorInventoryCategoryId,
  RoomEditorInventoryEntry
} from "./roomEditorPresentationModel"

/**
 * Pure layout and presentation decisions for the floating-dock editor: how
 * large the room is drawn, which category tabs exist, how the compact tray
 * pages, and what the selection capsule offers.
 */

export const ROOM_EDITOR_DOCK_COLUMNS = 3
/** The room may grow past the screen width to fill a tall stage; never more. */
export const ROOM_EDITOR_STAGE_MAX_FILL_SCALE = 1.2
export type RoomEditorStageZoom = "fill" | "fit"

export interface RoomEditorStageFrame {
  left: number
  top: number
  width: number
  height: number
}

interface RoomEditorStageFrameInput {
  availableWidth: number
  availableHeight: number
  /** Room shell canvas width divided by height. */
  aspectRatio: number
  zoom: RoomEditorStageZoom
}

function getRoomEditorStageScale(input: RoomEditorStageFrameInput): number {
  const { availableWidth, availableHeight, aspectRatio, zoom } = input
  if (availableWidth <= 0 || availableHeight <= 0 || aspectRatio <= 0) return 0
  // Width scale at which the room is exactly as tall as the stage.
  const heightScale = (availableHeight * aspectRatio) / availableWidth
  return Math.min(zoom === "fill" ? ROOM_EDITOR_STAGE_MAX_FILL_SCALE : 1, heightScale)
}

/**
 * The room keeps its aspect ratio and is never taller than the stage. "fit"
 * shows the whole room; "fill" lets it grow past the side edges (cropped) so a
 * tall stage is used. The frame is real layout, not a transform, so pointer
 * mapping keeps measuring the true room surface.
 */
export function getRoomEditorStageFrame(input: RoomEditorStageFrameInput): RoomEditorStageFrame {
  const scale = getRoomEditorStageScale(input)
  if (scale <= 0) return { left: 0, top: 0, width: 0, height: 0 }
  const width = Math.round(input.availableWidth * scale)
  const height = Math.round(width / input.aspectRatio)
  return {
    left: Math.round((input.availableWidth - width) / 2),
    // Centred in the stage; the selection capsule floats over the room's front edge.
    top: Math.round((input.availableHeight - height) / 2),
    width,
    height
  }
}

/**
 * A zoom changes the real frame at once (so touches map to the true room)
 * and then plays back from the old frame: this transform makes the new frame
 * look exactly like the old one, and a spring takes it to identity. Scale is
 * about the frame's centre. Unusable frames give identity.
 */
export function getRoomEditorStageZoomFlip(
  previous: RoomEditorStageFrame,
  next: RoomEditorStageFrame
): { scale: number; translateX: number; translateY: number } {
  if (previous.width <= 0 || next.width <= 0) return { scale: 1, translateX: 0, translateY: 0 }
  return {
    scale: previous.width / next.width,
    translateX: previous.left + previous.width / 2 - (next.left + next.width / 2),
    translateY: previous.top + previous.height / 2 - (next.top + next.height / 2)
  }
}

/** The zoom control only exists when the two modes draw different rooms. */
export function canToggleRoomEditorStageZoom(
  input: Omit<RoomEditorStageFrameInput, "zoom">
): boolean {
  return (
    getRoomEditorStageScale({ ...input, zoom: "fill" }) >
    getRoomEditorStageScale({ ...input, zoom: "fit" })
  )
}

/** "all" plus, in catalog order, every category the collection really has. */
export function getRoomEditorVisibleCategoryIds(
  inventoryEntries: readonly RoomEditorInventoryEntry[],
  categoryOrder: readonly FurnitureCategory[]
): RoomEditorInventoryCategoryId[] {
  const present = new Set(inventoryEntries.map((entry) => entry.item.category))
  return ["all", ...categoryOrder.filter((category) => present.has(category))]
}

export function getRoomEditorDockCardWidth(listWidth: number, gap: number): number {
  if (listWidth <= 0) return 0
  return Math.floor((listWidth - gap * (ROOM_EDITOR_DOCK_COLUMNS - 1)) / ROOM_EDITOR_DOCK_COLUMNS)
}

/** The compact dock shows one row of cards; the expanded dock at most two. */
export function getRoomEditorDockRowCount(isDockExpanded: boolean, entryCount: number): number {
  return isDockExpanded && entryCount > ROOM_EDITOR_DOCK_COLUMNS ? 2 : 1
}

export function getRoomEditorDockPageCount(entryCount: number, rowCount: number): number {
  return Math.max(1, Math.ceil(entryCount / (ROOM_EDITOR_DOCK_COLUMNS * rowCount)))
}

/**
 * Tray cards as the columns of a sideways-paging list. Each page holds
 * `rowCount` rows of three and reads row by row, so column `c` of a page
 * stacks the page's entries `c`, `c + 3`, ...
 */
export function getRoomEditorDockColumns<Entry>(
  entries: readonly Entry[],
  rowCount: number
): Entry[][] {
  const pageSize = ROOM_EDITOR_DOCK_COLUMNS * rowCount
  const columns: Entry[][] = []
  for (let pageStart = 0; pageStart < entries.length; pageStart += pageSize) {
    for (let column = 0; column < ROOM_EDITOR_DOCK_COLUMNS; column += 1) {
      const stack: Entry[] = []
      for (let row = 0; row < rowCount; row += 1) {
        const entry = entries[pageStart + row * ROOM_EDITOR_DOCK_COLUMNS + column]
        if (entry !== undefined) stack.push(entry)
      }
      if (stack.length > 0) columns.push(stack)
    }
  }
  return columns
}

export function getRoomEditorDockPageIndex(
  offsetX: number,
  pageWidth: number,
  pageCount: number
): number {
  if (pageWidth <= 0 || pageCount <= 1) return 0
  return Math.max(0, Math.min(pageCount - 1, Math.round(offsetX / pageWidth)))
}

export type RoomEditorCapsuleMode = "hidden" | "placed" | "tray"

/**
 * The capsule under the room. A piece in the room (or a live drag preview)
 * gets confirm, rotate and remove; a tray piece the user picked gets its
 * direction and Place; otherwise the capsule is hidden.
 */
export function getRoomEditorCapsuleMode(input: {
  selectedInstanceId: string | undefined
  hasValidPlacementPreview: boolean
  pickedTrayItemId: string | undefined
  selectedInventoryEntry: RoomEditorInventoryEntry | undefined
  canPlaceSelectedInventoryItem: boolean
}): RoomEditorCapsuleMode {
  if (input.selectedInstanceId || input.hasValidPlacementPreview) return "placed"
  const entry = input.selectedInventoryEntry
  if (
    entry?.owned &&
    input.pickedTrayItemId === entry.item.id &&
    input.canPlaceSelectedInventoryItem
  ) {
    return "tray"
  }
  return "hidden"
}

/**
 * The tray card drawn as selected: only what the user chose, the piece
 * selected in the room, else the tray piece they tapped.
 */
export function getRoomEditorHighlightedTrayItemId(input: {
  selectedInventoryItemId: string | undefined
  selectedPlacedItemId: string | undefined
  pickedTrayItemId: string | undefined
}): string | undefined {
  if (input.selectedPlacedItemId) return input.selectedPlacedItemId
  return input.pickedTrayItemId === input.selectedInventoryItemId
    ? input.pickedTrayItemId
    : undefined
}

/** The next supplied asset view after the current one; undefined with one view. */
export function getNextRoomEditorTrayRotation<Rotation>(
  rotations: readonly Rotation[],
  current: Rotation
): Rotation | undefined {
  if (rotations.length < 2) return undefined
  return rotations[(rotations.indexOf(current) + 1) % rotations.length]
}
