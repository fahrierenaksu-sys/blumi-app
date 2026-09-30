import assert from "node:assert/strict"
import test from "node:test"
import { createInitialMiniRoomMediaState, createTextOnlyMiniRoomMediaState, isTextOnlyRoomMediaSession } from "./miniRoomMediaState"

test("text rooms remain connected with capture and playback off for legacy media URLs", () => {
  const roomInfo = {
    miniRoomId: "mini_room_123",
    livekitRoomName: "legacy-room",
    livekitUrl: "wss://livekit.example.test"
  }
  const state = createTextOnlyMiniRoomMediaState(roomInfo)
  assert.equal(state.connectionStatus, "connected")
  assert.deepEqual(state.localMedia, { micEnabled: false, speakerEnabled: false })
  assert.equal(state.errorMessage, null)
  assert.equal(state.connectAttemptedAt, null)
  assert.deepEqual(state.roomInfo, roomInfo)
})

test("Blumi Room starts with live voice muted until the user opts in", () => {
  const state = createInitialMiniRoomMediaState({
    miniRoomId: "mini_room_123",
    livekitRoomName: "blumi-room-123",
    livekitUrl: "wss://livekit.example.test"
  })

  assert.deepEqual(state.localMedia, {
    micEnabled: false,
    speakerEnabled: true
  })
})

test("placeholder LiveKit credentials keep a test room text-only", () => {
  assert.equal(isTextOnlyRoomMediaSession({
    livekitUrl: "wss://demo.livekit.invalid",
    token: "demo-token-"
  }), true)
  assert.equal(isTextOnlyRoomMediaSession({
    livekitUrl: "wss://livekit.example.test",
    token: "real-token"
  }), false)
})
