import assert from "node:assert/strict"
import test from "node:test"
import {
  createMiniRoomSpeechQueue,
  dismissMiniRoomSpeech,
  enqueueMiniRoomSpeech,
  expireMiniRoomSpeech
} from "./miniRoomSpeechQueue"

test("speech queue preserves FIFO order and gives every item a fresh four seconds", () => {
  let state = createMiniRoomSpeechQueue()
  state = enqueueMiniRoomSpeech(state, { key: "one", speakerUserId: "a", body: "One" }, 1_000)
  state = enqueueMiniRoomSpeech(state, { key: "two", speakerUserId: "b", body: "Two" }, 2_000)

  assert.equal(state.active?.key, "one")
  assert.equal(state.active?.expiresAt, 5_000)
  assert.deepEqual(state.pending.map((entry) => entry.key), ["two"])

  state = expireMiniRoomSpeech(state, 4_999)
  assert.equal(state.active?.key, "one")
  state = expireMiniRoomSpeech(state, 5_000)
  assert.equal(state.active?.key, "two")
  assert.equal(state.active?.expiresAt, 9_000)
})

test("tap dismiss advances once and stale dismiss cannot skip the next bubble", () => {
  let state = createMiniRoomSpeechQueue()
  state = enqueueMiniRoomSpeech(state, { key: "one", speakerUserId: "a", body: "One" }, 1_000)
  state = enqueueMiniRoomSpeech(state, { key: "two", speakerUserId: "b", body: "Two" }, 1_100)

  state = dismissMiniRoomSpeech(state, "one", 2_000)
  assert.equal(state.active?.key, "two")
  assert.equal(state.active?.expiresAt, 6_000)

  state = dismissMiniRoomSpeech(state, "one", 2_100)
  assert.equal(state.active?.key, "two")
})
