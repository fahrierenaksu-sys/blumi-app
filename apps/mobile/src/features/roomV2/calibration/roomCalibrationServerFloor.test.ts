import test from "node:test"
import assert from "node:assert/strict"
import { isMiniRoomSeatTargetNearFloor, isPointOnMiniRoomFloor, ROOM_BLUMI_WORLD_FLOOR_GRID } from "@blumi/domain"
import { validateRoomV2FurniturePlacement, resolvePlacedFurnitureRenderItem } from "../roomV2Selectors"
import type { RoomFurnitureRotation, RoomShell } from "../roomV2.types"
import { createRoomAvatar25dRoomCalibration } from "./roomAvatar25dRoomCalibration"
import { calibrateRoomShell } from "./roomCalibrationScene"
import { LAYERED_FURNITURE_SPECS, type LayeredFurnitureAssets } from "../furniture/layeredFurniture"
import { createRoomAvatar25dFurnitureCatalog } from "../furniture/layeredFurnitureCatalog"
import {
  floorToStageFraction,
  isPointInFloorPolygon,
  ROOM_CALIBRATION,
  type FloorPoint,
  type RoomCalibration
} from "./roomCalibration"

// V17 (plan): every point My Room and MiniRoom may send as a walk or seat target must pass the server's floor rule
// (`miniRoomMotionService.move`), or the server silently drops the move and the partner never sees it. A calibration
// refresh that widens the walkable floor past the server floor fails here instead of in a two-phone room.
const SAMPLE_STEP = 0.02

function samplePolygon(polygon: readonly FloorPoint[]): FloorPoint[] {
  const xs = polygon.map((point) => point.x)
  const zs = polygon.map((point) => point.z)
  const inside: FloorPoint[] = []
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += SAMPLE_STEP) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += SAMPLE_STEP) {
      if (isPointInFloorPolygon({ x, z }, polygon)) inside.push({ x, z })
    }
  }
  // Taps outside the floor snap onto its edge, so the edges and corners are targets too.
  const edges = polygon.flatMap((from, index) => {
    const to = polygon[(index + 1) % polygon.length]!
    return Array.from({ length: 20 }, (_, step) => ({
      x: from.x + ((to.x - from.x) * step) / 20,
      z: from.z + ((to.z - from.z) * step) / 20
    }))
  })
  return [...inside, ...edges]
}

function rejectedTargets(
  c: RoomCalibration,
  polygon: readonly FloorPoint[],
  isAccepted: (point: { x: number; y: number }) => boolean
): FloorPoint[] {
  return samplePolygon(polygon).filter((point) => !isAccepted(floorToStageFraction(c, point)))
}

test("the server accepts every walk target on the calibrated walkable floor", () => {
  const points = samplePolygon(ROOM_CALIBRATION.walkablePolygon)
  assert.ok(points.length > 500, "the walkable floor is sampled densely")
  assert.deepEqual(rejectedTargets(ROOM_CALIBRATION, ROOM_CALIBRATION.walkablePolygon, isPointOnMiniRoomFloor), [])
})

test("the server accepts every seat target on the calibrated painted floor", () => {
  // A seat sits on a piece whose footprint stands on the painted floor, so every painted floor point is a
  // possible seat target and must lie within the server's seat tolerance.
  assert.deepEqual(
    rejectedTargets(ROOM_CALIBRATION, ROOM_CALIBRATION.floorPolygon, isMiniRoomSeatTargetNearFloor),
    []
  )
})

// MEDIUM-1 (fresh review): the seat half must use the real seat points. For every seat piece of the room catalog,
// placed validly anywhere on the floor in every rotation, each seat's hip point and its approach spot (what a seat
// claim carries, `miniRoomSceneStore` -> `seatPlan.target`) must pass the server's seat rule.
const SEAT_ROTATIONS: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
const PLACEMENT_STEP = ROOM_CALIBRATION.cell / 2

test("the server accepts every seat point of every seat piece placed anywhere on the floor", () => {
  const stand = (key: string) => ({ key, source: 0 as never })
  const assets = Object.fromEntries(Object.keys(LAYERED_FURNITURE_SPECS).map((id) => [id, Object.fromEntries(
    ([0, 1, 2, 3] as const).map((r) => [r, { back: stand(`${id}_${r}_b`), front: stand(`${id}_${r}_f`), shadow: stand(`${id}_${r}_s`) }])
  )])) as unknown as LayeredFurnitureAssets
  const calibration = createRoomAvatar25dRoomCalibration(assets)
  const shell = calibrateRoomShell({
    id: "room_v2_shell_blumi_world_v1",
    name: "Blumi Home",
    asset: stand("shell"),
    canvasSize: { width: 1254, height: 714 },
    floorGrid: ROOM_BLUMI_WORLD_FLOOR_GRID
  } satisfies RoomShell)
  const seatPieces = createRoomAvatar25dFurnitureCatalog(assets).filter((item) => item.interactionType === "seat")
  assert.ok(seatPieces.length >= 2, "the catalog has seat pieces")
  const xs = ROOM_CALIBRATION.floorPolygon.map((point) => point.x)
  const zs = ROOM_CALIBRATION.floorPolygon.map((point) => point.z)
  const rejected: string[] = []
  for (const item of seatPieces) {
    let checkedSeats = 0
    for (const rotation of SEAT_ROTATIONS) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += PLACEMENT_STEP) {
        for (let z = Math.min(...zs); z <= Math.max(...zs); z += PLACEMENT_STEP) {
          const at = floorToStageFraction(ROOM_CALIBRATION, { x, z })
          const plain = resolvePlacedFurnitureRenderItem({ instanceId: item.id, itemId: item.id, x: at.x, y: at.y, rotation }, item)
          if (!plain) continue
          const piece = calibration.calibrateFurnitureItem(plain)
          if (!validateRoomV2FurniturePlacement({ scene: { shell, renderItems: [] }, candidate: piece }).isValid) continue
          for (const seat of piece.seatWorldPoints ?? []) {
            checkedSeats += 1
            for (const [name, point] of [["seat", seat.seat], ["approach", seat.approach]] as const) {
              if (!isMiniRoomSeatTargetNearFloor(point)) {
                rejected.push(`${item.id} ${rotation} ${seat.id} ${name} (${point.x.toFixed(3)}, ${point.y.toFixed(3)})`)
              }
            }
          }
        }
      }
    }
    assert.ok(checkedSeats > 0, `${item.id}: placed validly with seats somewhere on the floor`)
  }
  assert.deepEqual(rejected.slice(0, 20), [], `${rejected.length} seat targets refused`)
})
