import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_SETUP_CHARACTER_MOTION,
  getRoomSetupAvatarMotionState
} from "./roomSetupCharacterMotionModel"

test("room setup uses only production-backed avatar states", () => {
  assert.equal(getRoomSetupAvatarMotionState("entering"), "walking")
  assert.equal(getRoomSetupAvatarMotionState("idle"), "idle")
  assert.equal(getRoomSetupAvatarMotionState("reacting"), "walking")
})

test("room setup character cues stay brief and never block the task", () => {
  assert.equal(ROOM_SETUP_CHARACTER_MOTION.entranceDurationMs, 920)
  assert.equal(ROOM_SETUP_CHARACTER_MOTION.reactionDurationMs, 1_100)
  assert.ok(ROOM_SETUP_CHARACTER_MOTION.ambientIntervalMs >= 4_800)
  assert.ok(ROOM_SETUP_CHARACTER_MOTION.ambientIntervalMs <= 6_400)
  assert.ok(
    ROOM_SETUP_CHARACTER_MOTION.ambientCueDurationMs <
      ROOM_SETUP_CHARACTER_MOTION.ambientIntervalMs
  )
})
