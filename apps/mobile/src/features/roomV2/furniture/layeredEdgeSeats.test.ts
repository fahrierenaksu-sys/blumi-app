import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { ROOM_BLUMI_WORLD_FLOOR_GRID } from "@blumi/domain"
import { resolvePlacedFurnitureRenderItem } from "../roomV2Selectors"
import type { FurnitureItem, RoomFurnitureRotation, RoomShell, RoomV2FurnitureRenderItem } from "../roomV2.types"
import { MY_ROOM_AVATAR_SPAWN } from "../../roomWorld/myRoomInteractionModel"
import { createRoomWorldGeometryFromRoomV2Scene, createRoomWorldHotspotsFromRoomV2Scene } from "../../roomWorld/roomWorldRoomV2Projection"
import {
  createRoomWorldMovementPlan,
  ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
} from "../../roomWorld/roomWorldRuntime"
import { createRoomAvatar25dRoomCalibration } from "../calibration/roomAvatar25dRoomCalibration"
import { floorCellCentre, floorToStageFraction, ROOM_CALIBRATION as C } from "../calibration/roomCalibration"
import { calibrateRoomShell, calibrateRoomWalkGeometry } from "../calibration/roomCalibrationScene"
import { LAYERED_FURNITURE_SPECS, LAYERED_ROTATION_INDEX } from "./layeredFurniture"
import { projectWorldOffsetToSpritePx, seatFacesCamera } from "./layeredEdgeSeats"

// The bundled art loads as file names in plain Node (Metro image modules).
for (const extension of [".png", ".webp", ".jpg"]) {
  require.extensions[extension] = (module, filename) => { module.exports = filename }
}
/* eslint-disable @typescript-eslint/no-require-imports -- image modules need the hook above first. */
const { LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS } = require("./layeredFurnitureAssets") as
  typeof import("./layeredFurnitureAssets")
const { createRoomAvatar25dFurnitureCatalog } = require("./layeredFurnitureCatalog") as
  typeof import("./layeredFurnitureCatalog")
/* eslint-enable @typescript-eslint/no-require-imports */

interface RawItem {
  interactions?: string[]
  camera: { yaw_deg: number; pitch_deg: number }
  px_per_world_unit: number
  rotations: Record<string, { seats: { id: string; pose?: string; facing_yaw_deg: number; avatar_view: string }[] }>
}

const ROTATIONS: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
const SHELL = calibrateRoomShell({
  id: "room_v2_shell_blumi_world_v1",
  name: "Blumi Home",
  asset: { key: "shell", source: 0 as never },
  canvasSize: { width: 1254, height: 714 },
  floorGrid: ROOM_BLUMI_WORLD_FLOOR_GRID
} satisfies RoomShell)
const calibration = createRoomAvatar25dRoomCalibration(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)
const CATALOG = new Map(createRoomAvatar25dFurnitureCatalog(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)
  .map((item) => [item.id, item]))

const raw = (id: string): RawItem => JSON.parse(readFileSync(join(__dirname, id, "item.json"), "utf8")) as RawItem
const SEATED_IDS = Object.keys(LAYERED_FURNITURE_SPECS)
  .filter((id) => CATALOG.has(id) && Object.values(LAYERED_FURNITURE_SPECS[id]!.rotations).some((r) => r.seats.length > 0))
const EDGE_SEATED = SEATED_IDS.filter((id) => raw(id).interactions?.includes("sit_edge"))

function onCell(id: string, i: number, j: number, rotation: RoomFurnitureRotation): RoomV2FurnitureRenderItem {
  const furniture: FurnitureItem = CATALOG.get(id)!
  const point = floorToStageFraction(C, floorCellCentre(C, { i, j }))
  return calibration.calibrateFurnitureItem(resolvePlacedFurnitureRenderItem(
    { instanceId: `${id}-${rotation}`, itemId: id, x: point.x, y: point.y, rotation },
    furniture
  )!)
}

function canWalk(piece: RoomV2FurnitureRenderItem, to: { x: number; y: number }) {
  const geometry = calibrateRoomWalkGeometry(createRoomWorldGeometryFromRoomV2Scene({ shell: SHELL, renderItems: [piece] }), SHELL)
  return createRoomWorldMovementPlan({
    geometry,
    from: MY_ROOM_AVATAR_SPAWN,
    to,
    clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
    timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  })
}

test("every bed is sat on from its camera-facing long edge, facing us, in every rotation (owner 2026-10-17)", () => {
  assert.ok(EDGE_SEATED.length >= 3, "the three beds are checked")
  for (const id of EDGE_SEATED) {
    const camera = { yawDeg: raw(id).camera.yaw_deg }
    for (const rotation of ROTATIONS) {
      const spec = LAYERED_FURNITURE_SPECS[id]!.rotations[LAYERED_ROTATION_INDEX[rotation]]
      const piece = onCell(id, 8, 8, rotation)
      assert.deepEqual(piece.seatWorldPoints!.map((seat) => seat.id), ["s0", "s1"], `${id} ${rotation}: seat ids kept`)
      for (const seat of spec.seats) {
        assert.ok(seatFacesCamera(seat.facingYawDeg, camera), `${id} ${rotation} ${seat.id}: faces away`)
        // the hip is on the edge she faces out of, so that edge is the one toward the camera
        const yaw = (seat.facingYawDeg * Math.PI) / 180
        const out = seat.hipWorld[0] * Math.sin(yaw) + seat.hipWorld[2] * Math.cos(yaw)
        assert.ok(out > 0, `${id} ${rotation} ${seat.id}: on the far edge`)
        assert.ok(seat.cardSplit, `${id} ${rotation} ${seat.id}: her shins hang in front of the edge`)
      }
      for (const art of piece.layered25d!.seats) assert.equal(art.view, "front", `${id} ${rotation} ${art.id}: back view`)
      for (const point of piece.seatWorldPoints!) assert.notEqual(point.facing, "back", `${id} ${rotation} ${point.id}`)
      for (const hotspot of createRoomWorldHotspotsFromRoomV2Scene({ shell: SHELL, renderItems: [piece] })) {
        assert.ok(canWalk(piece, hotspot.approachPoint!), `${id} ${rotation} ${hotspot.seatId}: unreachable`)
      }
    }
  }
})

test("a chair, armchair or sofa turned away is sat on facing the way it is turned", () => {
  const others = SEATED_IDS.filter((id) => !EDGE_SEATED.includes(id))
  assert.ok(others.includes("room_v3_armchair_japon_cream") && others.includes("room_v3_sofa_japon_cream"))
  for (const id of others) {
    const item = raw(id)
    for (const rotation of ROTATIONS) {
      const r = LAYERED_ROTATION_INDEX[rotation]
      const drawn = item.rotations[String(r)]!.seats.filter((seat) => seat.pose === undefined || seat.pose === "sit_chair")
      const seats = LAYERED_FURNITURE_SPECS[id]!.rotations[r].seats
      assert.deepEqual(
        seats.map((seat) => [seat.facingYawDeg, seat.avatarView]),
        drawn.map((seat) => [seat.facing_yaw_deg, seat.avatar_view]),
        `${id} ${rotation}`
      )
      for (const seat of seats) {
        const away = !seatFacesCamera(seat.facingYawDeg, { yawDeg: item.camera.yaw_deg })
        assert.equal(seat.avatarView.startsWith("back"), away, `${id} ${rotation} ${seat.id}: view does not follow its facing`)
      }
    }
  }
})

test("every seat's hip is drawn where the item's camera puts its hip point, the moved bed seats too", () => {
  for (const id of SEATED_IDS) {
    const item = raw(id)
    const camera = { yawDeg: item.camera.yaw_deg, pitchDeg: item.camera.pitch_deg, pxPerWorldUnit: item.px_per_world_unit }
    for (const r of [0, 1, 2, 3] as const) {
      const rotation = LAYERED_FURNITURE_SPECS[id]!.rotations[r]
      for (const seat of rotation.seats) {
        const [dx, dy] = projectWorldOffsetToSpritePx(seat.hipWorld, camera)
        assert.ok(Math.abs(rotation.anchorPx[0] + dx - seat.hipPx[0]) < 0.1, `${id} r${r} ${seat.id} x`)
        assert.ok(Math.abs(rotation.anchorPx[1] + dy - seat.hipPx[1]) < 0.1, `${id} r${r} ${seat.id} y`)
      }
    }
  }
})
