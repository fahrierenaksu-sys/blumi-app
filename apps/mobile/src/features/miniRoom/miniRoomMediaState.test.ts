import assert from "node:assert/strict"
import test from "node:test"
import { createTextOnlyMiniRoomMediaState } from "./miniRoomMediaState"

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
