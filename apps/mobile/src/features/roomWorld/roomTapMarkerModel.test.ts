import assert from "node:assert/strict"
import test from "node:test"
import {
  INITIAL_ROOM_TAP_MARKER_STATE,
  reduceRoomTapMarker,
  type RoomTapMarkerEvent,
  type RoomTapMarkerState
} from "./roomTapMarkerModel"

function run(events: RoomTapMarkerEvent[], state: RoomTapMarkerState = INITIAL_ROOM_TAP_MARKER_STATE): RoomTapMarkerState {
  return events.reduce(reduceRoomTapMarker, state)
}

test("a marker shows the destination, fades when the avatar arrives, then is gone", () => {
  const walking = run([{ type: "walk_started", markerId: 1, point: { x: 0.3, y: 0.8 } }])
  assert.deepEqual(walking.marker, { id: 1, x: 0.3, y: 0.8, leaving: false })
  const arrived = reduceRoomTapMarker(walking, { type: "arrived", markerId: 1 })
  assert.equal(arrived.marker?.leaving, true)
  assert.equal(reduceRoomTapMarker(arrived, { type: "faded", markerId: 1 }).marker, null)
})

test("a new tap replaces the marker at once, and the old walk's arrival or fade cannot touch it", () => {
  const first = run([{ type: "walk_started", markerId: 1, point: { x: 0.3, y: 0.8 } }])
  const second = reduceRoomTapMarker(first, { type: "walk_started", markerId: 2, point: { x: 0.6, y: 0.7 } })
  assert.deepEqual(second.marker, { id: 2, x: 0.6, y: 0.7, leaving: false })
  assert.equal(reduceRoomTapMarker(second, { type: "arrived", markerId: 1 }), second)
  assert.equal(reduceRoomTapMarker(second, { type: "faded", markerId: 1 }), second)
})

test("every way a walk ends without arriving still takes its marker away", () => {
  // A pose (wave) stopping the walk, the room losing focus, the avatar re-placed, a failed plan.
  const walking = run([{ type: "walk_started", markerId: 1, point: { x: 0.2, y: 0.85 } }])
  const ended = reduceRoomTapMarker(walking, { type: "walk_ended" })
  assert.equal(ended.marker?.leaving, true)
  assert.equal(reduceRoomTapMarker(ended, { type: "faded", markerId: 1 }).marker, null)
  // Ending twice, or with nothing on the floor, is harmless.
  assert.equal(reduceRoomTapMarker(ended, { type: "walk_ended" }), ended)
  assert.equal(reduceRoomTapMarker(INITIAL_ROOM_TAP_MARKER_STATE, { type: "walk_ended" }), INITIAL_ROOM_TAP_MARKER_STATE)
})

test("a fade only removes a marker that is leaving (a new walk's marker never vanishes early)", () => {
  const walking = run([{ type: "walk_started", markerId: 1, point: { x: 0.2, y: 0.85 } }])
  assert.equal(reduceRoomTapMarker(walking, { type: "faded", markerId: 1 }), walking)
})
