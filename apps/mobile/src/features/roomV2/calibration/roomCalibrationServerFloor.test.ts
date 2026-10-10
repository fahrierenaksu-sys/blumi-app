import test from "node:test"
import assert from "node:assert/strict"
import { isMiniRoomSeatTargetNearFloor, isPointOnMiniRoomFloor } from "@blumi/domain"
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
