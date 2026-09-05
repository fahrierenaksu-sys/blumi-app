import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomSetupStageHeight,
  getRoomSetupTaskCardMinHeight,
  ROOM_SETUP_TASK_CARD_MIN_HEIGHT
} from "./roomSetupLayoutModel"

test("keeps the room and avatar confirmation sheets on one shared visual rhythm", () => {
  assert.equal(getRoomSetupStageHeight(true, 852), 392)
  assert.equal(getRoomSetupStageHeight(false, 956), 468)
})

test("keeps the first room task compact enough to clear the shared action dock", () => {
  assert.equal(getRoomSetupTaskCardMinHeight(false), 172)
  assert.equal(getRoomSetupTaskCardMinHeight(true), 152)
  assert.ok(ROOM_SETUP_TASK_CARD_MIN_HEIGHT.regular > ROOM_SETUP_TASK_CARD_MIN_HEIGHT.compact)
})

test("releases reserved guidance space after the bed is placed", () => {
  assert.equal(getRoomSetupTaskCardMinHeight(false, true), 148)
  assert.equal(getRoomSetupTaskCardMinHeight(true, true), 132)
  assert.ok(
    getRoomSetupTaskCardMinHeight(false) >
      getRoomSetupTaskCardMinHeight(false, true)
  )
})
