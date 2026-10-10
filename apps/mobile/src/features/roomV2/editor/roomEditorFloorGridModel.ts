import {
  getRoomV2FloorGridCellShape,
  getRoomV2FloorGridCellsCoveredBy,
  getRoomV2FloorGridLines,
  getRoomV2FloorGridProjection,
  snapRoomV2FloorGridCell,
  type RoomV2FloorGridProjection
} from "../roomV2FloorGrid"
import { getRoomV2FurniturePlacementSurface } from "../roomV2PlacementSurface"
import { getRoomV2FurnitureFootprintTest } from "../roomV2Selectors"
import type { RoomShell, RoomV2RenderItem } from "../roomV2.types"
import type { PlacementPreview } from "./roomEditorPlacementModel"

/**
 * What the editor draws on the floor while a floor piece is being placed:
 * the drawn tiles' grout lines (so the grid visibly is the floor) and the
 * cells the piece's footprint covers, tinted valid or invalid. Pure layout in
 * stage pixels; React renders it only when the preview changes (once per
 * snapped cell), never per frame.
 */

/** Side of the square view a parallelogram is transformed from. */
export const ROOM_EDITOR_FLOOR_SHAPE_BASE = 100
export const ROOM_EDITOR_FLOOR_LINE_WIDTH = 1

export type RoomEditorFloorTone = "valid" | "invalid" | "selected"

export interface RoomEditorFloorLine {
  key: string
  left: number
  top: number
  width: number
  rotateRad: number
}

/** A square view of ROOM_EDITOR_FLOOR_SHAPE_BASE, centred on `center` and turned into a parallelogram by `matrix`. */
export interface RoomEditorFloorShape {
  key: string
  left: number
  top: number
  matrix: number[]
}

export interface RoomEditorFloorOverlay {
  lines: RoomEditorFloorLine[]
  cells: RoomEditorFloorShape[]
  tone: RoomEditorFloorTone
  /** The cells are the piece's calibrated floor cells: drawn as soft diamonds. */
  calibrated?: boolean
  /** A wall piece on a measured wall: the soft strip of wall it hangs on. */
  wallStrip?: RoomEditorWallStrip
}

/** The strip of wall behind a wall piece, floor to cap, and its base line along the skirting (stage px). */
export interface RoomEditorWallStrip {
  shape: RoomEditorFloorShape
  base: RoomEditorFloorLine
}

/** Height of the wall strip's base line (px). */
export const ROOM_EDITOR_WALL_STRIP_BASE_WIDTH = 2

interface StageSize {
  width: number
  height: number
}

/**
 * 4x4 column-major matrix (React Native `transform: [{ matrix }]`) that maps
 * a centred square of side `base` onto the parallelogram with edge vectors
 * `alongI` and `alongJ` (pixels). Transforms act about the view centre.
 */
export function getRoomEditorParallelogramMatrix(
  alongI: { x: number; y: number },
  alongJ: { x: number; y: number },
  base: number = ROOM_EDITOR_FLOOR_SHAPE_BASE
): number[] {
  return [
    alongI.x / base, alongI.y / base, 0, 0,
    alongJ.x / base, alongJ.y / base, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]
}

function toShape(
  key: string,
  center: { x: number; y: number },
  alongI: { x: number; y: number },
  alongJ: { x: number; y: number }
): RoomEditorFloorShape {
  return {
    key,
    left: center.x - ROOM_EDITOR_FLOOR_SHAPE_BASE / 2,
    top: center.y - ROOM_EDITOR_FLOOR_SHAPE_BASE / 2,
    matrix: getRoomEditorParallelogramMatrix(alongI, alongJ)
  }
}

/** Grout lines of the drawn floor as rotated hairline views, in stage pixels. */
export function getRoomEditorFloorGridLines(
  projection: RoomV2FloorGridProjection,
  stage: StageSize
): RoomEditorFloorLine[] {
  return getRoomV2FloorGridLines(projection).map((segment, index) => {
    const from = { x: segment.from.x * stage.width, y: segment.from.y * stage.height }
    const to = { x: segment.to.x * stage.width, y: segment.to.y * stage.height }
    const width = Math.hypot(to.x - from.x, to.y - from.y)
    return {
      key: `line-${index}`,
      left: (from.x + to.x) / 2 - width / 2,
      top: (from.y + to.y) / 2 - ROOM_EDITOR_FLOOR_LINE_WIDTH / 2,
      width,
      rotateRad: Math.atan2(to.y - from.y, to.x - from.x)
    }
  })
}

/** The floor cells a furniture render item covers (at least the cell under its anchor). */
export function getRoomEditorFootprintCells(
  projection: RoomV2FloorGridProjection,
  item: Extract<RoomV2RenderItem, { kind: "furniture" }>
): { column: number; row: number }[] {
  const footprint = getRoomV2FurnitureFootprintTest(item)
  const cells = getRoomV2FloorGridCellsCoveredBy(projection, footprint.bounds, footprint.contains)
  return cells.length > 0 ? cells : [snapRoomV2FloorGridCell(projection, item.x, item.y)]
}

/**
 * A calibrated piece's own floor cells (each a stage quad: back, right, front, left) as parallelograms in stage
 * pixels: exactly the cells it stands on, wall-flush moves included.
 */
export function getRoomEditorFootprintCellShapes(
  quads: readonly (readonly { x: number; y: number }[])[],
  stage: StageSize
): RoomEditorFloorShape[] {
  return quads.flatMap((quad, index) => {
    const [back, right, , left] = quad
    if (!back || !right || !left || quad.length !== 4) return []
    const center = {
      x: (quad.reduce((sum, point) => sum + point.x, 0) / 4) * stage.width,
      y: (quad.reduce((sum, point) => sum + point.y, 0) / 4) * stage.height
    }
    const alongI = { x: (right.x - back.x) * stage.width, y: (right.y - back.y) * stage.height }
    const alongJ = { x: (left.x - back.x) * stage.width, y: (left.y - back.y) * stage.height }
    return [toShape(`foot-${index}`, center, alongI, alongJ)]
  })
}

/** A wall piece's strip (stage quad: base start, base end, top end, top start) in stage pixels. */
export function getRoomEditorWallStrip(
  quad: readonly { x: number; y: number }[],
  stage: StageSize
): RoomEditorWallStrip | undefined {
  const [baseStart, baseEnd, , topStart] = quad
  if (!baseStart || !baseEnd || !topStart || quad.length !== 4) return undefined
  const px = (point: { x: number; y: number }) => ({ x: point.x * stage.width, y: point.y * stage.height })
  const from = px(baseStart)
  const to = px(baseEnd)
  const top = px(topStart)
  const center = {
    x: (quad.reduce((sum, point) => sum + point.x, 0) / 4) * stage.width,
    y: (quad.reduce((sum, point) => sum + point.y, 0) / 4) * stage.height
  }
  const width = Math.hypot(to.x - from.x, to.y - from.y)
  return {
    shape: toShape("wall-strip", center, { x: to.x - from.x, y: to.y - from.y }, { x: top.x - from.x, y: top.y - from.y }),
    base: {
      key: "wall-base",
      left: (from.x + to.x) / 2 - width / 2,
      top: (from.y + to.y) / 2 - ROOM_EDITOR_WALL_STRIP_BASE_WIDTH / 2,
      width,
      rotateRad: Math.atan2(to.y - from.y, to.x - from.x)
    }
  }
}

function createWallStripOverlay(
  item: RoomV2RenderItem | undefined,
  tone: RoomEditorFloorTone,
  stage: StageSize
): RoomEditorFloorOverlay | undefined {
  if (item?.kind !== "furniture" || !item.wallPlacement || stage.width <= 0 || stage.height <= 0) return undefined
  const wallStrip = getRoomEditorWallStrip(item.wallPlacement.strip, stage)
  return wallStrip ? { lines: [], cells: [], tone, calibrated: true, wallStrip } : undefined
}

/**
 * The overlay for the current preview, or undefined when nothing floor-placed is being previewed. In the
 * 2.5D room a calibrated piece shows its own floor cells: green or warm red while it is placed, and
 * a quiet pink (no grout) while it is only selected; the old rectangle around the drawing is not drawn there.
 */
export function createRoomEditorFloorOverlay(input: {
  shell: RoomShell | null | undefined
  preview: PlacementPreview | undefined
  stage: StageSize
  /** The selected piece when nothing is previewed (calibrated pieces only show their cells). */
  selectedItem?: RoomV2RenderItem
}): RoomEditorFloorOverlay | undefined {
  const { shell, preview, stage } = input
  const selected = input.selectedItem
  // 2.5D room: a wall piece lights the strip of measured wall it hangs on
  const wallOverlay = preview
    ? createWallStripOverlay(preview.item, preview.isValid ? "valid" : "invalid", stage)
    : createWallStripOverlay(selected, "selected", stage)
  if (wallOverlay) return wallOverlay
  if (
    !preview && selected?.kind === "furniture" && selected.footprintCells &&
    stage.width > 0 && stage.height > 0
  ) {
    return {
      lines: [],
      cells: getRoomEditorFootprintCellShapes(selected.footprintCells, stage),
      tone: "selected",
      calibrated: true
    }
  }
  const item = preview?.item
  if (
    !shell?.floorGrid || !item || item.kind !== "furniture" ||
    getRoomV2FurniturePlacementSurface(item) !== "floor" ||
    stage.width <= 0 || stage.height <= 0
  ) {
    return undefined
  }
  const projection = getRoomV2FloorGridProjection(shell.floorGrid)
  const toPx = (point: { x: number; y: number }) => ({ x: point.x * stage.width, y: point.y * stage.height })
  if (item.footprintCells) {
    return {
      lines: getRoomEditorFloorGridLines(projection, stage),
      cells: getRoomEditorFootprintCellShapes(item.footprintCells, stage),
      tone: preview.isValid ? "valid" : "invalid",
      calibrated: true
    }
  }
  return {
    lines: getRoomEditorFloorGridLines(projection, stage),
    cells: getRoomEditorFootprintCells(projection, item).map((cell) => {
      const shape = getRoomV2FloorGridCellShape(projection, cell.column, cell.row)
      return toShape(`cell-${cell.column}-${cell.row}`, toPx(shape.center), toPx(shape.alongI), toPx(shape.alongJ))
    }),
    tone: preview.isValid ? "valid" : "invalid"
  }
}
