import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
  ROOM_WORLD_AVATAR_PERSONAL_SPACE_RADIUS
} from "../../roomWorld/roomWorldRuntime"
import { MINI_ROOM_REFUSED_SEAT_SIDE_OFFSET, resolveMiniRoomRefusedSeatStand } from "./miniRoomSeatRefusalModel"

const floor = { walkableAreas: [{ id: "floor", points: [
  { x: .1, y: .4 }, { x: .9, y: .4 }, { x: .9, y: .95 }, { x: .1, y: .95 }
] }] }
const seat = { x: .5, y: .57 }
const approach = { x: .5, y: .67 }

test("a refused sitter waits beside the approach point, out of the seat's exit lane, facing the seat", () => {
  const stand = resolveMiniRoomRefusedSeatStand({ geometry: floor, seat, approach })
  assert.ok(Math.abs(stand.point.x - .5) >= ROOM_WORLD_AVATAR_PERSONAL_SPACE_RADIUS + ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
    "the seat→approach→exit line stays clear for the sitter to stand up")
  assert.ok(Math.abs(stand.point.y - approach.y) < 1e-9)
  assert.ok(Math.abs(Math.abs(stand.point.x - approach.x) - MINI_ROOM_REFUSED_SEAT_SIDE_OFFSET) < 1e-9)
  assert.equal(stand.facing, stand.point.x < seat.x ? "right" : "left")
})

test("the stand point is deterministic and takes the other side when one side is blocked", () => {
  const first = resolveMiniRoomRefusedSeatStand({ geometry: floor, seat, approach })
  assert.deepEqual(resolveMiniRoomRefusedSeatStand({ geometry: floor, seat, approach }), first)
  const blocked = { ...floor, blockers: [{ id: "wardrobe", x: first.point.x, y: first.point.y + .02, width: .06, height: .06, blocksMovement: true }] }
  const other = resolveMiniRoomRefusedSeatStand({ geometry: blocked, seat, approach })
  assert.ok(Math.sign(other.point.x - .5) !== Math.sign(first.point.x - .5))
})

test("a seat without an approach point still yields a walkable spot beside it", () => {
  const stand = resolveMiniRoomRefusedSeatStand({ geometry: floor, seat: { x: .5, y: .7 } })
  assert.ok(Math.abs(stand.point.x - .5) > 0.1)
  assert.equal(stand.point.y, .7)
})
