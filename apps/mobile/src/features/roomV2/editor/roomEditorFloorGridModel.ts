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

export type RoomEditorFloorTone = "valid" | "invalid"

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
}

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

/** The overlay for the current preview, or undefined when nothing floor-placed is being previewed. */
export function createRoomEditorFloorOverlay(input: {
  shell: RoomShell | null | undefined
  preview: PlacementPreview | undefined
  stage: StageSize
}): RoomEditorFloorOverlay | undefined {
  const { shell, preview, stage } = input
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
  return {
    lines: getRoomEditorFloorGridLines(projection, stage),
    cells: getRoomEditorFootprintCells(projection, item).map((cell) => {
      const shape = getRoomV2FloorGridCellShape(projection, cell.column, cell.row)
      return toShape(`cell-${cell.column}-${cell.row}`, toPx(shape.center), toPx(shape.alongI), toPx(shape.alongJ))
    }),
    tone: preview.isValid ? "valid" : "invalid"
  }
}

/**
 * The validity plate under the drag ghost: the diamond inscribed in the
 * piece's footprint bounds, relative to the ghost's anchor, in pixels.
 */
export function getRoomEditorDragGhostPlate(
  item: Extract<RoomV2RenderItem, { kind: "furniture" }>,
  stage: StageSize
): RoomEditorFloorShape {
  const { bounds } = getRoomV2FurnitureFootprintTest(item)
  const width = (bounds.maxX - bounds.minX) * stage.width
  const height = (bounds.maxY - bounds.minY) * stage.height
  return toShape(
    "ghost-plate",
    {
      x: ((bounds.minX + bounds.maxX) / 2 - item.x) * stage.width,
      y: ((bounds.minY + bounds.maxY) / 2 - item.y) * stage.height
    },
    { x: width / 2, y: height / 2 },
    { x: width / 2, y: -height / 2 }
  )
}
