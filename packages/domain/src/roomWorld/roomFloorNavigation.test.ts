import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_BLUMI_WORLD_CANVAS,
  ROOM_BLUMI_WORLD_FLOOR_GRID,
  createRoomFloorHomography,
  projectRoomFloorUnitPoint,
  unprojectRoomFloorPoint
} from "./roomFloorGrid"
import {
  getRoomWorldWalkableNodes,
  resolveRoomWorldNearestWalkablePoint
} from "./roomFloorNavigation"
import {
  createRoomWorldFloorGeometry,
  isRoomWorldPointWalkable,
  isRoomWorldSegmentClear,
  pointInRoomWorldPolygon,
  resolveRoomWorldPath,
  type RoomWorldBlocker,
  type RoomWorldGeometry,
  type RoomWorldPoint
} from "./roomWorldGeometry"
import { getMiniRoomFloorDistance, isPointOnMiniRoomFloor, MINI_ROOM_FLOOR } from "./miniRoomFloor"

const CLEARANCE = 0.012
const FLOOR = createRoomWorldFloorGeometry(ROOM_BLUMI_WORLD_FLOOR_GRID, ROOM_BLUMI_WORLD_CANVAS)
const COFFEE_TABLE: RoomWorldBlocker = {
  id: "coffee_table",
  x: 0.5,
  y: 0.72,
  width: 0.16,
  height: 0.06,
  anchor: { x: 0.5, y: 1 },
  blocksMovement: true
}
const ROOM: RoomWorldGeometry = { ...FLOOR, blockers: [COFFEE_TABLE] }
const ASPECT = ROOM_BLUMI_WORLD_CANVAS.height / ROOM_BLUMI_WORLD_CANVAS.width

/** Floor distance between two stage points, in canvas widths. */
function floorDistance(a: RoomWorldPoint, b: RoomWorldPoint): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) * ASPECT)
}

function walkPoints(from: RoomWorldPoint, path: readonly RoomWorldPoint[]): RoomWorldPoint[] {
  const points: RoomWorldPoint[] = []
  let start = from
  for (const end of path) {
    for (let step = 0; step <= 200; step += 1) {
      points.push({ x: start.x + (end.x - start.x) * step / 200, y: start.y + (end.y - start.y) * step / 200 })
    }
    start = end
  }
  return points
}

test("the floor homography's inverse is exact across the whole lattice", () => {
  const homography = createRoomFloorHomography(ROOM_BLUMI_WORLD_FLOOR_GRID.latticeCorners)
  for (let u = -0.2; u <= 1.2; u += 0.1) {
    for (let v = -0.2; v <= 1.2; v += 0.1) {
      const stage = projectRoomFloorUnitPoint(homography, u, v)
      const back = unprojectRoomFloorPoint(homography, stage.x, stage.y)
      assert.ok(Math.abs(back.u - u) < 1e-9 && Math.abs(back.v - v) < 1e-9)
    }
  }
})

test("the whole drawn floor is walkable, not only the old walk polygon", () => {
  // Left and right corners and the front bay lie outside MINI_ROOM_FLOOR.
  for (const point of [{ x: 0.1, y: 0.665 }, { x: 0.9, y: 0.665 }, { x: 0.49, y: 0.91 }]) {
    assert.equal(pointInRoomWorldPolygon(point, MINI_ROOM_FLOOR), false)
    assert.equal(isRoomWorldPointWalkable(FLOOR, point, { clearance: CLEARANCE }), true)
    // A tap there walks exactly there.
    assert.deepEqual(resolveRoomWorldNearestWalkablePoint({ geometry: FLOOR, target: point, clearance: CLEARANCE }), point)
  }
  // The feet keep off the floor's lip.
  assert.equal(isRoomWorldPointWalkable(FLOOR, ROOM_BLUMI_WORLD_FLOOR_GRID.outline[3]!, { clearance: CLEARANCE }), false)
})

test("a tap on a footprint walks to the free spot right next to it, not across the room", () => {
  const from = { x: 0.3, y: 0.8 }
  for (const tap of [{ x: 0.5, y: 0.7 }, { x: 0.43, y: 0.69 }, { x: 0.57, y: 0.715 }, { x: 0.5, y: 0.725 }]) {
    const target = resolveRoomWorldNearestWalkablePoint({ geometry: ROOM, target: tap, clearance: CLEARANCE, from })
    assert.ok(target)
    assert.equal(isRoomWorldPointWalkable(ROOM, target, { clearance: CLEARANCE }), true)
    // Next to the footprint: no farther than to its nearest edge plus the clearance.
    const toEdge = Math.min(
      Math.abs(tap.x - 0.42), Math.abs(0.58 - tap.x),
      Math.abs(tap.y - 0.66) * ASPECT, Math.abs(0.72 - tap.y) * ASPECT
    )
    assert.ok(floorDistance(tap, target) <= toEdge + CLEARANCE + 1e-3,
      `tap ${JSON.stringify(tap)} -> ${JSON.stringify(target)}`)
  }
})

test("a tap off the floor walks to the floor edge nearest the finger", () => {
  const wallTap = { x: 0.3, y: 0.45 }
  const target = resolveRoomWorldNearestWalkablePoint({ geometry: FLOOR, target: wallTap, clearance: CLEARANCE })
  assert.ok(target)
  assert.equal(isRoomWorldPointWalkable(FLOOR, target, { clearance: CLEARANCE }), true)
  assert.ok(floorDistance(wallTap, target) < 0.07, JSON.stringify(target))
})

test("A* walks around a footprint and never crosses its clearance", () => {
  const from = { x: 0.5, y: 0.6 }
  const to = { x: 0.5, y: 0.82 }
  assert.equal(isRoomWorldSegmentClear({ geometry: ROOM, from, to, clearance: CLEARANCE }), false)
  const path = resolveRoomWorldPath({ geometry: ROOM, from, to, clearance: CLEARANCE })
  assert.ok(path)
  assert.deepEqual(path.at(-1), to)
  assert.ok(path.length >= 2)
  for (const point of walkPoints(from, path)) {
    assert.equal(isRoomWorldPointWalkable(ROOM, point, { clearance: CLEARANCE * 0.99 }), true, JSON.stringify(point))
  }
  // Smoothed: no more corners than going around one side of the table needs.
  assert.ok(path.length <= 4, `${path.length} points`)
})

test("a thin footprint is never cut through (the old path sampled 13 points per segment)", () => {
  const rail: RoomWorldBlocker = { id: "rail", x: 0.5, y: 0.7, width: 0.5, height: 0.004, anchor: { x: 0.5, y: 0.5 } }
  const geometry = { ...FLOOR, blockers: [rail] }
  assert.equal(isRoomWorldSegmentClear({ geometry, from: { x: 0.31, y: 0.6 }, to: { x: 0.69, y: 0.8 }, clearance: 0 }), false)
})

test("paths are deterministic: the same input plans the same walk on every phone", () => {
  const plan = () => resolveRoomWorldPath({
    geometry: { ...FLOOR, blockers: [{ ...COFFEE_TABLE }] },
    from: { x: 0.2, y: 0.66 },
    to: { x: 0.62, y: 0.8 },
    clearance: CLEARANCE
  })
  const first = plan()
  assert.ok(first)
  for (let run = 0; run < 5; run += 1) assert.deepEqual(plan(), first)
})

test("an unreachable or blocked target has no path", () => {
  assert.equal(resolveRoomWorldPath({ geometry: ROOM, from: { x: 0.3, y: 0.8 }, to: { x: 0.5, y: 0.7 }, clearance: CLEARANCE }), null)
  const walls: RoomWorldBlocker[] = [
    { id: "a", x: 0.6, y: 0.7, width: 0.01, height: 0.4, anchor: { x: 0.5, y: 0.5 } }
  ]
  // A full-height wall splits the floor: the far side is unreachable.
  const split = { ...FLOOR, blockers: walls }
  assert.equal(resolveRoomWorldPath({ geometry: split, from: { x: 0.4, y: 0.7 }, to: { x: 0.8, y: 0.68 }, clearance: CLEARANCE }), null)
  const reachable = resolveRoomWorldNearestWalkablePoint({
    geometry: split, target: { x: 0.8, y: 0.68 }, clearance: CLEARANCE, from: { x: 0.4, y: 0.7 }
  })
  assert.ok(reachable && reachable.x < 0.6)
})

test("a walk can leave a spot that stopped being walkable (furniture placed under the avatar)", () => {
  const path = resolveRoomWorldPath({ geometry: ROOM, from: { x: 0.5, y: 0.7 }, to: { x: 0.5, y: 0.82 }, clearance: CLEARANCE })
  assert.ok(path)
})

test("the server accepts every point the client may walk to", () => {
  for (const node of getRoomWorldWalkableNodes(FLOOR, CLEARANCE)) {
    assert.equal(isPointOnMiniRoomFloor(node), true, JSON.stringify(node))
  }
  // Older clients' targets stay valid.
  for (const point of MINI_ROOM_FLOOR) assert.equal(getMiniRoomFloorDistance(point), 0)
  assert.equal(isPointOnMiniRoomFloor({ x: 0.5, y: 0.2 }), false)
})
