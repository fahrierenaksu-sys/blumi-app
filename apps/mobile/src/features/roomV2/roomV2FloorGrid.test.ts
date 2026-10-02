import assert from "node:assert/strict"
import test from "node:test"
import { pointInRoomWorldPolygon } from "../roomWorld/roomWorldGeometry"
import {
  ROOM_V2_BLUMI_WORLD_FLOOR_GRID,
  createRoomV2FloorGridProjection,
  getRoomV2FloorGridCellPoint,
  getRoomV2FloorGridCellShape,
  getRoomV2FloorGridCellsCoveredBy,
  getRoomV2FloorGridCellsNear,
  getRoomV2FloorGridLines,
  isRoomV2FloorGridPointOnFloor,
  projectRoomV2FloorGridTilePoint,
  snapRoomV2FloorGridCell,
  snapRoomV2FloorGridPoint,
  unprojectRoomV2FloorGridPoint
} from "./roomV2FloorGrid"

const CANVAS = { width: 1254, height: 714 }
const grid = ROOM_V2_BLUMI_WORLD_FLOOR_GRID
const projection = createRoomV2FloorGridProjection(grid)

const toPx = (point: { x: number; y: number }) => ({
  x: point.x * CANVAS.width,
  y: point.y * CANVAS.height
})
const distancePx = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

// Grout crossings read off the shipped room_shell_blumi_world_v1.webp, in
// canvas pixels, independently of the fitted lattice: tile (i, j) -> pixel.
const ART_GROUT_CROSSINGS: { i: number; j: number; px: { x: number; y: number } }[] = [
  { i: 0, j: 0, px: { x: 596, y: 305 } },
  { i: 3, j: 0, px: { x: 806, y: 380 } },
  { i: 7, j: 0, px: { x: 1086, y: 481 } },
  { i: 1, j: 1, px: { x: 596, y: 355 } },
  { i: 6, j: 1, px: { x: 945, y: 481 } },
  { i: 4, j: 2, px: { x: 738, y: 456 } },
  { i: 3, j: 4, px: { x: 531, y: 481 } },
  { i: 2, j: 5, px: { x: 393, y: 481 } },
  { i: 5, j: 5, px: { x: 601, y: 558 } },
  { i: 1, j: 6, px: { x: 255, y: 482 } },
  { i: 6, j: 6, px: { x: 601, y: 610 } },
  { i: 7, j: 6, px: { x: 670, y: 636 } }
]
// The floor's top-edge corners on the same art (walls meet floor; front lip).
const ART_FLOOR_CORNERS = {
  back: { x: 600, y: 271 },
  right: { x: 1209, y: 475 },
  left: { x: 36, y: 474 }
}

function onFloorCells() {
  const cells: { column: number; row: number }[] = []
  for (let column = projection.minColumn; column <= projection.maxColumn; column += 1) {
    for (let row = projection.minRow; row <= projection.maxRow; row += 1) {
      const point = getRoomV2FloorGridCellPoint(projection, column, row)
      if (isRoomV2FloorGridPointOnFloor(projection, point.x, point.y)) cells.push({ column, row })
    }
  }
  return cells
}

test("the grid's grout crossings land on the drawn tiles within 3 px of 1254", () => {
  for (const crossing of ART_GROUT_CROSSINGS) {
    const projected = toPx(projectRoomV2FloorGridTilePoint(projection, crossing.i, crossing.j))
    assert.ok(
      distancePx(projected, crossing.px) <= 3,
      `tile (${crossing.i}, ${crossing.j}) projects to ${projected.x.toFixed(1)}, ${projected.y.toFixed(1)}`
    )
  }
})

test("the placement outline is the drawn floor: its corners are the art's floor corners", () => {
  const outlinePx = grid.outline.map(toPx)
  for (const [name, corner] of Object.entries(ART_FLOOR_CORNERS)) {
    const nearest = Math.min(...outlinePx.map((point) => distancePx(point, corner)))
    assert.ok(nearest <= 1, `${name} floor corner is ${nearest.toFixed(2)} px from the outline`)
  }
  // The outline encloses every measured crossing and leaves the walls out.
  for (const crossing of ART_GROUT_CROSSINGS) {
    assert.ok(pointInRoomWorldPolygon(
      { x: crossing.px.x / CANVAS.width, y: crossing.px.y / CANVAS.height },
      [...grid.outline]
    ))
  }
  assert.equal(isRoomV2FloorGridPointOnFloor(projection, 600 / 1254, 200 / 714), false, "back wall")
  assert.equal(isRoomV2FloorGridPointOnFloor(projection, 150 / 1254, 380 / 714), false, "left wall")
  assert.equal(isRoomV2FloorGridPointOnFloor(projection, 620 / 1254, 690 / 714), false, "front lip")
})

test("unprojection is the exact inverse of the projection", () => {
  for (const [i, j] of [[0, 0], [3.5, 2.25], [-0.5, 7.2], [7.6, -0.9]]) {
    const point = projectRoomV2FloorGridTilePoint(projection, i, j)
    const back = unprojectRoomV2FloorGridPoint(projection, point.x, point.y)
    assert.ok(Math.abs(back.i - i) < 1e-9 && Math.abs(back.j - j) < 1e-9)
  }
})

test("every placement cell centre on the lattice lands inside the drawn floor polygon", () => {
  const cells = onFloorCells()
  // Half-tile cells over roughly 8.5 x 8.4 drawn tiles.
  assert.ok(cells.length > 250, `expected a dense floor lattice, got ${cells.length}`)
  for (const cell of cells) {
    const center = getRoomV2FloorGridCellPoint(projection, cell.column, cell.row)
    assert.ok(pointInRoomWorldPolygon(center, [...grid.outline]))
  }
  // Even cells sit exactly on grout crossings, so the cells line up with the tiles.
  const crossing = getRoomV2FloorGridCellPoint(projection, 2 * 3, 2 * 4)
  assert.deepEqual(crossing, projectRoomV2FloorGridTilePoint(projection, 3, 4))
})

test("grid lines follow the walls and stop exactly at the drawn floor's edges", () => {
  const lines = getRoomV2FloorGridLines(projection)
  // Grout lines in both directions: 9 x 9 whole tile coordinates touch the floor.
  assert.ok(lines.length >= 16, `expected both grout directions, got ${lines.length}`)
  const edges = grid.outline.map((point, index) => [point, grid.outline[(index + 1) % grid.outline.length]] as const)
  const distanceToOutline = (point: { x: number; y: number }) => Math.min(...edges.map(([start, end]) => {
    const p = toPx(point)
    const a = toPx(start)
    const b = toPx(end)
    const length = distancePx(a, b)
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (length * length)))
    return distancePx(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }))
  for (const line of lines) {
    assert.ok(distanceToOutline(line.from) < 1e-6 && distanceToOutline(line.to) < 1e-6)
  }
  // The grout runs parallel to the back walls (within 2 degrees).
  const angle = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const pa = toPx(a)
    const pb = toPx(b)
    return Math.atan2(pb.y - pa.y, pb.x - pa.x)
  }
  const [back, right, , , , left] = grid.outline
  const firstRowLine = [
    projectRoomV2FloorGridTilePoint(projection, 0, 0),
    projectRoomV2FloorGridTilePoint(projection, 7, 0)
  ] as const
  const firstColumnLine = [
    projectRoomV2FloorGridTilePoint(projection, 0, 0),
    projectRoomV2FloorGridTilePoint(projection, 0, 7)
  ] as const
  const degrees = (radians: number) => Math.abs(radians) * 180 / Math.PI
  assert.ok(degrees(angle(...firstRowLine) - angle(back, right)) < 2)
  assert.ok(degrees(angle(...firstColumnLine) - angle(back, left)) < 2)
})

test("a stage point snaps to the nearest cell, and a cell centre snaps to itself", () => {
  const cell = { column: 7, row: 6 }
  const center = getRoomV2FloorGridCellPoint(projection, cell.column, cell.row)
  assert.deepEqual(snapRoomV2FloorGridCell(projection, center.x, center.y), cell)
  // A point a third of a cell away still snaps to that cell.
  const shape = getRoomV2FloorGridCellShape(projection, cell.column, cell.row)
  const nudged = {
    x: center.x + shape.alongI.x / 3 - shape.alongJ.x / 4,
    y: center.y + shape.alongI.y / 3 - shape.alongJ.y / 4
  }
  assert.deepEqual(snapRoomV2FloorGridCell(projection, nudged.x, nudged.y), cell)
  // Snapping is idempotent through the persisted (rounded) point.
  const snapped = snapRoomV2FloorGridPoint(projection, nudged)
  assert.deepEqual(snapRoomV2FloorGridCell(projection, snapped.x, snapped.y), cell)
})

test("points off the floor snap to the nearest cell that is still on the drawn floor", () => {
  const offFloor = [
    { x: 0.5, y: 0.2 },
    { x: 0.08, y: 0.5 },
    { x: 0.99, y: 0.7 },
    { x: 0.5, y: 0.99 },
    { x: 0.02, y: 0.98 }
  ]
  for (const point of offFloor) {
    const cell = snapRoomV2FloorGridCell(projection, point.x, point.y)
    const center = getRoomV2FloorGridCellPoint(projection, cell.column, cell.row)
    assert.ok(isRoomV2FloorGridPointOnFloor(projection, center.x, center.y), JSON.stringify(point))
  }
})

test("cells near a start are ordered ring by ring and stay on the lattice", () => {
  const start = { column: projection.minColumn, row: 4 }
  const cells = getRoomV2FloorGridCellsNear(projection, start, 2)
  assert.deepEqual(cells[0], start)
  assert.ok(cells.every((cell) => cell.column >= projection.minColumn))
  const ring = (cell: { column: number; row: number }) =>
    Math.max(Math.abs(cell.column - start.column), Math.abs(cell.row - start.row))
  for (let index = 1; index < cells.length; index += 1) {
    assert.ok(ring(cells[index]) >= ring(cells[index - 1]))
  }
})

test("a footprint covers the on-floor cells whose centres it contains", () => {
  const center = getRoomV2FloorGridCellPoint(projection, 6, 6)
  const bounds = { minX: center.x - 0.05, maxX: center.x + 0.05, minY: center.y - 0.03, maxY: center.y + 0.03 }
  const cells = getRoomV2FloorGridCellsCoveredBy(projection, bounds, (point) =>
    point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY
  )
  assert.ok(cells.some((cell) => cell.column === 6 && cell.row === 6))
  for (const cell of cells) {
    const point = getRoomV2FloorGridCellPoint(projection, cell.column, cell.row)
    assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY)
  }
})
