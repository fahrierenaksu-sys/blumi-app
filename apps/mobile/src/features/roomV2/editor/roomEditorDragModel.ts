import type { MyRoomEditorCopy } from "../myRoomCopy"
import {
  getRoomV2DepthPerspectiveScale,
  getRoomV2FurnitureMobileRenderScale
} from "../roomV2RenderSurface"
import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomV2RenderItem
} from "../roomV2.types"
import {
  createRoomEditorStagePlacementPreview,
  createRoomEditorTrayPlacementPreview,
  type PlacementPreview,
  type StageWindowBounds
} from "./roomEditorPlacementModel"

/**
 * Pure rules for My Room editor drag-to-move. The `"worklet"` functions run
 * on the UI thread inside the Gesture Handler pans (hit test, finger to stage
 * point, snapped cell); the rest run on JS when the cell changes or the piece
 * is dropped, and reuse the tap placement rules in roomEditorPlacementModel.
 */

/** Hold before a drag lifts the piece; moving 10 pt earlier leaves the touch to taps, scroll and edge back. */
export const ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS = 220
/** Normalized stage grid a drag snaps to; JS recomputes validity only when the cell changes. */
export const ROOM_EDITOR_DRAG_CELL_STEP = 0.02
/** Cell index used while a tray drag is off the stage. */
export const ROOM_EDITOR_DRAG_OUTSIDE_CELL = -100000
export const ROOM_EDITOR_DRAG_LIFT_SCALE = 1.06
/** The lifted piece stays fully opaque (ROOM-10); the lift scale shows it is held. */
export const ROOM_EDITOR_DRAG_GHOST_OPACITY = 1
/** After a valid drop the ghost settles onto the placed piece and fades. */
export const ROOM_EDITOR_DRAG_SETTLE_FADE_MS = 140
export const ROOM_EDITOR_DRAG_RETURN_SPRING = { damping: 20, stiffness: 260, mass: 1 } as const

export type RoomEditorDragSource = "stage" | "tray"
export type RoomEditorDragRelease = "commit" | "reject" | "cancel"

/** A placed piece's rendered box and anchor in normalized stage coordinates. */
export interface RoomEditorDragHitRect {
  renderId: string
  left: number
  top: number
  right: number
  bottom: number
  anchorX: number
  anchorY: number
}

export interface RoomEditorDragPoint {
  x: number
  y: number
  inside: boolean
}

export interface RoomEditorDragCell {
  column: number
  row: number
}

export interface RoomEditorDragGhostFrame {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

function getRenderedSize(item: Pick<RoomV2RenderItem, "kind" | "width" | "height" | "y">) {
  const scale = getRoomV2DepthPerspectiveScale(item.y) * getRoomV2FurnitureMobileRenderScale(item.kind)
  return { width: item.width * scale, height: item.height * scale }
}

/** Hit boxes for the draggable furniture, in render order (last is drawn on top), as RoomRenderer2D lays them out. */
export function createRoomEditorDragHitRects(
  renderItems: readonly RoomV2RenderItem[]
): RoomEditorDragHitRect[] {
  return renderItems.flatMap((item) => {
    if (item.kind !== "furniture") return []
    const size = getRenderedSize(item)
    const left = item.x - size.width * item.anchor.x
    const top = item.y - size.height * item.anchor.y
    return [{
      renderId: item.renderId,
      left,
      top,
      right: left + size.width,
      bottom: top + size.height,
      anchorX: item.x,
      anchorY: item.y
    }]
  })
}

/** Index of the top-most piece under a normalized stage point, or -1. */
export function findRoomEditorDragHitRect(
  rects: readonly RoomEditorDragHitRect[],
  x: number,
  y: number
): number {
  "worklet"
  for (let index = rects.length - 1; index >= 0; index -= 1) {
    const rect = rects[index]
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return index
  }
  return -1
}

/** Where a stage drag puts the piece's anchor, keeping the offset at which it was grabbed. */
export function getRoomEditorStageDragPoint(input: {
  localX: number
  localY: number
  stageWidth: number
  stageHeight: number
  grabOffsetX: number
  grabOffsetY: number
}): RoomEditorDragPoint {
  "worklet"
  if (input.stageWidth <= 0 || input.stageHeight <= 0) return { x: 0, y: 0, inside: false }
  return {
    x: input.localX / input.stageWidth - input.grabOffsetX,
    y: input.localY / input.stageHeight - input.grabOffsetY,
    inside: true
  }
}

/** A tray drag's window point on the measured stage; off the stage is `inside: false`. */
export function getRoomEditorTrayDragPoint(input: {
  absoluteX: number
  absoluteY: number
  bounds: StageWindowBounds | undefined
}): RoomEditorDragPoint {
  "worklet"
  const bounds = input.bounds
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0, inside: false }
  const x = (input.absoluteX - bounds.x) / bounds.width
  const y = (input.absoluteY - bounds.y) / bounds.height
  return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 }
}

export function getRoomEditorDragCell(point: RoomEditorDragPoint): RoomEditorDragCell {
  "worklet"
  if (!point.inside) {
    return { column: ROOM_EDITOR_DRAG_OUTSIDE_CELL, row: ROOM_EDITOR_DRAG_OUTSIDE_CELL }
  }
  return {
    column: Math.round(point.x / ROOM_EDITOR_DRAG_CELL_STEP),
    row: Math.round(point.y / ROOM_EDITOR_DRAG_CELL_STEP)
  }
}

export function hasRoomEditorDragCellChanged(
  previousColumn: number,
  previousRow: number,
  column: number,
  row: number
): boolean {
  "worklet"
  return previousColumn !== column || previousRow !== row
}

/** Normalized stage coordinate of a cell index (rounded to drop float noise). */
export function getRoomEditorDragCellValue(index: number): number {
  return Math.round(index * ROOM_EDITOR_DRAG_CELL_STEP * 10000) / 10000
}

function isOutsideCell(column: number, row: number): boolean {
  return column === ROOM_EDITOR_DRAG_OUTSIDE_CELL || row === ROOM_EDITOR_DRAG_OUTSIDE_CELL
}

/** Preview for moving a placed piece to a cell, with the tap placement rules. */
export function createRoomEditorStageDragPreview(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  renderId: string
  column: number
  row: number
}): PlacementPreview | undefined {
  if (isOutsideCell(input.column, input.row)) return undefined
  return createRoomEditorStagePlacementPreview({
    copy: input.copy,
    scene: input.scene,
    selectedInstanceId: input.renderId,
    point: {
      x: getRoomEditorDragCellValue(input.column),
      y: getRoomEditorDragCellValue(input.row)
    }
  })
}

/** Preview for dropping a new tray piece at a cell; off-stage or unmeasured is undefined. */
export function createRoomEditorTrayDragPreview(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  stageWindowBounds: StageWindowBounds | undefined
  item: FurnitureItem
  instanceId: string
  rotation: PlacedRoomItem["rotation"]
  column: number
  row: number
}): PlacementPreview | undefined {
  const bounds = input.stageWindowBounds
  if (!bounds || isOutsideCell(input.column, input.row)) return undefined
  return createRoomEditorTrayPlacementPreview({
    copy: input.copy,
    scene: input.scene,
    stageWindowBounds: bounds,
    item: input.item,
    instanceId: input.instanceId,
    rotation: input.rotation,
    pageX: bounds.x + getRoomEditorDragCellValue(input.column) * bounds.width,
    pageY: bounds.y + getRoomEditorDragCellValue(input.row) * bounds.height
  })
}

/**
 * What a drop does: a valid furniture preview commits (same path as the
 * confirm control), an invalid one springs back, and a drop that never left
 * its start cell or landed off the stage cancels without an error.
 */
export function resolveRoomEditorDragRelease(input: {
  source: RoomEditorDragSource
  moved: boolean
  inside: boolean
  preview: PlacementPreview | undefined
}): RoomEditorDragRelease {
  if (input.source === "tray" && !input.inside) return "cancel"
  if (input.source === "stage" && !input.moved) return "cancel"
  if (input.preview?.isValid && input.preview.item.kind === "furniture") return "commit"
  return "reject"
}

/** A selection tick when the spot under a drag flips valid ↔ invalid; never on entering or leaving the stage. */
export function shouldTickRoomEditorDragValidity(
  previous: PlacementPreview | undefined,
  next: PlacementPreview | undefined
): boolean {
  return previous !== undefined && next !== undefined && previous.isValid !== next.isValid
}

export function getRoomEditorDragFeedback(
  preview: PlacementPreview | undefined,
  copy: MyRoomEditorCopy
): string | undefined {
  if (!preview) return undefined
  if (preview.isValid) return preview.feedback ?? copy.feedback.releaseToPlace
  return preview.feedback ?? copy.feedback.chooseCompatibleSurface
}

/** Ghost size in stage pixels, offset so the ghost's anchor sits on its position. */
export function getRoomEditorDragGhostFrame(
  item: Pick<RoomV2RenderItem, "kind" | "width" | "height" | "y" | "anchor">,
  stageSize: { width: number; height: number }
): RoomEditorDragGhostFrame {
  const size = getRenderedSize(item)
  const width = size.width * stageSize.width
  const height = size.height * stageSize.height
  return {
    width,
    height,
    offsetX: -width * item.anchor.x,
    offsetY: -height * item.anchor.y
  }
}
