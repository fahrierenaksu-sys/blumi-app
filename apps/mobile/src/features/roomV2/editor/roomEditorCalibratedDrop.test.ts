import assert from "node:assert/strict"
import test from "node:test"
import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomFurnitureRotation,
  RoomPoint2D,
  RoomV2FurnitureRenderItem,
  UserRoomDecor
} from "../roomV2.types"
import type { PlacementPreview } from "./roomEditorPlacementModel"
import type { LayeredFurnitureAssets } from "../furniture/layeredFurniture"

/**
 * The room editor ("Odayı düzenle", Phase D) with the room calibration installed, as the app has it: what a
 * drag shows is where the drop puts the piece. The app installs the real art at start-up,
 * so Node installs the room seam here with stand-in layer images.
 */

// The room catalog bundles the shipped art: image modules load as their file names (plain Node).
for (const extension of [".png", ".webp", ".jpg"]) {
  require.extensions[extension] = (module, filename) => { module.exports = filename }
}
/* eslint-disable @typescript-eslint/no-require-imports -- the flagged module must be in place before the editor loads */
const { createRoomAvatar25dRoomCalibration } = require("../calibration/roomAvatar25dRoomCalibration") as
  typeof import("../calibration/roomAvatar25dRoomCalibration")
const { createRoomAvatar25dFurnitureCatalog, ROOM_AVATAR_25D_SOFA_ID } = require("../furniture/layeredFurnitureCatalog") as
  typeof import("../furniture/layeredFurnitureCatalog")
const { roomAvatar25d: stub, installRoomAvatarSeam } = require("../../avatar/roomAvatarSeam") as
  typeof import("../../avatar/roomAvatarSeam")
const {
  floorCellOf,
  floorToStageFraction,
  ROOM_CALIBRATION: C,
  stageFractionToFloor
} = require("../calibration/roomCalibration") as
  typeof import("../calibration/roomCalibration")

const asset = (key: string) => ({ key, source: 0 as never })
const layers = (id: string) => Object.fromEntries(([0, 1, 2, 3] as const).map((r) => [r, {
  back: asset(`${id}_r${r}_back`), front: asset(`${id}_r${r}_front`), shadow: asset(`${id}_r${r}_shadow`)
}])) as unknown as LayeredFurnitureAssets[string]
const ASSETS: LayeredFurnitureAssets = {
  room_v2_chair_blush: layers("room_v2_chair_blush"),
  [ROOM_AVATAR_25D_SOFA_ID]: layers(ROOM_AVATAR_25D_SOFA_ID)
}
const flagged = {
  ...stub,
  enabled: true,
  roomCalibration: createRoomAvatar25dRoomCalibration(ASSETS),
  furnitureCatalog: createRoomAvatar25dFurnitureCatalog(ASSETS)
}
// the room seam as the app installs it, with these test layers (before the room modules load)
installRoomAvatarSeam(flagged)

const { getMyRoomEditorCopy } = require("../myRoomCopy") as typeof import("../myRoomCopy")
const { ROOM_V2_FURNITURE_CATALOG, ROOM_V2_SHELL_CATALOG } = require("../roomV2Catalog") as typeof import("../roomV2Catalog")
const { resolveRoomV2Scene } = require("../roomV2Selectors") as typeof import("../roomV2Selectors")
const { getRoomV2FloorGridCellPoint, getRoomV2FloorGridProjection, isRoomV2FloorGridPointOnFloor } =
  require("../roomV2FloorGrid") as typeof import("../roomV2FloorGrid")
const drag = require("./roomEditorDragModel") as typeof import("./roomEditorDragModel")
const { createRoomEditorPlacedItemFromPreview } = require("./roomEditorPlacementModel") as
  typeof import("./roomEditorPlacementModel")
const { createRoomEditorFloorOverlay } = require("./roomEditorFloorGridModel") as
  typeof import("./roomEditorFloorGridModel")
const { ROOM_EDITOR_PLACE_JUICE } = require("./roomEditorPlaceMotion") as typeof import("./roomEditorPlaceMotion")
/* eslint-enable @typescript-eslint/no-require-imports */

const copy = getMyRoomEditorCopy("en")
const CATALOG: FurnitureItem[] = [...ROOM_V2_FURNITURE_CATALOG, ...flagged.furnitureCatalog]
const SHELL_ID = "room_v2_shell_blumi_world_v1"
const ROTATIONS: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
const STAGE = { x: -39, y: 120, width: 468, height: 266.5 }

function sceneWith(placedItems: PlacedRoomItem[]): ResolvedRoomV2Scene {
  const decor: UserRoomDecor = { roomShellId: SHELL_ID, placedItems }
  return resolveRoomV2Scene({ roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: CATALOG, decor })
}

function furnitureOf(scene: ResolvedRoomV2Scene, renderId: string): RoomV2FurnitureRenderItem {
  const item = scene.renderItems.find((entry) => entry.renderId === renderId)
  assert.ok(item && item.kind === "furniture", `${renderId} resolves`)
  return item
}

function roundTrip(placed: PlacedRoomItem): PlacedRoomItem {
  // what a save writes and a later load reads
  return JSON.parse(JSON.stringify(placed)) as PlacedRoomItem
}

function closeTo(actual: RoomPoint2D, expected: RoomPoint2D, message: string, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual.x - expected.x) < tolerance && Math.abs(actual.y - expected.y) < tolerance,
    `${message}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`
  )
}

test("the flagged editor runs with the room calibration, so these rules are the ones the 2.5D room uses", () => {
  assert.equal(ROOM_EDITOR_PLACE_JUICE, true)
  const scene = sceneWith([])
  assert.ok(scene.shell?.floorGrid, "the calibrated shell has a floor grid")
})

test("every drag cell is a calibration cell: its point is that cell's centre and the floor rounds back to it", () => {
  const floor = getRoomV2FloorGridProjection(sceneWith([]).shell!.floorGrid!)
  let checked = 0
  for (let column = floor.minColumn; column <= floor.maxColumn; column += 1) {
    for (let row = floor.minRow; row <= floor.maxRow; row += 1) {
      const point = getRoomV2FloorGridCellPoint(floor, column, row)
      if (!isRoomV2FloorGridPointOnFloor(floor, point.x, point.y)) continue
      const world = stageFractionToFloor(C, point)
      assert.deepEqual(floorCellOf(C, world), { i: column, j: row }, `cell ${column},${row}`)
      assert.ok(Math.abs(world.x - (column + 0.5) * C.cell) < 1e-9 && Math.abs(world.z - (row + 0.5) * C.cell) < 1e-9)
      checked += 1
    }
  }
  assert.ok(checked > 150, `checked ${checked} floor cells`)
})

const PIECES = [
  { itemId: "room_v2_table_round", rotations: ["front"] as RoomFurnitureRotation[], label: "old catalog table" },
  { itemId: "room_v2_chair_blush", rotations: ROTATIONS, label: "layered armchair" },
  { itemId: ROOM_AVATAR_25D_SOFA_ID, rotations: ROTATIONS, label: "layered sofa" }
]

test("across the floor, the piece lands on exactly the cells, spot and drawing its drag previewed", () => {
  for (const piece of PIECES) {
    for (const rotation of piece.rotations) {
      const start: PlacedRoomItem = { instanceId: "held", itemId: piece.itemId, x: 0.5, y: 0.7, rotation }
      const scene = sceneWith([start])
      const held = furnitureOf(scene, "held")
      const floor = drag.getRoomEditorDragFloorGrid(held, scene.shell)
      assert.ok(floor, `${piece.label} drags on the floor grid`)
      const [rect] = drag.createRoomEditorDragHitRects(scene.renderItems, scene.shell)
      let compared = 0
      let ghostChecked = 0
      for (let column = floor.minColumn; column <= floor.maxColumn; column += 1) {
        for (let row = floor.minRow; row <= floor.maxRow; row += 1) {
          const preview: PlacementPreview | undefined =
            drag.createRoomEditorStageDragPreview({ copy, scene, renderId: "held", floor, column, row })
          if (!preview || preview.item.kind !== "furniture") continue
          const where: string = `${piece.label} ${rotation} at ${column},${row}`
          // the drop saves the preview's own spot, and a save/load round trip keeps it
          const saved = roundTrip(createRoomEditorPlacedItemFromPreview(preview, preview.item))
          const placed = furnitureOf(sceneWith([saved]), "held")
          assert.deepEqual(placed.footprintCells, preview.item.footprintCells, `${where}: same floor cells`)
          assert.deepEqual(placed.placementPolygon, preview.item.placementPolygon, `${where}: same footprint`)
          closeTo(drag.getRoomEditorDrawPoint(placed), drag.getRoomEditorDrawPoint(preview.item), `${where}: drawn where previewed`)
          // the saved anchor sits on a cell centre, so no rounding can pick the neighbouring cell
          const world = stageFractionToFloor(C, saved)
          const cell = floorCellOf(C, world)
          closeTo(floorToStageFraction(C, { x: (cell.i + 0.5) * C.cell, z: (cell.j + 0.5) * C.cell }), saved, `${where}: on a cell centre`, 1e-6)
          // while held, the ghost stood on that drawn spot: the UI thread puts it on the cell plus the piece's draw
          // offset; JS moves it only when it fitted the piece onto another cell or a wall moved the drawing
          const cellPoint = getRoomV2FloorGridCellPoint(floor, column, row)
          const offset = drag.getRoomEditorDrawOffset(preview.item)
          const onCell = Math.abs(preview.item.x - cellPoint.x) < 1e-6 && Math.abs(preview.item.y - cellPoint.y) < 1e-6
          if (onCell && Math.abs(offset.x - rect!.cellDrawOffsetX) < 1e-5 && Math.abs(offset.y - rect!.cellDrawOffsetY) < 1e-5) {
            const ghost = drag.getRoomEditorDragCellWindowPoint({
              floor, column, row, stage: STAGE, drawOffsetX: rect!.cellDrawOffsetX, drawOffsetY: rect!.cellDrawOffsetY
            })
            const drawn = drag.getRoomEditorDrawPoint(placed)
            closeTo(ghost, { x: STAGE.x + drawn.x * STAGE.width, y: STAGE.y + drawn.y * STAGE.height }, `${where}: ghost (px)`, 0.01)
            ghostChecked += 1
          }
          compared += 1
        }
      }
      assert.ok(compared > 100, `${piece.label} ${rotation}: compared ${compared} cells`)
      assert.ok(ghostChecked > compared / 2, `${piece.label} ${rotation}: ghost checked on ${ghostChecked} cells`)
    }
  }
})

test("a held piece's hit box is where the room draws it, not where its anchor is saved", () => {
  const scene = sceneWith([{ instanceId: "sofa", itemId: ROOM_AVATAR_25D_SOFA_ID, x: 0.5, y: 0.7, rotation: "front" }])
  const sofa = furnitureOf(scene, "sofa")
  const [rect] = drag.createRoomEditorDragHitRects(scene.renderItems, scene.shell)
  const draw = drag.getRoomEditorDrawPoint(sofa)
  assert.ok(rect!.left < draw.x && draw.x < rect!.right, "the drawing's floor point is inside the hit box")
  assert.ok(rect!.top < draw.y && draw.y <= rect!.bottom + 1e-9)
  assert.equal(rect!.anchorX, sofa.x, "the drag still moves the saved anchor")
})

test("while placing, the floor shows the piece's own diamond cells in its validity tone; while selected, a quiet tone", () => {
  const scene = sceneWith([
    { instanceId: "sofa", itemId: ROOM_AVATAR_25D_SOFA_ID, x: 0.5, y: 0.7, rotation: "front" },
    { instanceId: "table", itemId: "room_v2_table_round", x: 0.3, y: 0.62, rotation: "front" }
  ])
  const sofa = furnitureOf(scene, "sofa")
  const floor = drag.getRoomEditorDragFloorGrid(sofa, scene.shell)!
  const size = { width: 400, height: 228 }
  const tableAt = floorCellOf(C, stageFractionToFloor(C, furnitureOf(scene, "table")))
  const onTable = drag.createRoomEditorStageDragPreview({ copy, scene, renderId: "sofa", floor, column: tableAt.i, row: tableAt.j })!
  const clear = drag.createRoomEditorStageDragPreview({ copy, scene, renderId: "sofa", floor, column: 8, row: 8 })!
  assert.equal(onTable.isValid, false)
  assert.equal(clear.isValid, true)
  for (const preview of [onTable, clear]) {
    const overlay = createRoomEditorFloorOverlay({ shell: scene.shell, preview, stage: size })!
    assert.equal(overlay.calibrated, true)
    assert.equal(overlay.tone, preview.isValid ? "valid" : "invalid")
    assert.equal(overlay.cells.length, (preview.item as RoomV2FurnitureRenderItem).footprintCells!.length)
    assert.ok(overlay.lines.length > 0, "the floor's grout shows while placing")
  }
  const selected = createRoomEditorFloorOverlay({ shell: scene.shell, preview: undefined, stage: size, selectedItem: sofa })!
  assert.equal(selected.tone, "selected")
  assert.equal(selected.cells.length, sofa.footprintCells!.length)
  assert.equal(selected.lines.length, 0)
})
