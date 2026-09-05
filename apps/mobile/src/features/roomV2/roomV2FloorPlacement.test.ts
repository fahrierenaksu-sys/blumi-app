import assert from "node:assert/strict"
import test from "node:test"
import { pointInRoomWorldPolygon } from "../roomWorld/roomWorldGeometry"
import {
  clampRoomV2FloorFootprintToPolygon,
  isRoomV2FloorFootprintInsidePolygon
} from "./roomV2FloorPlacement"

const ROOM_FLOOR = [
  { x: 0.48, y: 0.42 },
  { x: 0.8, y: 0.55 },
  { x: 0.83, y: 0.72 },
  { x: 0.7, y: 0.9 },
  { x: 0.3, y: 0.9 },
  { x: 0.17, y: 0.72 },
  { x: 0.2, y: 0.55 }
]

test("a bed dragged into a room corner snaps to the nearest fully valid floor point", () => {
  const footprint = { width: 0.13, height: 0.065 }
  const anchor = { x: 0.5, y: 0.85 }
  const result = clampRoomV2FloorFootprintToPolygon({
    point: { x: 0.18, y: 0.55 },
    polygon: ROOM_FLOOR,
    footprint,
    anchor
  })
  const minX = result.x - footprint.width * anchor.x
  const maxX = minX + footprint.width
  const minY = result.y - footprint.height * anchor.y
  const maxY = minY + footprint.height

  assert.ok([
    result,
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY }
  ].every((point) => pointInRoomWorldPolygon(point, ROOM_FLOOR)))
  assert.ok(result.x < 0.3, "bed should remain close to the requested corner")
})

test("an already valid floor placement does not drift toward the center", () => {
  const result = clampRoomV2FloorFootprintToPolygon({
    point: { x: 0.5, y: 0.7 },
    polygon: ROOM_FLOOR,
    footprint: { width: 0.13, height: 0.065 },
    anchor: { x: 0.5, y: 0.85 }
  })

  assert.deepEqual(result, { x: 0.5, y: 0.7 })
})

test("a concave floor notch cannot pass through the middle of a footprint", () => {
  const concaveFloor = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0.6, y: 1 },
    { x: 0.6, y: 0.4 },
    { x: 0.4, y: 0.4 },
    { x: 0.4, y: 1 },
    { x: 0, y: 1 }
  ]
  const input = {
    point: { x: 0.5, y: 0.75 },
    polygon: concaveFloor,
    footprint: { width: 0.4, height: 0.2 },
    anchor: { x: 0.5, y: 0.5 }
  }

  assert.equal(isRoomV2FloorFootprintInsidePolygon(input), false)
  const result = clampRoomV2FloorFootprintToPolygon(input)
  assert.notDeepEqual(result, input.point)
  assert.equal(isRoomV2FloorFootprintInsidePolygon({
    ...input,
    point: result
  }), true)
})
