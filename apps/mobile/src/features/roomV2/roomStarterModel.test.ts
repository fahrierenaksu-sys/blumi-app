import assert from "node:assert/strict"
import test from "node:test"
import {
  STARTER_ROOM_BED_DEFAULT_POINT,
  STARTER_ROOM_BED_ITEM_ID,
  createStarterRoomDecor,
  hasPlacedStarterBed,
  placeStarterBed,
  rotateStarterBed
} from "./roomStarterModel"

test("onboarding starts with one standard empty room", () => {
  const decor = createStarterRoomDecor("room-shell")

  assert.equal(decor.roomShellId, "room-shell")
  assert.deepEqual(decor.placedItems, [])
})

test("the user can place the granted bed at the chosen point", () => {
  const empty = createStarterRoomDecor("room-shell")
  const decor = placeStarterBed(empty, { x: 0.62, y: 0.72 })

  assert.deepEqual(decor.placedItems, [{
    instanceId: "starter-room-bed",
    itemId: STARTER_ROOM_BED_ITEM_ID,
    x: 0.62,
    y: 0.72,
    rotation: "front"
  }])
  assert.equal(hasPlacedStarterBed(decor), true)
  assert.deepEqual(empty.placedItems, [])
})

test("starter room decor returns fresh immutable placement objects", () => {
  const first = createStarterRoomDecor("room-shell")
  const second = createStarterRoomDecor("room-shell")

  assert.notEqual(first, second)
  assert.notEqual(first.placedItems, second.placedItems)
  assert.deepEqual(first.placedItems, [])
  assert.deepEqual(second.placedItems, [])
})

test("the starter bed rotates clockwise through every authored direction", () => {
  const placed = placeStarterBed(
    createStarterRoomDecor("room-shell"),
    STARTER_ROOM_BED_DEFAULT_POINT
  )

  const right = rotateStarterBed(placed)
  const back = rotateStarterBed(right)
  const left = rotateStarterBed(back)
  const front = rotateStarterBed(left)

  assert.equal(right.placedItems[0]?.rotation, "right")
  assert.equal(back.placedItems[0]?.rotation, "back")
  assert.equal(left.placedItems[0]?.rotation, "left")
  assert.equal(front.placedItems[0]?.rotation, "front")
  assert.equal(placed.placedItems[0]?.rotation, "front")
})

test("rotating the starter bed preserves unrelated room items", () => {
  const placed = placeStarterBed(
    createStarterRoomDecor("room-shell"),
    STARTER_ROOM_BED_DEFAULT_POINT
  )
  const table = {
    instanceId: "table-1",
    itemId: "room_v2_table",
    x: 0.4,
    y: 0.6,
    rotation: "front" as const
  }
  const rotated = rotateStarterBed({
    ...placed,
    placedItems: [table, ...placed.placedItems]
  })

  assert.deepEqual(rotated.placedItems[0], table)
  assert.equal(rotated.placedItems[1]?.rotation, "right")
  assert.notEqual(rotated.placedItems[0], table)
})
test("starter readiness requires exactly one placed bed", () => {
  const empty = createStarterRoomDecor("room-shell")
  const placed = placeStarterBed(empty, { x: 0.62, y: 0.72 })

  assert.equal(hasPlacedStarterBed(empty), false)
  assert.equal(hasPlacedStarterBed(placed), true)
  assert.equal(hasPlacedStarterBed({
    ...placed,
    placedItems: [...placed.placedItems, { ...placed.placedItems[0], instanceId: "duplicate" }]
  }), false)
})
