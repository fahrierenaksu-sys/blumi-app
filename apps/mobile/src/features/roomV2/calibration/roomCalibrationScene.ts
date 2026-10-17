import type {
  RoomPoint2D,
  RoomShell,
  RoomV2FurnitureRenderItem
} from "../roomV2.types"
import type { RoomWorldGeometry, RoomWorldPoint } from "../../roomWorld/roomWorldGeometry"
import {
  fitFloorBoxToWalls,
  floorBoxCells,
  floorBoxCorners,
  floorToStageFraction,
  resolveTapFloorTarget,
  ROOM_CALIBRATION,
  stageFractionToFloor,
  type FloorBox,
  type FloorPoint,
  type RoomCalibration
} from "./roomCalibration"
import { checkWallPiece, snapWallPiece, WALL_PIECE_ART, type WallPieceShape } from "./roomWallPlacement"

/**
 * The room calibration applied to the app's room model. Everything stays in
 * the app's stage fractions and stored data is never touched: a placed item keeps its saved `x`/`y`, the shell
 * keeps its tile lattice (so editor snapping writes the same coordinates as every other build), and the
 * calibrated shapes are derived at runtime.
 */

/** The only shell the calibration measured (room_calibration.json `shell`). */
export const CALIBRATED_SHELL_ID = "room_v2_shell_blumi_world_v1"

/** The collision footprint is this much (world units) inside its cells: pieces on neighbouring cells may touch. */
const FOOTPRINT_COLLISION_INSET = 0.01

export function isCalibratedShell(
  shell: Pick<RoomShell, "id" | "canvasSize"> | null | undefined,
  c: RoomCalibration = ROOM_CALIBRATION
): boolean {
  return Boolean(
    shell &&
    shell.id === CALIBRATED_SHELL_ID &&
    shell.canvasSize.width === c.canvas.width &&
    shell.canvasSize.height === c.canvas.height
  )
}

const calibratedShells = new WeakMap<RoomShell, RoomShell>()

/**
 * The shell with the calibrated painted floor as its floor outline: the editor keeps pieces on it and clips its
 * grid lines to it. Its lattice is the calibration's own cell lattice: lattice point (column, row) is the centre
 * of calibration cell (i, j) = (column, row), exactly where a floor piece's saved anchor belongs
 * (`getCalibratedFurnitureFloorBox`). The drag, its preview, the drop and the drawn piece then all round on one
 * grid; the hand-fit tile homography put its points on cell corners (±3 px), where `floor` picked either cell.
 * Its grout lines stay on the whole tiles. Saved spots are never rewritten; a piece moves to a cell centre only
 * when it is moved.
 */
export function calibrateRoomShell(shell: RoomShell, c: RoomCalibration = ROOM_CALIBRATION): RoomShell {
  if (!shell.floorGrid || !isCalibratedShell(shell, c)) return shell
  const cached = calibratedShells.get(shell)
  if (cached) return cached
  const grid = shell.floorGrid
  const usesCalibrationCells = Math.abs(grid.cellsPerTile * c.cell - 1) < 1e-9
  const span = grid.latticeSpan
  const centre = c.cell / 2
  const corner = (x: number, z: number) => floorToStageFraction(c, { x: x + centre, z: z + centre })
  const calibrated: RoomShell = {
    ...shell,
    floorGrid: {
      ...grid,
      id: `${grid.id}+${c.version}`,
      outline: c.floorPolygon.map((point) => roundStage(floorToStageFraction(c, point))),
      ...(usesCalibrationCells
        ? {
            latticeCorners: [corner(0, 0), corner(span, 0), corner(span, span), corner(0, span)] as const,
            groutPhase: -centre
          }
        : {})
    }
  }
  calibratedShells.set(shell, calibrated)
  return calibrated
}

/**
 * A floor piece's footprint on whole floor cells (world units). Its front corner is the cell corner just behind
 * the saved anchor (the bottom of the drawing, which the editor snaps to a cell centre); its size is the
 * footprint's screen width read as a diamond (`a + b` units wide on screen), split by the piece's physical
 * proportions. Pieces in the last row before a back wall go flush with that wall's measured base line.
 */
export function getCalibratedFurnitureFloorBox(
  item: Pick<RoomV2FurnitureRenderItem, "x" | "y" | "width" | "footprint" | "rotation" | "visualContract">,
  c: RoomCalibration = ROOM_CALIBRATION
): { cells: FloorBox; placed: FloorBox } {
  const screenWidthPx = (item.footprint?.width ?? item.width) * c.canvas.width
  const diagonal = screenWidthPx / (c.pxPerUnit * c.screenRight[0])
  const size = item.visualContract?.physicalSizeCm
  const sideways = item.rotation === "left" || item.rotation === "right"
  const along = size ? (sideways ? size.depth : size.width) : 1
  const across = size ? (sideways ? size.width : size.depth) : 1
  const xUnits = Math.max(1, Math.round((diagonal * along) / (along + across) / c.cell)) * c.cell
  const zUnits = Math.max(1, Math.round((diagonal * across) / (along + across) / c.cell)) * c.cell
  const anchor = stageFractionToFloor(c, item)
  // the anchor sits on a cell centre; its cell's back corner is the footprint's front corner
  const maxX = Math.floor(anchor.x / c.cell + 1e-6) * c.cell
  const maxZ = Math.floor(anchor.z / c.cell + 1e-6) * c.cell
  const cells = { minX: maxX - xUnits, maxX, minZ: maxZ - zUnits, maxZ }
  return { cells, placed: fitFloorBoxToWalls(c, cells) }
}

/** Whether the calibration gives this piece a floor footprint (upright and floor-plane pieces that block). */
export function hasCalibratedFloorFootprint(
  item: Pick<RoomV2FurnitureRenderItem, "kind" | "placementSurface" | "blocksMovement">
): boolean {
  return item.kind === "furniture" && (item.placementSurface ?? "floor") === "floor" && item.blocksMovement
}

/**
 * A floor piece with its calibrated footprint: the collision and placement shapes become the floor-cell diamond
 * (a stage polygon), and a piece moved flush to a wall carries that move as `renderOffset` (the drawing, its
 * seats and its draw depth follow it). `x`/`y` stay the saved values.
 */
export function calibrateFurnitureRenderItem(
  item: RoomV2FurnitureRenderItem,
  c: RoomCalibration = ROOM_CALIBRATION
): RoomV2FurnitureRenderItem {
  if (item.placementSurface === "wall") return calibrateWallRenderItem(item, c)
  if (!hasCalibratedFloorFootprint(item)) return item
  const { cells, placed } = getCalibratedFurnitureFloorBox(item, c)
  const anchor = stageFractionToFloor(c, item)
  const moved = floorToStageFraction(c, {
    x: anchor.x + placed.minX - cells.minX,
    z: anchor.z + placed.minZ - cells.minZ
  })
  const offset = { x: moved.x - item.x, y: moved.y - item.y }
  const hasOffset = Math.abs(offset.x) > 1e-9 || Math.abs(offset.y) > 1e-9
  // idempotent: an item that already carries an offset is first taken back to its saved spot
  const previous = item.renderOffset ?? { x: 0, y: 0 }
  const delta = { x: offset.x - previous.x, y: offset.y - previous.y }
  const diamond = floorBoxCorners(insetBox(placed, FOOTPRINT_COLLISION_INSET))
    .map((corner) => roundStage(floorToStageFraction(c, corner)))
  const { renderOffset: _previous, ...base } = item
  void _previous
  return {
    ...base,
    collisionPolygon: diamond,
    placementPolygon: diamond.map((point) => ({ ...point })),
    footprintCells: getFloorBoxCellQuads(placed, c),
    floorBox: placed,
    depth: item.depth + delta.y,
    ...(item.seatWorldPoints
      ? {
          seatWorldPoints: item.seatWorldPoints.map((seat) => ({
            ...seat,
            seat: shift(seat.seat, delta),
            approach: shift(seat.approach, delta),
            exit: shift(seat.exit, delta),
            ...(seat.cushion ? { cushion: shift(seat.cushion, delta) } : {})
          }))
        }
      : {}),
    ...(hasOffset ? { renderOffset: offset } : {})
  }
}

function wallPieceOf(item: RoomV2FurnitureRenderItem): WallPieceShape {
  const art = WALL_PIECE_ART[item.itemId]
  return { width: item.width, height: item.height, anchor: item.anchor, ...(art ? { art } : {}) }
}

/**
 * A wall piece on the measured back wall under its saved anchor: whether it fits there and the strip of wall the
 * editor lights behind it. It is drawn exactly where it was saved; only the editor's magnet moves it.
 */
export function calibrateWallRenderItem(
  item: RoomV2FurnitureRenderItem,
  c: RoomCalibration = ROOM_CALIBRATION
): RoomV2FurnitureRenderItem {
  const fit = checkWallPiece({ ...wallPieceOf(item), x: item.x, y: item.y }, item.surfacePlacementPolicy, c)
  return { ...item, wallPlacement: { wall: fit.wall, isValid: fit.isValid, strip: fit.strip, cover: fit.cover } }
}

/** The wall magnet (`snapWallPiece`) for a wall piece held at a stage point: its anchor's stage point. */
export function snapCalibratedWallItem(
  item: RoomV2FurnitureRenderItem,
  point: RoomWorldPoint,
  c: RoomCalibration = ROOM_CALIBRATION
): RoomWorldPoint {
  return snapWallPiece(wallPieceOf(item), point, item.surfacePlacementPolicy, c).point
}

/**
 * Walking on the calibrated floor: her foot centre stays on the walkable polygon (the painted floor less her
 * foot radius, so no extra edge margin), and the walk lattice is the calibrated tile grid.
 */
export function calibrateRoomWalkGeometry(
  geometry: RoomWorldGeometry,
  shell: Pick<RoomShell, "id" | "canvasSize"> | null | undefined,
  c: RoomCalibration = ROOM_CALIBRATION
): RoomWorldGeometry {
  if (!isCalibratedShell(shell, c)) return geometry
  const span = 7
  const corner = (x: number, z: number) => floorToStageFraction(c, { x, z })
  return {
    ...geometry,
    walkableAreas: [{
      id: `${CALIBRATED_SHELL_ID}.walkable.${c.version}`,
      points: c.walkablePolygon.map((point) => roundStage(floorToStageFraction(c, point)))
    }],
    ...(geometry.floor
      ? {
          floor: {
            ...geometry.floor,
            corners: [corner(0, 0), corner(span, 0), corner(span, span), corner(0, span)]
          }
        }
      : {}),
    edgeMargin: 0
  }
}

/** A stage tap (fractions) → the stage point she walks to (see `resolveTapFloorTarget`). */
export function resolveCalibratedTapTarget(
  point: RoomWorldPoint,
  shell: Pick<RoomShell, "id" | "canvasSize"> | null | undefined,
  c: RoomCalibration = ROOM_CALIBRATION
): RoomWorldPoint {
  if (!isCalibratedShell(shell, c)) return point
  return floorToStageFraction(c, resolveTapFloorTarget(c, point))
}

/** The world floor point of a stage-fraction point. */
export function stagePointToFloor(point: RoomWorldPoint, c: RoomCalibration = ROOM_CALIBRATION): FloorPoint {
  return stageFractionToFloor(c, point)
}

/** The footprint's cells as stage quads (back, right, front, left corner), for the editor's floor diamonds. */
export function getFloorBoxCellQuads(box: FloorBox, c: RoomCalibration = ROOM_CALIBRATION): RoomPoint2D[][] {
  return floorBoxCells(box, c.cell).map((cell) =>
    floorBoxCorners(cell).map((corner) => roundStage(floorToStageFraction(c, corner))))
}

function insetBox(box: FloorBox, by: number): FloorBox {
  return { minX: box.minX + by, maxX: box.maxX - by, minZ: box.minZ + by, maxZ: box.maxZ - by }
}

function shift<T extends RoomPoint2D>(point: T, offset: RoomPoint2D): T {
  return { ...point, x: point.x + offset.x, y: point.y + offset.y }
}

/** Stage coordinates keep 6 decimals (sub-pixel on any canvas), as persisted points do. */
function roundStage(point: RoomPoint2D): RoomPoint2D {
  return { x: Math.round(point.x * 1e6) / 1e6, y: Math.round(point.y * 1e6) / 1e6 }
}
