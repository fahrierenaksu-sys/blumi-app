import assert from "node:assert/strict"
import test from "node:test"
import {
  createRoomWorldFloorGeometry,
  isRoomWorldPointWalkable
} from "./roomWorldGeometry"
import { ROOM_BLUMI_WORLD_CANVAS, ROOM_BLUMI_WORLD_FLOOR_GRID } from "../../../../../packages/domain/src/roomWorld/roomFloorGrid"
import { insetRoomWorldBackWalls } from "./roomWorldWallInset"

const floor = { ...createRoomWorldFloorGeometry(ROOM_BLUMI_WORLD_FLOOR_GRID, ROOM_BLUMI_WORLD_CANVAS), blockers: [] }

test("feet stay off the back walls: a spot just in front of the skirting is no longer a destination", () => {
  const inset = insetRoomWorldBackWalls(floor, 0.035)
  // just below the back corner and just inside the left back wall: walkable before, not after
  for (const point of [{ x: 0.478, y: 0.43 }, { x: 0.25, y: 0.56 }, { x: 0.72, y: 0.575 }]) {
    assert.ok(isRoomWorldPointWalkable(floor, point), `before ${JSON.stringify(point)}`)
    assert.ok(!isRoomWorldPointWalkable(inset, point), `after ${JSON.stringify(point)}`)
  }
  // the middle of the room, the spawn by the front lip and the front bay keep working
  for (const point of [{ x: 0.47, y: 0.65 }, { x: 0.47, y: 0.84 }, { x: 0.49, y: 0.9 }]) {
    assert.equal(isRoomWorldPointWalkable(inset, point), isRoomWorldPointWalkable(floor, point), JSON.stringify(point))
  }
  // only the back corner and its two neighbours move; the corner moves down toward the room
  const before = floor.walkableAreas[0]!.points, after = inset.walkableAreas[0]!.points
  const moved = after.map((p, i) => p.x !== before[i]!.x || p.y !== before[i]!.y)
  assert.equal(moved.filter(Boolean).length, 3)
  assert.ok(after[0]!.y > before[0]!.y)
  assert.equal(insetRoomWorldBackWalls(floor, 0), floor)
})
