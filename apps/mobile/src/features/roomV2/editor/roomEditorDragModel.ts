import type { MyRoomEditorCopy } from "../myRoomCopy"
import {
  getRoomV2DepthPerspectiveScale,
  getRoomV2FurnitureMobileRenderScale,
  isRoomV2LayeredFloorPiece
} from "../roomV2RenderSurface"
import {
  getRoomV2FloorGridCellPoint,
  getRoomV2FloorGridProjection,
  roundRoomV2FloorGridPoint,
  snapRoomV2FloorGridCell,
  type RoomV2FloorGridProjection
} from "../roomV2FloorGrid"
import { getRoomV2FurniturePlacementSurface } from "../roomV2PlacementSurface"
import { createRoomV2FurniturePlacementPreview, resolvePlacedFurnitureRenderItem } from "../roomV2Selectors"
import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomShell,
  RoomV2RenderItem
} from "../roomV2.types"
import {
  arePlacementPreviewsEqual,
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
 *
 * Floor pieces on a shell with a measured floor grid snap to that grid's
 * cells (half a drawn tile), so the piece lines up with the drawn tiles and
 * the ghost, the preview and the drop all use one cell. Wall, ceiling and
 * tabletop pieces keep the plain stage grid; in the 2.5D room a
 * wall piece's spot then comes from the wall magnet (snapRoomV2WallPlacementPoint).
 */

/** Hold before a drag lifts the piece; moving 10 pt earlier leaves the touch to taps, scroll and edge back. */
export const ROOM_EDITOR_DRAG_ACTIVATION_DELAY_MS = 220
/** Normalized stage grid non-floor drags snap to; JS recomputes validity only when the cell changes. */
export const ROOM_EDITOR_DRAG_CELL_STEP = 0.02
/**
 * A tray drag holds the piece's floor contact this far above the fingertip
 * (pt), so the spot it will land on is never under the finger.
 */
export const ROOM_EDITOR_TRAY_DRAG_FINGER_LIFT = 36
/** The ghost glides into a newly snapped cell instead of teleporting. */
export const ROOM_EDITOR_DRAG_SNAP_MS = 70
/** Cell index used while a tray drag is off the stage. */
export const ROOM_EDITOR_DRAG_OUTSIDE_CELL = -100000
export const ROOM_EDITOR_DRAG_LIFT_SCALE = 1.04
/** How far the held piece floats above its shadow, in points. */
export const ROOM_EDITOR_DRAG_LIFT_HEIGHT = 6
/** The lifted piece stays fully opaque (ROOM-10); the lift scale shows it is held. */
export const ROOM_EDITOR_DRAG_GHOST_OPACITY = 1

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
  /**
   * Where the piece is drawn from its saved anchor (the room calibration's `renderOffset`, else 0):
   * the ghost shows the piece there, on the spot the drop will draw it.
   */
  drawOffsetX: number
  drawOffsetY: number
  /**
   * The draw offset the piece has once it sits on a grid cell (a layered piece is drawn at its footprint's middle,
   * which depends on where its anchor is in its cell): the snapped ghost uses this one while it moves.
   */
  cellDrawOffsetX: number
  cellDrawOffsetY: number
  /** Floor piece on a floor grid: the drag snaps to grid cells. */
  usesFloorGrid: boolean
  /**
   * Wall piece on a measured wall (room calibration): the held piece sits where the wall magnet put
   * it, not under the finger.
   */
  usesWallMagnet: boolean
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

/** The floor grid a drag of `item` snaps to on `shell`, or null for the plain stage grid. */
export function getRoomEditorDragFloorGrid(
  item: Pick<FurnitureItem, "placementSurface"> | Extract<RoomV2RenderItem, { kind: "furniture" }>,
  shell: RoomShell | null | undefined
): RoomV2FloorGridProjection | null {
  if (!shell?.floorGrid || getRoomV2FurniturePlacementSurface(item) !== "floor") return null
  return getRoomV2FloorGridProjection(shell.floorGrid)
}

/**
 * How far a piece is drawn from its saved anchor (stage fractions): the room calibration's
 * `renderOffset` (a layered piece's footprint centre, a wall-flush move), else nothing. The renderer draws there.
 */
export function getRoomEditorDrawOffset(item: RoomV2RenderItem): { x: number; y: number } {
  const offset = item.kind === "furniture" ? item.renderOffset : undefined
  return offset ? { x: offset.x, y: offset.y } : { x: 0, y: 0 }
}

/** Where a piece is drawn (stage fractions): its saved anchor plus its draw offset. */
export function getRoomEditorDrawPoint(item: RoomV2RenderItem): { x: number; y: number } {
  const offset = getRoomEditorDrawOffset(item)
  return { x: item.x + offset.x, y: item.y + offset.y }
}

/**
 * A tray piece's draw offset (stage fractions), read once per card: the offset it has on a cell in the middle of
 * the floor (it changes only next to a back wall, where JS moves the ghost onto the fitted spot anyway).
 */
export function getRoomEditorTrayDrawOffset(
  item: FurnitureItem,
  rotation: PlacedRoomItem["rotation"],
  shell: RoomShell | null | undefined
): { x: number; y: number } {
  const floor = getRoomEditorDragFloorGrid(item, shell)
  const point = floor
    ? getRoomV2FloorGridCellPoint(
      floor,
      Math.round((floor.minColumn + floor.maxColumn) / 2),
      Math.round((floor.minRow + floor.maxRow) / 2)
    )
    : { x: 0.5, y: 0.7 }
  const renderItem = resolvePlacedFurnitureRenderItem(
    { instanceId: `${item.id}_tray_offset`, itemId: item.id, x: point.x, y: point.y, rotation },
    item
  )
  return renderItem ? getRoomEditorDrawOffset(renderItem) : { x: 0, y: 0 }
}

/**
 * Whether a tray piece goes onto the wall magnet (room calibration: wall pieces resolve with a
 * measured wall placement); everywhere else a wall piece follows the finger as shipped.
 */
export function getRoomEditorTrayUsesWallMagnet(
  item: FurnitureItem,
  rotation: PlacedRoomItem["rotation"]
): boolean {
  if (getRoomV2FurniturePlacementSurface(item) !== "wall") return false
  const renderItem = resolvePlacedFurnitureRenderItem(
    { instanceId: `${item.id}_tray_wall`, itemId: item.id, x: 0.5, y: 0.3, rotation },
    item
  )
  return renderItem?.wallPlacement !== undefined
}

/** A placed piece's draw offset on the grid cell nearest its saved anchor (where any move of it lands). */
export function getRoomEditorCellDrawOffset(
  item: Extract<RoomV2RenderItem, { kind: "furniture" }>,
  floor: RoomV2FloorGridProjection
): { x: number; y: number } {
  const cell = snapRoomV2FloorGridCell(floor, item.x, item.y)
  const point = roundRoomV2FloorGridPoint(getRoomV2FloorGridCellPoint(floor, cell.column, cell.row))
  return getRoomEditorDrawOffset(createRoomV2FurniturePlacementPreview({ item, x: point.x, y: point.y }))
}

/** Hit boxes for the draggable furniture, in render order (last is drawn on top), as RoomRenderer2D lays them out. */
export function createRoomEditorDragHitRects(
  renderItems: readonly RoomV2RenderItem[],
  shell?: RoomShell | null
): RoomEditorDragHitRect[] {
  return renderItems.flatMap((item) => {
    if (item.kind !== "furniture") return []
    const size = getRenderedSize(item)
    const offset = getRoomEditorDrawOffset(item)
    const floor = getRoomEditorDragFloorGrid(item, shell)
    const cellOffset = floor && item.footprintCells ? getRoomEditorCellDrawOffset(item, floor) : offset
    const left = item.x + offset.x - size.width * item.anchor.x
    const top = item.y + offset.y - size.height * item.anchor.y
    return [{
      renderId: item.renderId,
      left,
      top,
      right: left + size.width,
      bottom: top + size.height,
      anchorX: item.x,
      anchorY: item.y,
      drawOffsetX: offset.x,
      drawOffsetY: offset.y,
      cellDrawOffsetX: cellOffset.x,
      cellDrawOffsetY: cellOffset.y,
      usesFloorGrid: floor !== null,
      usesWallMagnet: item.wallPlacement !== undefined
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

/**
 * A tray drag's point on the measured stage: the held piece's floor contact,
 * `lift` pt above the fingertip. Off the stage is `inside: false`.
 */
export function getRoomEditorTrayDragPoint(input: {
  absoluteX: number
  absoluteY: number
  lift: number
  bounds: StageWindowBounds | undefined
}): RoomEditorDragPoint {
  "worklet"
  const bounds = input.bounds
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0, inside: false }
  const x = (input.absoluteX - bounds.x) / bounds.width
  const y = (input.absoluteY - input.lift - bounds.y) / bounds.height
  return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 }
}

/** The cell under a drag point: a floor-grid cell, or a plain stage cell when `floor` is null. */
export function getRoomEditorDragCell(
  point: RoomEditorDragPoint,
  floor: RoomV2FloorGridProjection | null
): RoomEditorDragCell {
  "worklet"
  if (!point.inside) {
    return { column: ROOM_EDITOR_DRAG_OUTSIDE_CELL, row: ROOM_EDITOR_DRAG_OUTSIDE_CELL }
  }
  if (floor) return snapRoomV2FloorGridCell(floor, point.x, point.y)
  return {
    column: Math.round(point.x / ROOM_EDITOR_DRAG_CELL_STEP),
    row: Math.round(point.y / ROOM_EDITOR_DRAG_CELL_STEP)
  }
}

/**
 * Where a floor-grid drag shows the piece: its cell's centre in window
 * coordinates on the stage rectangle. Plain-grid and off-stage drags follow
 * the finger instead.
 */
export function getRoomEditorDragCellWindowPoint(input: {
  floor: RoomV2FloorGridProjection
  column: number
  row: number
  stage: StageWindowBounds
  /** The held piece's draw offset (stage fractions): it is drawn there from its anchor. */
  drawOffsetX: number
  drawOffsetY: number
}): { x: number; y: number } {
  "worklet"
  const point = getRoomV2FloorGridCellPoint(input.floor, input.column, input.row)
  return {
    x: input.stage.x + (point.x + input.drawOffsetX) * input.stage.width,
    y: input.stage.y + (point.y + input.drawOffsetY) * input.stage.height
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

/** Stage point of a drag cell (floor-grid cell centre, or plain stage cell). */
export function getRoomEditorDragCellStagePoint(
  floor: RoomV2FloorGridProjection | null,
  column: number,
  row: number
): { x: number; y: number } {
  if (floor) return getRoomV2FloorGridCellPoint(floor, column, row)
  return { x: getRoomEditorDragCellValue(column), y: getRoomEditorDragCellValue(row) }
}

/** Preview for moving a placed piece to a cell, with the tap placement rules. */
export function createRoomEditorStageDragPreview(input: {
  copy: MyRoomEditorCopy
  scene: ResolvedRoomV2Scene
  renderId: string
  floor: RoomV2FloorGridProjection | null
  column: number
  row: number
}): PlacementPreview | undefined {
  if (isOutsideCell(input.column, input.row)) return undefined
  return createRoomEditorStagePlacementPreview({
    copy: input.copy,
    scene: input.scene,
    selectedInstanceId: input.renderId,
    point: getRoomEditorDragCellStagePoint(input.floor, input.column, input.row),
    floorCell: input.floor ? { column: input.column, row: input.row } : undefined
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
  floor: RoomV2FloorGridProjection | null
  column: number
  row: number
}): PlacementPreview | undefined {
  const bounds = input.stageWindowBounds
  if (!bounds || isOutsideCell(input.column, input.row)) return undefined
  const point = getRoomEditorDragCellStagePoint(input.floor, input.column, input.row)
  return createRoomEditorTrayPlacementPreview({
    copy: input.copy,
    scene: input.scene,
    stageWindowBounds: bounds,
    item: input.item,
    instanceId: input.instanceId,
    rotation: input.rotation,
    // The page point only has to land on the stage; a floor cell decides the spot.
    pageX: bounds.x + Math.max(0, Math.min(1, point.x)) * bounds.width,
    pageY: bounds.y + Math.max(0, Math.min(1, point.y)) * bounds.height,
    floorCell: input.floor ? { column: input.column, row: input.row } : undefined
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

export type RoomEditorDragCellHaptic = "selection" | "rigid"

/**
 * The one haptic for a drag reaching a new spot: a selection tick when the
 * spot flips valid ↔ invalid, otherwise a rigid tick for the new grid cell,
 * and nothing off the stage. Called only when the cell under the drag changes.
 */
export function getRoomEditorDragCellHaptic(
  previous: PlacementPreview | undefined,
  next: PlacementPreview | undefined,
  /** Wall magnet: many finger cells share one wall spot; only a new spot ticks. */
  quietOnSameSpot = false
): RoomEditorDragCellHaptic | null {
  if (next === undefined) return null
  if (quietOnSameSpot && arePlacementPreviewsEqual(previous, next)) return null
  if (previous !== undefined && previous.isValid !== next.isValid) return "selection"
  return "rigid"
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

/** A flat layered piece on the floor layer (a 2.5D rug): the room draws it, never the drag overlay. */
export function isRoomEditorFloorLayerPiece(item: RoomV2RenderItem): boolean {
  return isRoomV2LayeredFloorPiece(item)
}

/**
 * Whether the room itself already draws what a drag overlay stands in for, so the overlay stays hidden. Only a
 * flat floor-layer piece (a 2.5D rug) qualifies: the room draws it on its floor layer, under furniture
 * and avatars, once it is placed (a held piece that is already in the room) or has a preview on a cell.
 * Everything else keeps the floating overlay.
 */
export function getRoomEditorGhostIsDrawnByRoom(input: {
  ghost: { renderId?: string; floorLayer?: boolean } | undefined
  roomRenderIds: ReadonlySet<string>
  previewRenderId: string | undefined
}): boolean {
  const { ghost, roomRenderIds, previewRenderId } = input
  if (!ghost?.floorLayer || ghost.renderId === undefined) return false
  return previewRenderId === ghost.renderId || roomRenderIds.has(ghost.renderId)
}

/** Where the held piece's soft shadow goes: its floor cells' middle and size, px from the piece's anchor. */
export interface RoomEditorDragShadowSpot {
  dx: number
  dy: number
  width: number
  height: number
}

/**
 * The shadow spot of a calibrated piece (one with floor cells), or undefined: the shadow then sits under the
 * drawing as before. The cells, not the drawing, say where the piece stands, whatever padding its art has.
 */
export function getRoomEditorDragShadowSpot(
  item: RoomV2RenderItem,
  stageSize: { width: number; height: number }
): RoomEditorDragShadowSpot | undefined {
  const points = item.kind === "furniture" ? item.footprintCells?.flat() ?? [] : []
  if (points.length === 0) return undefined
  const xs = points.map((point) => point.x * stageSize.width)
  const ys = points.map((point) => point.y * stageSize.height)
  const draw = getRoomEditorDrawPoint(item)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  return {
    dx: (Math.min(...xs) + width / 2) - draw.x * stageSize.width,
    dy: (Math.min(...ys) + height / 2) - draw.y * stageSize.height,
    width,
    height
  }
}

/** The shadow ellipse in the ghost frame's pixels for a shadow spot: a soft oval a little inside the cells. */
export function getRoomEditorDragShadowFrame(
  frame: RoomEditorDragGhostFrame,
  spot: RoomEditorDragShadowSpot
): { left: number; top: number; width: number; height: number } {
  const width = spot.width * 0.8
  const height = Math.max(6, spot.height * 0.55)
  return {
    left: -frame.offsetX + spot.dx - width / 2,
    top: -frame.offsetY + spot.dy - height / 2,
    width,
    height
  }
}
