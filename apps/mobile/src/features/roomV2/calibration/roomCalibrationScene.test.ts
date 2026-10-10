import assert from "node:assert/strict"
import test from "node:test"
import { roomAvatar25d as uninstalledSeam } from "../../avatar/roomAvatarSeam"
import { ROOM_BLUMI_WORLD_FLOOR_GRID } from "@blumi/domain"
import {
  isRoomV2FurnitureFootprintOnFloor,
  resolvePlacedFurnitureRenderItem,
  resolveRoomV2Scene,
  validateRoomV2FurniturePlacement
} from "../roomV2Selectors"
import type {
  FurnitureItem,
  ResolvedRoomV2Scene,
  RoomShell,
  RoomV2FurnitureRenderItem
} from "../roomV2.types"
import { createRoomEditorPlacedItemFromPreview } from "../editor/roomEditorPlacementModel"
import {
  createMyRoomAvatarDepthNeighbours,
  getMyRoomAvatarDepthIndex
} from "../../roomWorld/myRoomAvatarWalkModel"
import { MY_ROOM_AVATAR_SPAWN } from "../../roomWorld/myRoomInteractionModel"
import { createRoomWorldGeometryFromRoomV2Scene } from "../../roomWorld/roomWorldRoomV2Projection"
import { isRoomWorldPointWalkable } from "../../roomWorld/roomWorldGeometry"
import {
  createRoomWorldMovementPlan,
  ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
} from "../../roomWorld/roomWorldRuntime"
import {
  floorCellCentre,
  floorToStageFraction,
  isFloorPointInFrontOfBox,
  isFloorPointWalkable,
  isPointInFloorPolygon,
  leftWallX,
  ROOM_CALIBRATION as C,
  rightWallZ,
  stageFractionToFloor,
  type FloorPoint
} from "./roomCalibration"
import {
  calibrateFurnitureRenderItem,
  calibrateRoomShell,
  calibrateRoomWalkGeometry,
  getCalibratedFurnitureFloorBox,
  resolveCalibratedTapTarget
} from "./roomCalibrationScene"
import { createRoomAvatar25dRoomCalibration, ROOM_AVATAR_25D_WORLD_HEIGHT } from "./roomAvatar25dRoomCalibration"
import { getAvatar25BoxPlacement } from "../../avatar/renderer/avatar25Placement"

// The shipped Blumi Home shell and lounge chair (roomV2Catalog), without their image modules (plain Node).
const SHELL: RoomShell = {
  id: "room_v2_shell_blumi_world_v1",
  name: "Blumi Home",
  asset: { key: "shell", source: 0 as never },
  canvasSize: { width: 1254, height: 714 },
  floorGrid: ROOM_BLUMI_WORLD_FLOOR_GRID
}
const CALIBRATED_SHELL = calibrateRoomShell(SHELL)
const CHAIR: FurnitureItem = {
  id: "room_v2_chair_blush",
  name: "Blush Lounge Chair",
  asset: { key: "chair", source: 0 as never },
  category: "seating",
  layer: "furniture",
  width: 0.126,
  height: 0.244,
  footprint: { width: 0.109, height: 0.067 },
  blocksMovement: true,
  interactionType: "seat",
  seatSpec: {
    capacity: 1,
    seatPoints: [{
      id: "front_edge",
      x: 0.1,
      y: -0.2,
      facing: "front",
      approachPoint: { x: 0, y: 0.22 },
      exitPoint: { x: 0, y: 0.28 },
      seatHeight: 0.096
    }]
  }
}

/** A chair saved on the stage point of calibrated cell (i, j), as the editor snaps it, calibrated. */
function chairOnCell(i: number, j: number, instanceId = "chair"): RoomV2FurnitureRenderItem {
  const point = floorToStageFraction(C, floorCellCentre(C, { i, j }))
  const plain = resolvePlacedFurnitureRenderItem({ instanceId, itemId: CHAIR.id, x: point.x, y: point.y, rotation: "front" }, CHAIR)!
  return calibrateFurnitureRenderItem(plain)
}

function sceneWith(items: RoomV2FurnitureRenderItem[]): ResolvedRoomV2Scene {
  return { shell: CALIBRATED_SHELL, renderItems: items }
}

const toFloor = (point: { x: number; y: number }): FloorPoint => stageFractionToFloor(C, point)

test("without the installed seam (plain Node) nothing changes: no calibration, the catalog shell and footprints as is", () => {
  assert.equal(uninstalledSeam.roomCalibration, null)
  const scene = resolveRoomV2Scene({
    roomShellCatalog: [SHELL],
    furnitureCatalog: [CHAIR],
    decor: { roomShellId: SHELL.id, placedItems: [{ instanceId: "c", itemId: CHAIR.id, x: 0.58, y: 0.86, rotation: "front" }] }
  })
  assert.equal(scene.shell, SHELL)
  const chair = scene.renderItems[0] as RoomV2FurnitureRenderItem
  assert.equal(chair.collisionPolygon, undefined)
  assert.equal(chair.renderOffset, undefined)
})

test("a chair keeps its saved spot and stands on a 2x2-cell floor diamond just behind it", () => {
  const chair = chairOnCell(8, 9)
  const saved = floorToStageFraction(C, floorCellCentre(C, { i: 8, j: 9 }))
  assert.equal(chair.x, saved.x)
  assert.equal(chair.y, saved.y)
  assert.equal(chair.renderOffset, undefined)
  const corners = chair.collisionPolygon!.map(toFloor)
  // back, right, front, left corners of cells i 6..7, j 7..8 (a hair inside so neighbours may touch)
  const expected = [[3, 3.5], [4, 3.5], [4, 4.5], [3, 4.5]]
  corners.forEach((corner, index) => {
    assert.ok(Math.abs(corner.x - expected[index]![0]!) < 0.02 && Math.abs(corner.z - expected[index]![1]!) < 0.02,
      `corner ${index}: ${JSON.stringify(corner)}`)
  })
})

test("a chair in the last row before each back wall is drawn flush with that wall, on the floor", () => {
  // left wall: the footprint's back is cell i = -1 (X -0.5), a sliver from the wall at X ~ -0.69
  const atLeft = chairOnCell(1, 8)
  const left = getCalibratedFurnitureFloorBox(atLeft)
  assert.ok(Math.abs(left.placed.minX - (leftWallX(C, left.placed.minZ) + 0.01)) < 1e-6, "flush with the left wall")
  assert.ok(atLeft.renderOffset && atLeft.renderOffset.y < 0, "drawn back toward the wall")
  assert.ok(isRoomV2FurnitureFootprintOnFloor(atLeft, [...CALIBRATED_SHELL.floorGrid!.outline]))
  // right wall: the far end of the last row (the wall drifts off the tiles there)
  const atRight = chairOnCell(12, 1)
  const right = getCalibratedFurnitureFloorBox(atRight)
  assert.ok(atRight.renderOffset && atRight.renderOffset.y < 0, "drawn back toward the right wall")
  assert.ok(Math.abs(right.placed.minZ - (Math.max(rightWallZ(C, right.placed.minX), rightWallZ(C, right.placed.maxX)) + 0.01)) < 1e-6)
  assert.ok(isRoomV2FurnitureFootprintOnFloor(atRight, [...CALIBRATED_SHELL.floorGrid!.outline]))
  // in the middle of the room a chair keeps its cells and is not moved
  assert.equal(chairOnCell(7, 7).renderOffset, undefined)
})

test("a chair a whole cell into a wall or over the front edge is off the floor", () => {
  const outline = [...CALIBRATED_SHELL.floorGrid!.outline]
  assert.ok(!isRoomV2FurnitureFootprintOnFloor(chairOnCell(-2, 8), outline), "into the left wall")
  assert.ok(!isRoomV2FurnitureFootprintOnFloor(chairOnCell(8, -2), outline), "into the right wall")
  assert.ok(!isRoomV2FurnitureFootprintOnFloor(chairOnCell(16, 8), outline), "over the front edge")
  const validation = validateRoomV2FurniturePlacement({ scene: sceneWith([]), candidate: chairOnCell(16, 8) })
  assert.deepEqual(validation.issueIds, ["outside_placeable_area"])
})

test("chairs on neighbouring cells may touch; a chair on a taken cell overlaps", () => {
  const placed = chairOnCell(7, 7, "a")
  const beside = validateRoomV2FurniturePlacement({ scene: sceneWith([placed]), candidate: chairOnCell(9, 7, "b") })
  assert.equal(beside.isValid, true)
  const onTop = validateRoomV2FurniturePlacement({ scene: sceneWith([placed]), candidate: chairOnCell(8, 7, "b") })
  assert.deepEqual(onTop.issueIds, ["overlaps_blocking_furniture"])
})

test("walking round a chair she is drawn in front of it exactly when world depth says so", () => {
  const chair = chairOnCell(8, 8)
  const box = getCalibratedFurnitureFloorBox(chair).placed
  const neighbours = createMyRoomAvatarDepthNeighbours([chair], { layer: "furniture", renderId: "avatar" })
  let checked = 0
  for (let x = box.minX - 1; x <= box.maxX + 1; x += 0.125) {
    for (let z = box.minZ - 1; z <= box.maxZ + 1; z += 0.125) {
      const feet = { x, z }
      // her feet never stand in the chair; beside it on screen (past one face, behind the other) either order is fine
      const inside = x > box.minX - C.footRadius && x < box.maxX + C.footRadius &&
        z > box.minZ - C.footRadius && z < box.maxZ + C.footRadius
      const beside = (x >= box.maxX && z <= box.minZ) || (z >= box.maxZ && x <= box.minX)
      if (inside || beside) continue
      const stage = floorToStageFraction(C, feet)
      const inFront = getMyRoomAvatarDepthIndex(neighbours, stage.y, stage.x, stage.y) === 1
      assert.equal(inFront, isFloorPointInFrontOfBox(feet, box), `feet ${JSON.stringify(feet)}`)
      checked += 1
    }
  }
  assert.ok(checked > 100)
})

test("she walks on the calibrated floor: from the spawn to a back-wall tap, never past the painted floor", () => {
  const scene = sceneWith([chairOnCell(8, 8)])
  const geometry = calibrateRoomWalkGeometry(createRoomWorldGeometryFromRoomV2Scene(scene), scene.shell)
  const clearance = { clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE }
  assert.ok(isRoomWorldPointWalkable(geometry, MY_ROOM_AVATAR_SPAWN, clearance), "spawn")
  const taps = [
    { x: 427 / 1254, y: 200 / 714 }, // the window (left wall)
    { x: 1035 / 1254, y: 300 / 714 }, // the lamp niche (right wall)
    { x: 601 / 1254, y: 230 / 714 }, // the back corner
    { x: 618 / 1254, y: 705 / 714 }, // below the front bay
    { x: 1240 / 1254, y: 476 / 714 }, // the right corner
    { x: 20 / 1254, y: 474 / 714 } // the left corner
  ]
  for (const tap of taps) {
    const target = resolveCalibratedTapTarget(tap, scene.shell)
    assert.ok(isFloorPointWalkable(C, toFloor(target)), `target walkable for ${JSON.stringify(tap)}`)
    const plan = createRoomWorldMovementPlan({
      geometry,
      from: MY_ROOM_AVATAR_SPAWN,
      to: target,
      clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
      timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
    })
    assert.ok(plan, `a path to ${JSON.stringify(tap)}`)
    for (const point of plan.path) {
      assert.ok(isPointInFloorPolygon(toFloor(point), C.floorPolygon), "on the painted floor")
    }
  }
})

test("saving a calibrated piece writes its saved spot, never the wall-flush drawing spot", () => {
  const chair = chairOnCell(1, 8)
  assert.ok(chair.renderOffset)
  const placed = createRoomEditorPlacedItemFromPreview({ item: chair, isValid: true }, chair)
  assert.equal(placed.x, chair.x)
  assert.equal(placed.y, chair.y)
  assert.equal("renderOffset" in placed, false)
})

test("calibrating twice is calibrating once", () => {
  const once = chairOnCell(1, 8)
  assert.deepEqual(calibrateFurnitureRenderItem(once), once)
})

test("her figure is the owner's girl height (2026-10-09 addendum): N 1.965, card 1.827, under the 2.105 door", () => {
  const calibration = createRoomAvatar25dRoomCalibration()
  const stageHeightPx = 1100
  // the door (the calibration's own measure) and the scale are unchanged; she is drawn at N 1.965
  assert.equal(C.avatarHeight, 2.105)
  assert.equal(ROOM_AVATAR_25D_WORLD_HEIGHT, 1.965)
  assert.ok(Math.abs(ROOM_AVATAR_25D_WORLD_HEIGHT * C.screenUp[1] - 1.827) < 0.001, "the card's plane height")
  const girl = (ROOM_AVATAR_25D_WORLD_HEIGHT * C.pxPerUnit * C.screenUp[1] / C.canvas.height) * stageHeightPx
  assert.ok(Math.abs(calibration.avatarFigureHeightPx(stageHeightPx) - girl) < 1e-9)
  // the same world scale as the door: 0.934 of its drawn height
  const door = (C.avatarHeight * C.pxPerUnit * C.screenUp[1] / C.canvas.height) * stageHeightPx
  assert.ok(Math.abs(calibration.avatarFigureHeightPx(stageHeightPx) / door - 1.965 / 2.105) < 1e-9)
})

test("with the calibration her soles stand on the box's floor point, at the calibrated height", () => {
  const box = 330
  const calibrated = getAvatar25BoxPlacement(box, 1.55, 240)
  const canvasHeight = box - 2 * Number(calibrated.overhangStyle.top)
  assert.ok(Math.abs(calibrated.anchorY * canvasHeight + Number(calibrated.overhangStyle.top) - box) < 1e-9, "soles on the floor point")
  assert.equal(calibrated.figureHeightPx, 240)
  // without it: the avatarV2 foot line and box-relative size, exactly as before
  const shipped = getAvatar25BoxPlacement(box, 1.55)
  assert.ok(Math.abs(shipped.anchorY * (box + 2 * box * 0.45) - box * 0.45 - box * (343 / 384)) < 1e-9)
  assert.equal(shipped.footLiftPx, 0)
})
