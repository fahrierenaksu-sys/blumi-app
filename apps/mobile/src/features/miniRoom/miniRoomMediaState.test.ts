import assert from "node:assert/strict"
import test from "node:test"
import { createInitialMiniRoomMediaState, isTextOnlyRoomMediaSession } from "./miniRoomMediaState"

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
