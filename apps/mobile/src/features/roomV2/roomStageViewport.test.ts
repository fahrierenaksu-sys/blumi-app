import assert from "node:assert/strict"
import test from "node:test"
import {
  mapRoomScreenPointToStage,
  mapRoomStageLocalPointToStage,
  mapRoomStagePointToScreen,
  type RoomStageViewport
} from "./roomStageViewport"
import {
  getRoomV2FloorGridProjection,
  projectRoomV2FloorGridTilePoint,
  ROOM_V2_BLUMI_WORLD_FLOOR_GRID,
  unprojectRoomV2FloorGridPoint
} from "./roomV2FloorGrid"
import { createRoomWorldFloorGeometry } from "../roomWorld/roomWorldGeometry"
import { resolveRoomWorldInteractiveTarget, ROOM_WORLD_AVATAR_COLLISION_CLEARANCE } from "../roomWorld/roomWorldRuntime"

const CANVAS = { width: 1254, height: 714 }
const PROJECTION = getRoomV2FloorGridProjection(ROOM_V2_BLUMI_WORLD_FLOOR_GRID)
const FLOOR = createRoomWorldFloorGeometry(ROOM_V2_BLUMI_WORLD_FLOOR_GRID, CANVAS)

/** Phone and tablet stage boxes (pt) and how each surface frames them. */
const VIEWPORTS: RoomStageViewport[] = [
  // iPhone SE My Room: renderer wider than the card, scrolled and lifted by the camera.
  { originX: -48, originY: 131, width: 416, height: 416 * CANVAS.height / CANVAS.width, zoom: 1 },
  // iPhone 16 Pro My Room.
  { originX: -12, originY: 164.5, width: 426, height: 426 * CANVAS.height / CANVAS.width, zoom: 1 },
  // MiniRoom camera zoomed on the floor, panned left, under the notch.
  { originX: -311.25, originY: 47, width: 692, height: 692 * CANVAS.height / CANVAS.width, zoom: 1.76 },
  { originX: -580, originY: -120, width: 692, height: 692 * CANVAS.height / CANVAS.width, zoom: 2.4 },
  // iPad landscape.
  { originX: 40, originY: 90, width: 1180, height: 1180 * CANVAS.height / CANVAS.width, zoom: 1 }
]

test("screen -> stage -> floor tile -> stage -> screen lands within 1 pt on every device and zoom", () => {
  for (const viewport of VIEWPORTS) {
    for (let i = -0.4; i <= 7.4; i += 0.37) {
      for (let j = -0.4; j <= 7.4; j += 0.41) {
        const start = mapRoomStagePointToScreen(viewport, projectRoomV2FloorGridTilePoint(PROJECTION, i, j))
        const stage = mapRoomScreenPointToStage(viewport, start.x, start.y)
        const tile = unprojectRoomV2FloorGridPoint(PROJECTION, stage.x, stage.y)
        const back = mapRoomStagePointToScreen(viewport, projectRoomV2FloorGridTilePoint(PROJECTION, tile.i, tile.j))
        assert.ok(Math.hypot(back.x - start.x, back.y - start.y) < 1, `${back.x},${back.y} vs ${start.x},${start.y}`)
        assert.ok(Math.abs(tile.i - i) < 1e-6 && Math.abs(tile.j - j) < 1e-6)
      }
    }
  }
})

test("a tap on open floor walks to the floor point under the finger", () => {
  for (const viewport of VIEWPORTS) {
    // Drawn grout crossings all over the floor, the side corners and the front bay included.
    for (const [i, j] of [[1, 1], [6, 1], [1, 6], [3.5, 3.5], [6.5, 6.5], [0.5, 6], [6, 0.5], [7, 6.6]]) {
      const floorPoint = projectRoomV2FloorGridTilePoint(PROJECTION, i!, j!)
      const finger = mapRoomStagePointToScreen(viewport, floorPoint)
      const tapped = mapRoomScreenPointToStage(viewport, finger.x, finger.y)
      const target = resolveRoomWorldInteractiveTarget({
        geometry: FLOOR,
        target: tapped,
        clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
        from: { x: 0.47, y: 0.84 }
      })
      assert.ok(target, `tile ${i},${j}`)
      const landed = mapRoomStagePointToScreen(viewport, target)
      assert.ok(Math.hypot(landed.x - finger.x, landed.y - finger.y) < 1, `tile ${i},${j} landed ${landed.x},${landed.y}`)
    }
  }
})

test("a touch in the stage view's own coordinates maps by the box measured at the tap", () => {
  assert.deepEqual(mapRoomStageLocalPointToStage(213, 121.25, 426, 242.5), { x: 0.5, y: 0.5 })
  // Not clamped: a touch past the edge resolves to the nearest floor point later.
  assert.deepEqual(mapRoomStageLocalPointToStage(-42.6, 0, 426, 242.5), { x: -0.1, y: 0 })
  assert.deepEqual(mapRoomStageLocalPointToStage(10, 10, 0, 0), { x: 0, y: 0 })
})
