import assert from "node:assert/strict"
import test from "node:test"
import {
  doRoomWorldPolygonsOverlap,
  deriveRoomWorldFacing,
  getRoomWorldBlockerBounds,
  isRoomWorldPointInsideBlocker,
  isRoomWorldPointWalkable,
  isRoomWorldSegmentClear,
  omitRoomWorldBlockers,
  pointInRoomWorldPolygon,
  projectRoomWorldPointToPolygon,
  resolveRoomWorldPath,
  type RoomWorldGeometry
} from "./roomWorldGeometry"

const ROOM: RoomWorldGeometry = {
  walkableAreas: [{
    id: "floor",
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ]
  }],
  blockers: [{
    id: "table",
    x: 0.5,
    y: 0.6,
    width: 0.2,
    height: 0.16,
    anchor: { x: 0.5, y: 0.5 },
    blocksMovement: true
  }]
}

test("room world geometry keeps points, blockers, and clearance distinct", () => {
  const floor = ROOM.walkableAreas[0].points
  assert.equal(pointInRoomWorldPolygon({ x: 0.2, y: 0.2 }, floor), true)
  assert.equal(pointInRoomWorldPolygon({ x: 0, y: 0.2 }, floor), true)
  assert.equal(pointInRoomWorldPolygon({ x: 1.2, y: 0.2 }, floor), false)
  assert.deepEqual(projectRoomWorldPointToPolygon({ x: 1.2, y: 0.5 }, floor), {
    x: 1,
    y: 0.5
  })
  const bounds = getRoomWorldBlockerBounds(ROOM.blockers![0])
  assert.equal(bounds.minX, 0.4)
  assert.ok(Math.abs(bounds.maxX - 0.6) < Number.EPSILON)
  assert.equal(bounds.minY, 0.52)
  assert.equal(bounds.maxY, 0.68)
  assert.equal(isRoomWorldPointInsideBlocker({ x: 0.39, y: 0.6 }, ROOM.blockers![0]), false)
  assert.equal(isRoomWorldPointInsideBlocker(
    { x: 0.39, y: 0.6 },
    ROOM.blockers![0],
    { clearance: 0.02 }
  ), true)
  assert.equal(isRoomWorldPointWalkable(ROOM, { x: 0.2, y: 0.2 }), true)
  assert.equal(isRoomWorldPointWalkable(ROOM, { x: 0.5, y: 0.6 }), false)
  assert.equal(isRoomWorldPointWalkable(ROOM, { x: -0.1, y: 0.2 }), false)
})

test("room world geometry uses calibrated polygons instead of their rectangular bounds", () => {
  const diamond = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 }
  ]
  const distantDiamond = [
    { x: 0.6, y: 0.6 },
    { x: 1.6, y: 0.6 },
    { x: 0.6, y: 1.6 }
  ]
  assert.equal(doRoomWorldPolygonsOverlap(diamond, distantDiamond), false)
  assert.equal(doRoomWorldPolygonsOverlap(diamond, [
    { x: 0.1, y: 0.1 },
    { x: 1.1, y: 0.1 },
    { x: 0.1, y: 1.1 }
  ]), true)

  const polygonBlocker = {
    id: "diamond",
    x: 0.5,
    y: 0.5,
    width: 1,
    height: 1,
    polygon: diamond,
    blocksMovement: true
  }
  const bounds = getRoomWorldBlockerBounds(polygonBlocker)
  assert.deepEqual(bounds, {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1
  })
  assert.equal(isRoomWorldPointInsideBlocker({ x: 0.1, y: 0.1 }, polygonBlocker), true)
  assert.equal(isRoomWorldPointInsideBlocker({ x: 0.9, y: 0.9 }, polygonBlocker), false)
})

test("room world geometry omits only the requested blocker and finds a clear detour", () => {
  const withoutTable = omitRoomWorldBlockers(ROOM, ["table"])
  assert.notEqual(withoutTable, ROOM)
  assert.deepEqual(withoutTable.blockers, [])
  assert.deepEqual(omitRoomWorldBlockers(ROOM, []), ROOM)
  assert.equal(isRoomWorldSegmentClear({
    geometry: ROOM,
    from: { x: 0.2, y: 0.6 },
    to: { x: 0.8, y: 0.6 }
  }), false)
  assert.equal(isRoomWorldSegmentClear({
    geometry: withoutTable,
    from: { x: 0.2, y: 0.6 },
    to: { x: 0.8, y: 0.6 }
  }), true)
  const path = resolveRoomWorldPath({
    geometry: ROOM,
    from: { x: 0.2, y: 0.6 },
    to: { x: 0.8, y: 0.6 }
  })
  assert.ok(path)
  assert.deepEqual(path.at(-1), { x: 0.8, y: 0.6 })
  assert.ok(path.length > 1)
  assert.equal(resolveRoomWorldPath({
    geometry: ROOM,
    from: { x: 0.2, y: 0.2 },
    to: { x: 0.5, y: 0.6 }
  }), null)
})

test("room world facing follows the dominant movement axis", () => {
  assert.equal(deriveRoomWorldFacing({ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.3 }), "right")
  assert.equal(deriveRoomWorldFacing({ x: 0.8, y: 0.2 }, { x: 0.2, y: 0.3 }), "left")
  assert.equal(deriveRoomWorldFacing({ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.2 }), "back")
  assert.equal(deriveRoomWorldFacing({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }), "front")
})
