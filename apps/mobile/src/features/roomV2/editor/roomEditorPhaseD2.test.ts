import assert from "node:assert/strict"
import test from "node:test"
import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomPoint2D,
  RoomV2FurnitureRenderItem,
  UserRoomDecor
} from "../roomV2.types"
import type { LayeredFurnitureAssets } from "../furniture/layeredFurniture"

/**
 * "Odayı düzenle" Phase D slice 2 (2.5D room, its room calibration on):
 * wall pieces go onto the measured walls by a magnet, a turn that does not fit nudges the piece to the nearest free
 * cell, and a seat the editor saves is the one My Room walks her to. The flagged module is Metro-routed, so Node
 * installs the room seam here with stand-in layer images.
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
const { ROOM_CALIBRATION: C, leftWallX, rightWallZ } = require("../calibration/roomCalibration") as
  typeof import("../calibration/roomCalibration")
const wallMaths = require("../calibration/roomWallPlacement") as
  typeof import("../calibration/roomWallPlacement")

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
const { resolveRoomV2Scene, validateRoomV2DraftPlacements } = require("../roomV2Selectors") as typeof import("../roomV2Selectors")
const { resolveRoomV2ExactRotationPreview } = require("../roomV2ExactRotation") as typeof import("../roomV2ExactRotation")
const { getRoomV2FloorGridCellPoint, getRoomV2FloorGridProjection, isRoomV2FloorGridPointOnFloor, snapRoomV2FloorGridCell } =
  require("../roomV2FloorGrid") as typeof import("../roomV2FloorGrid")
const drag = require("./roomEditorDragModel") as typeof import("./roomEditorDragModel")
const placement = require("./roomEditorPlacementModel") as typeof import("./roomEditorPlacementModel")
const { createRoomEditorFloorOverlay } = require("./roomEditorFloorGridModel") as typeof import("./roomEditorFloorGridModel")
const { findRoomEditorRotateNudge, ROOM_EDITOR_ROTATE_NUDGE_RINGS } = require("./roomEditorRotateNudge") as
  typeof import("./roomEditorRotateNudge")
const motion = require("./roomEditorPlaceMotion") as typeof import("./roomEditorPlaceMotion")
const effects = require("./roomEditorStageEffectModel") as typeof import("./roomEditorStageEffectModel")
const newSeat = require("./roomEditorNewSeat") as typeof import("./roomEditorNewSeat")
const { createRoomWorldGeometryFromRoomV2Scene, createRoomWorldHotspotsFromRoomV2Scene } =
  require("../../roomWorld/roomWorldRoomV2Projection") as typeof import("../../roomWorld/roomWorldRoomV2Projection")
const runtime = require("../../roomWorld/roomWorldRuntime") as typeof import("../../roomWorld/roomWorldRuntime")
const { pointInRoomWorldPolygon } = require("../../roomWorld/roomWorldGeometry") as
  typeof import("../../roomWorld/roomWorldGeometry")
const { MY_ROOM_AVATAR_SPAWN } = require("../../roomWorld/myRoomInteractionModel") as
  typeof import("../../roomWorld/myRoomInteractionModel")
/* eslint-enable @typescript-eslint/no-require-imports */

const copy = getMyRoomEditorCopy("en")
const CATALOG: FurnitureItem[] = [...ROOM_V2_FURNITURE_CATALOG, ...flagged.furnitureCatalog]
const SHELL_ID = "room_v2_shell_blumi_world_v1"
const SHELF_ID = "room_v2_cute_bookshelf"
const STAGE = { x: -39, y: 120, width: 468, height: 266.5 }
const EPS = 1e-6

function sceneWith(placedItems: PlacedRoomItem[]): ResolvedRoomV2Scene {
  const decor: UserRoomDecor = { roomShellId: SHELL_ID, placedItems }
  return resolveRoomV2Scene({ roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: CATALOG, decor })
}

function furnitureOf(scene: ResolvedRoomV2Scene, renderId: string): RoomV2FurnitureRenderItem {
  const item = scene.renderItems.find((entry) => entry.renderId === renderId)
  assert.ok(item && item.kind === "furniture", `${renderId} resolves`)
  return item
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** The bookshelf held on the stage at a finger point, through the drag's own cell and preview path. */
function dragShelfTo(scene: ResolvedRoomV2Scene, point: RoomPoint2D) {
  const cell = drag.getRoomEditorDragCell({ ...point, inside: true }, drag.getRoomEditorDragFloorGrid(furnitureOf(scene, "shelf"), scene.shell))
  return drag.createRoomEditorStageDragPreview({ copy, scene, renderId: "shelf", floor: null, column: cell.column, row: cell.row })
}

/** Where the bookshelf's art sits on the wall plane its anchor is on (the wall's own coordinates). */
function shelfCover(item: RoomV2FurnitureRenderItem) {
  const wall = wallMaths.wallSideAt(C, item)
  const spot = wallMaths.stageFractionToWallSpot(C, wall, item)
  const extent = wallMaths.wallPieceExtent(C, wall, {
    width: item.width, height: item.height, anchor: item.anchor, art: wallMaths.WALL_PIECE_ART[SHELF_ID]
  })
  return {
    wall,
    spot,
    alongMin: spot.along + extent.alongMin,
    alongMax: spot.along + extent.alongMax,
    heightMin: spot.height + extent.heightMin,
    heightMax: spot.height + extent.heightMax
  }
}

const SHELF_START: PlacedRoomItem = { instanceId: "shelf", itemId: SHELF_ID, x: 0.7, y: 0.3, rotation: "front" }

// ---- 1. wall magnet ----

test("a held wall piece goes flush onto the measured wall under the finger, never onto the tile lattice", () => {
  const scene = sceneWith([SHELF_START])
  let valid = 0
  for (let x = 0.04; x <= 0.96; x += 0.02) {
    for (let y = 0.04; y <= 0.9; y += 0.04) {
      const preview = dragShelfTo(scene, { x, y })
      assert.ok(preview && preview.item.kind === "furniture", `a preview at ${x},${y}`)
      const item = preview.item
      const cover = shelfCover(item)
      // the anchor is a point of the measured (slanted) wall plane: mapping it onto that plane and back is exact
      const world = wallMaths.wallSpotToWorld(C, cover.spot)
      if (cover.wall === "left") assert.ok(Math.abs(world.x - leftWallX(C, world.z)) < EPS)
      else assert.ok(Math.abs(world.z - rightWallZ(C, world.x)) < EPS)
      const back = wallMaths.wallSpotToStageFraction(C, cover.spot)
      assert.ok(Math.abs(back.x - item.x) < 2e-6 && Math.abs(back.y - item.y) < 2e-6, `${x},${y}: on the wall plane`)
      assert.equal(item.wallPlacement?.wall, cover.wall)
      if (!preview.isValid) continue
      valid += 1
      // a valid spot keeps the art on its wall, between skirting and cap, and clear of door, window and niche
      const [start, end] = wallMaths.wallSpan(C, cover.wall)
      assert.ok(cover.alongMin >= start && cover.alongMax <= end, `${x},${y}: inside the wall`)
      assert.ok(cover.heightMin >= wallMaths.WALL_PIECE_MIN_HEIGHT - 1e-3 && cover.heightMax <= C.wallHeight + 1e-3, `${x},${y}: height`)
      for (const opening of C.openings.filter((entry) => entry.wall === cover.wall)) {
        const overlaps = cover.alongMin < opening.along[1] - 1e-3 && cover.alongMax > opening.along[0] + 1e-3 &&
          cover.heightMin < opening.height[1] - 1e-3 && cover.heightMax > opening.height[0] + 1e-3
        assert.equal(overlaps, false, `${x},${y}: clear of the ${opening.id}`)
      }
    }
  }
  assert.ok(valid > 300, `valid wall spots: ${valid}`)
})

test("dragging along a wall slides the piece along it at one height, in whole steps", () => {
  const scene = sceneWith([SHELF_START])
  const spots = []
  // the finger follows the right wall at one height on it (the wall runs slanted across the screen)
  for (let along = 0.4; along <= 4.4; along += 0.1) {
    const finger = wallMaths.wallSpotToStageFraction(C, { wall: "right", along, height: 1.3 })
    const preview = dragShelfTo(scene, finger)!
    const cover = shelfCover(preview.item as RoomV2FurnitureRenderItem)
    assert.equal(cover.wall, "right")
    spots.push(cover.spot)
  }
  const heights = new Set(spots.map((spot) => spot.height.toFixed(3)))
  assert.equal(heights.size, 1, "one height along the whole slide")
  for (let index = 1; index < spots.length; index += 1) {
    assert.ok(spots[index]!.along >= spots[index - 1]!.along - EPS, "it moves one way with the finger")
  }
  const alongs = [...new Set(spots.map((spot) => spot.along.toFixed(3)))].map(Number)
  for (const along of alongs) {
    const steps = along / wallMaths.WALL_SNAP_ALONG
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-3, `${along} is a whole step along the wall`)
  }
  // every step on the way, none skipped
  for (let index = 1; index < alongs.length; index += 1) {
    assert.ok(Math.abs(alongs[index]! - alongs[index - 1]! - wallMaths.WALL_SNAP_ALONG) < 1e-3, `step ${alongs[index - 1]} -> ${alongs[index]}`)
  }
  assert.ok(alongs.length >= 7, `it slides through ${alongs.length} spots`)
  // many finger cells share one spot: only a new spot ticks
  const first = dragShelfTo(scene, { x: 0.7, y: 0.32 })
  const same = dragShelfTo(scene, { x: 0.702, y: 0.322 })
  assert.equal(drag.getRoomEditorDragCellHaptic(first, same, true), null)
  assert.equal(drag.getRoomEditorDragCellHaptic(first, dragShelfTo(scene, { x: 0.86, y: 0.32 }), true), "rigid")
})

test("the wall keeps the piece between skirting and cap wherever the finger goes", () => {
  const scene = sceneWith([SHELF_START])
  const high = dragShelfTo(scene, { x: 0.7, y: 0.01 })!
  const low = dragShelfTo(scene, { x: 0.7, y: 0.95 })!
  assert.equal(high.isValid, true)
  assert.equal(low.isValid, true)
  const top = shelfCover(high.item as RoomV2FurnitureRenderItem)
  const bottom = shelfCover(low.item as RoomV2FurnitureRenderItem)
  assert.ok(Math.abs(top.heightMax - C.wallHeight) < 1e-3, "pressed up to the cap, not past it")
  assert.ok(Math.abs(bottom.heightMin - wallMaths.WALL_PIECE_MIN_HEIGHT) < 1e-3, "down to the skirting, not into the floor")
})

test("over the window the magnet slides the piece off it; curtains hang on the window instead", () => {
  const window = C.openings.find((opening) => opening.id === "window")!
  const middle = wallMaths.wallSpotToStageFraction(C, {
    wall: window.wall,
    along: (window.along[0] + window.along[1]) / 2,
    height: (window.height[0] + window.height[1]) / 2
  })
  const clock = { width: 0.06, height: 0.08, anchor: { x: 0.5, y: 0.5 } }
  const moved = wallMaths.snapWallPiece(clock, middle)
  assert.equal(moved.isValid, true)
  assert.ok(moved.cover.alongMax <= window.along[0] + 1e-3 || moved.cover.alongMin >= window.along[1] - 1e-3, "beside the window")
  const curtain = wallMaths.snapWallPiece({ width: 0.12, height: 0.2, anchor: { x: 0.5, y: 0.5 } }, { x: middle.x + 0.03, y: middle.y }, "opening")
  assert.equal(curtain.isValid, true)
  assert.ok(Math.abs(curtain.spot.along - (window.along[0] + window.along[1]) / 2) < 1e-3, "centred on the window")
})

test("the drop puts the wall piece exactly where its drag showed it, and Save accepts it", () => {
  const scene = sceneWith([SHELF_START])
  for (const finger of [{ x: 0.62, y: 0.3 }, { x: 0.88, y: 0.42 }, { x: 0.08, y: 0.42 }, { x: 0.5, y: 0.2 }]) {
    const preview = dragShelfTo(scene, finger)!
    if (!preview.isValid) continue
    const item = preview.item as RoomV2FurnitureRenderItem
    assert.equal(drag.resolveRoomEditorDragRelease({ source: "stage", moved: true, inside: true, preview }), "commit")
    const saved = roundTrip(placement.createRoomEditorPlacedItemFromPreview(preview, item))
    const decor: UserRoomDecor = { roomShellId: SHELL_ID, placedItems: [saved] }
    const reloaded = sceneWith([saved])
    const placed = furnitureOf(reloaded, "shelf")
    assert.equal(placed.x, item.x)
    assert.equal(placed.y, item.y)
    assert.deepEqual(placed.wallPlacement, item.wallPlacement)
    const validation = validateRoomV2DraftPlacements({ scene: reloaded, decor, furnitureCatalog: CATALOG })
    assert.equal(validation.isValid, true, `${finger.x},${finger.y}: Save accepts the dropped spot`)
  }
})

test("a wall piece from the tray lands on the same wall spot as the same piece dragged in the room", () => {
  const scene = sceneWith([SHELF_START])
  const shelf = CATALOG.find((item) => item.id === SHELF_ID)!
  assert.equal(drag.getRoomEditorTrayUsesWallMagnet(shelf, "front"), true)
  for (const finger of [{ x: 0.66, y: 0.28 }, { x: 0.12, y: 0.4 }]) {
    const fromRoom = dragShelfTo(scene, finger)!
    const cell = drag.getRoomEditorDragCell({ ...finger, inside: true }, null)
    const fromTray = drag.createRoomEditorTrayDragPreview({
      copy, scene: sceneWith([]), stageWindowBounds: STAGE, item: shelf, instanceId: "shelf", rotation: "front",
      floor: null, column: cell.column, row: cell.row
    })!
    assert.equal(fromTray.item.x, fromRoom.item.x)
    assert.equal(fromTray.item.y, fromRoom.item.y)
    assert.equal(fromTray.isValid, fromRoom.isValid)
  }
})

test("while a wall piece is placed the wall strip behind it lights, in its validity tone; floors stay as they were", () => {
  const scene = sceneWith([SHELF_START])
  const size = { width: 400, height: 228 }
  const clear = dragShelfTo(scene, { x: 0.7, y: 0.3 })!
  assert.equal(clear.isValid, true)
  const overlay = createRoomEditorFloorOverlay({ shell: scene.shell, preview: clear, stage: size })!
  assert.equal(overlay.tone, "valid")
  assert.ok(overlay.wallStrip, "a wall strip")
  assert.equal(overlay.cells.length, 0, "no floor cells for a wall piece")
  assert.ok(overlay.wallStrip.base.width > 0)
  const blocked = { ...clear, isValid: false }
  assert.equal(createRoomEditorFloorOverlay({ shell: scene.shell, preview: blocked, stage: size })!.tone, "invalid")
  const selected = createRoomEditorFloorOverlay({ shell: scene.shell, preview: undefined, stage: size, selectedItem: furnitureOf(scene, "shelf") })!
  assert.equal(selected.tone, "selected")
  assert.ok(selected.wallStrip)
  // the room no longer has a rectangle highlight to draw for it, and a held wall piece sits on its magnet spot
  const [rect] = drag.createRoomEditorDragHitRects(scene.renderItems, scene.shell)
  assert.equal(rect!.usesWallMagnet, true)
})

test("a room saved before the magnet keeps its wall pieces where they were (no move, no new Save block)", () => {
  // a spot the shell's old wall band allowed but the measured wall does not (over the window)
  const window = C.openings.find((opening) => opening.id === "window")!
  const overWindow = wallMaths.wallSpotToStageFraction(C, {
    wall: window.wall, along: (window.along[0] + window.along[1]) / 2, height: 1.2
  })
  const saved: PlacedRoomItem = { instanceId: "shelf", itemId: SHELF_ID, x: overWindow.x, y: overWindow.y, rotation: "front" }
  const decor: UserRoomDecor = { roomShellId: SHELL_ID, placedItems: [saved] }
  const scene = sceneWith([saved])
  const shelf = furnitureOf(scene, "shelf")
  assert.equal(shelf.x, saved.x, "drawn where it was saved")
  assert.equal(shelf.y, saved.y)
  assert.equal(shelf.wallPlacement?.isValid, false)
  const untouched = validateRoomV2DraftPlacements({ scene, decor, furnitureCatalog: CATALOG, untouchedFrom: decor })
  assert.equal(untouched.isValid, true, "left alone, it does not block Save")
  const placedThere = validateRoomV2DraftPlacements({ scene, decor, furnitureCatalog: CATALOG })
  assert.equal(placedThere.isValid, false, "put there now, it is refused")
})

// ---- 2. turn with a nudge ----

interface TurnCase {
  decor: UserRoomDecor
  scene: ResolvedRoomV2Scene
  placed: PlacedRoomItem
}

function sofaTurnCases(): TurnCase[] {
  const floor = getRoomV2FloorGridProjection(sceneWith([]).shell!.floorGrid!)
  const cases: TurnCase[] = []
  for (let column = floor.minColumn; column <= floor.maxColumn; column += 1) {
    for (let row = floor.minRow; row <= floor.maxRow; row += 1) {
      const point = getRoomV2FloorGridCellPoint(floor, column, row)
      if (!isRoomV2FloorGridPointOnFloor(floor, point.x, point.y)) continue
      const placed: PlacedRoomItem = {
        instanceId: "sofa",
        itemId: ROOM_AVATAR_25D_SOFA_ID,
        x: Math.round(point.x * 1e6) / 1e6,
        y: Math.round(point.y * 1e6) / 1e6,
        rotation: "front"
      }
      const decor: UserRoomDecor = { roomShellId: SHELL_ID, placedItems: [placed] }
      cases.push({ decor, scene: sceneWith([placed]), placed })
    }
  }
  return cases
}

function turnsInPlace(turn: TurnCase): boolean {
  const exact = resolveRoomV2ExactRotationPreview({
    decor: turn.decor, scene: turn.scene, furnitureCatalog: CATALOG, instanceId: "sofa", rotation: "right"
  })
  if (exact.status !== "ready") return false
  return placement.createRoomV2PlacementPreviewResult({ copy, scene: turn.scene, candidate: exact.candidate, placementIsValid: true }).isValid
}

test("a turn that does not fit where the piece stands moves it to the nearest cell where it fits", () => {
  const floor = getRoomV2FloorGridProjection(sceneWith([]).shell!.floorGrid!)
  let nudged = 0
  let refused = 0
  for (const turn of sofaTurnCases()) {
    if (turnsInPlace(turn)) continue
    const nudge = findRoomEditorRotateNudge({
      copy, scene: turn.scene, decor: turn.decor, furnitureCatalog: CATALOG, instanceId: "sofa", rotation: "right"
    })
    const from = snapRoomV2FloorGridCell(floor, turn.placed.x, turn.placed.y)
    if (!nudge) {
      refused += 1
      continue
    }
    nudged += 1
    assert.equal(nudge.isValid, true)
    const item = nudge.item as RoomV2FurnitureRenderItem
    assert.equal(item.rotation, "right")
    const to = snapRoomV2FloorGridCell(floor, item.x, item.y)
    const ring = Math.max(Math.abs(to.column - from.column), Math.abs(to.row - from.row))
    assert.ok(ring >= 1 && ring <= ROOM_EDITOR_ROTATE_NUDGE_RINGS, `moved ${ring} cells`)
    // the turn commits like a drop: the saved piece stands on exactly the cells the turn showed
    const saved = roundTrip(placement.createRoomEditorPlacedItemFromPreview(nudge, item))
    assert.equal(saved.rotation, "right")
    const placed = furnitureOf(sceneWith([saved]), "sofa")
    assert.deepEqual(placed.footprintCells, item.footprintCells)
  }
  assert.ok(nudged > 20, `nudged ${nudged} turns`)
  // a rotation the piece has no drawing for is never "fitted" by moving it
  const table: PlacedRoomItem = { instanceId: "table", itemId: "room_v2_table_round", x: 0.36, y: 0.64, rotation: "front" }
  const tableDecor: UserRoomDecor = { roomShellId: SHELL_ID, placedItems: [table] }
  assert.equal(findRoomEditorRotateNudge({
    copy, scene: sceneWith([table]), decor: tableDecor, furnitureCatalog: CATALOG, instanceId: "table", rotation: "right"
  }), null)
  assert.ok(refused >= 1, "with nothing free within reach the turn is still refused")
})

test("the nudge takes the nearest free cell: no closer cell would have fitted the turn", () => {
  const floor = getRoomV2FloorGridProjection(sceneWith([]).shell!.floorGrid!)
  const turn = sofaTurnCases().find((entry) => !turnsInPlace(entry) &&
    findRoomEditorRotateNudge({ copy, scene: entry.scene, decor: entry.decor, furnitureCatalog: CATALOG, instanceId: "sofa", rotation: "right" }))!
  const nudge = findRoomEditorRotateNudge({ copy, scene: turn.scene, decor: turn.decor, furnitureCatalog: CATALOG, instanceId: "sofa", rotation: "right" })!
  const from = snapRoomV2FloorGridCell(floor, turn.placed.x, turn.placed.y)
  const to = snapRoomV2FloorGridCell(floor, nudge.item.x, nudge.item.y)
  const chosen = (to.column - from.column) ** 2 + (to.row - from.row) ** 2
  for (let dc = -2; dc <= 2; dc += 1) {
    for (let dr = -2; dr <= 2; dr += 1) {
      const distance = dc * dc + dr * dr
      if (distance === 0 || distance >= chosen) continue
      const point = getRoomV2FloorGridCellPoint(floor, from.column + dc, from.row + dr)
      const moved: PlacedRoomItem = { ...turn.placed, x: Math.round(point.x * 1e6) / 1e6, y: Math.round(point.y * 1e6) / 1e6, rotation: "right" }
      const exact = resolveRoomV2ExactRotationPreview({
        decor: { roomShellId: SHELL_ID, placedItems: [moved] }, scene: turn.scene, furnitureCatalog: CATALOG, instanceId: "sofa", rotation: "right"
      })
      const fits = exact.status === "ready" &&
        placement.createRoomV2PlacementPreviewResult({ copy, scene: turn.scene, candidate: exact.candidate, placementIsValid: true }).isValid
      assert.equal(fits, false, `cell ${dc},${dr} is nearer and must not fit`)
    }
  }
})

test("while a piece turns, its drawings stand at one place at every moment, gliding from the old spot to the new", () => {
  const delta = { x: 37, y: -12 }
  for (let step = 0; step <= 20; step += 1) {
    const frame = motion.getRoomEditorTurnFrame(step / 20)
    const outgoing = motion.getRoomEditorTurnOffset("outgoing", frame.slide, delta)
    const incoming = motion.getRoomEditorTurnOffset("incoming", frame.slide, delta)
    // outgoing is drawn from the old spot, incoming from the new one (old + delta): same place on screen
    assert.ok(Math.abs(outgoing.x - (incoming.x + delta.x)) < EPS && Math.abs(outgoing.y - (incoming.y + delta.y)) < EPS)
  }
  const start = motion.getRoomEditorTurnFrame(0)
  const end = motion.getRoomEditorTurnFrame(1)
  const atRest = (offset: RoomPoint2D) => Math.abs(offset.x) < EPS && Math.abs(offset.y) < EPS
  assert.ok(atRest(motion.getRoomEditorTurnOffset("outgoing", start.slide, delta)), "the old drawing starts on its spot")
  assert.ok(atRest(motion.getRoomEditorTurnOffset("incoming", end.slide, delta)), "the new drawing ends on its spot")
  assert.equal(end.incomingOpacity, 1)
  assert.equal(end.outgoingOpacity, 0)
  assert.ok(motion.getRoomEditorTurnMs(true) > motion.getRoomEditorTurnMs(false), "a nudge glides a little longer")
})

test("the room hides a turning piece only while it turns, so the old drawing never shows on its old spot", () => {
  const scene = sceneWith([{ instanceId: "sofa", itemId: ROOM_AVATAR_25D_SOFA_ID, x: 0.5, y: 0.7, rotation: "front" }])
  const from = furnitureOf(scene, "sofa")
  const to = { ...from, rotation: "right" as const }
  const turning = { key: 1, kind: "turn" as const, from, to, nudged: effects.isRoomEditorTurnNudge(from, to), phase: "turning" as const }
  assert.equal(turning.nudged, false)
  assert.equal(effects.getRoomEditorTurnHiddenRenderId(turning), "sofa")
  assert.equal(effects.getRoomEditorTurnHiddenRenderId({ ...turning, phase: "handoff" }), undefined)
  assert.equal(effects.getRoomEditorTurnHiddenRenderId({ key: 2, kind: "sparkle", item: from }), undefined)
  assert.equal(effects.isRoomEditorTurnNudge(from, { ...to, x: from.x + 0.02 }), true)
})

// ---- 3. her avatar tries a newly placed seat ----

test("after Save, the seat to try is the newest seat that was not in the room before", () => {
  const before: PlacedRoomItem[] = [{ instanceId: "old_sofa", itemId: ROOM_AVATAR_25D_SOFA_ID, x: 0.5, y: 0.7, rotation: "front" }]
  const moved = { ...before[0]!, x: 0.6 }
  const shelf: PlacedRoomItem = { instanceId: "shelf", itemId: SHELF_ID, x: 0.7, y: 0.3, rotation: "front" }
  const chair: PlacedRoomItem = { instanceId: "chair_new", itemId: "room_v2_chair_blush", x: 0.4, y: 0.75, rotation: "front" }
  const sofa: PlacedRoomItem = { instanceId: "sofa_new", itemId: ROOM_AVATAR_25D_SOFA_ID, x: 0.6, y: 0.8, rotation: "front" }
  const find = (after: PlacedRoomItem[]) => newSeat.findRoomEditorNewSeat({ before, after, furnitureCatalog: CATALOG })
  assert.equal(find([moved]), undefined, "moving a seat that was there is not a new seat")
  assert.equal(find([moved, shelf]), undefined, "a new piece that is not a seat")
  assert.equal(find([moved, chair]), "chair_new")
  assert.equal(find([moved, chair, sofa]), "sofa_new", "the newest one")
  // handed over once
  newSeat.offerRoomEditorNewSeat("chair_new")
  assert.equal(newSeat.peekRoomEditorNewSeat(), "chair_new")
  assert.equal(newSeat.takeRoomEditorNewSeat(), "chair_new")
  assert.equal(newSeat.takeRoomEditorNewSeat(), undefined)
  newSeat.offerRoomEditorNewSeat(undefined)
  assert.equal(newSeat.peekRoomEditorNewSeat(), undefined)
})

test("a newly placed armchair or sofa gives her a seat she can walk to from where she stands", () => {
  for (const itemId of ["room_v2_chair_blush", ROOM_AVATAR_25D_SOFA_ID]) {
    const scene = sceneWith([{ instanceId: "new_seat", itemId, x: 0.36, y: 0.6, rotation: "front" }])
    const geometry = createRoomWorldGeometryFromRoomV2Scene(scene)
    const hotspots = createRoomWorldHotspotsFromRoomV2Scene(scene)
    const selection = runtime.resolveRoomWorldSeatSelection({
      geometry,
      from: MY_ROOM_AVATAR_SPAWN,
      hotspots,
      seatedFurnitureRenderId: "new_seat",
      clearance: runtime.ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
      timing: flagged.movementTiming(runtime.ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING)
    })
    assert.ok(selection?.hotspot && selection.approach, `${itemId}: a seat and its approach`)
    assert.equal(selection.hotspot.sourceRenderId, "new_seat")
    const walkable = geometry.walkableAreas.some((area) => pointInRoomWorldPolygon(selection.approach!, area.points))
    assert.ok(walkable, `${itemId}: the approach is on the walkable floor`)
  }
})
