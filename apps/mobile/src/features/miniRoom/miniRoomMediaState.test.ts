import assert from "node:assert/strict"
import test from "node:test"
import { createInitialMiniRoomMediaState } from "./miniRoomMediaState"

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
