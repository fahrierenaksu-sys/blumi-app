import assert from "node:assert/strict"
import test from "node:test"
import {
  createMiniRoomSpeechQueue,
  dismissMiniRoomSpeech,
  enqueueMiniRoomSpeech,
  expireMiniRoomSpeech
} from "./miniRoomSpeechQueue"

test("new speech replaces stale bubbles immediately with a fresh lifetime", () => {
  let state = createMiniRoomSpeechQueue()
  state = enqueueMiniRoomSpeech(state, { key: "one", speakerUserId: "a", body: "One" }, 1_000)
  state = enqueueMiniRoomSpeech(state, { key: "two", speakerUserId: "b", body: "Two" }, 2_000)

  assert.equal(state.active?.key, "two")
  assert.equal(state.active?.expiresAt, 6_000)
  assert.deepEqual(state.pending, [])

  state = expireMiniRoomSpeech(state, 4_999)
  assert.equal(state.active?.key, "two")
  state = expireMiniRoomSpeech(state, 6_000)
  assert.equal(state.active, undefined)
})

test("stale dismiss cannot remove the latest bubble", () => {
  let state = createMiniRoomSpeechQueue()
  state = enqueueMiniRoomSpeech(state, { key: "one", speakerUserId: "a", body: "One" }, 1_000)
  state = enqueueMiniRoomSpeech(state, { key: "two", speakerUserId: "b", body: "Two" }, 1_100)

  state = dismissMiniRoomSpeech(state, "one", 2_000)
  assert.equal(state.active?.key, "two")
  assert.equal(state.active?.expiresAt, 5_100)

  state = dismissMiniRoomSpeech(state, "one", 2_100)
  assert.equal(state.active?.key, "two")
  state = dismissMiniRoomSpeech(state, "two", 2_200)
  assert.equal(state.active, undefined)
})
