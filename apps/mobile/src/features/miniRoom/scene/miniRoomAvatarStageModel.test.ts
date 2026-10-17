import assert from "node:assert/strict"
import test from "node:test"
import {
  resolveMiniRoomAvatarAnchorOffset,
  resolveMiniRoomCameraTransform,
  MINI_ROOM_SPEECH_BOTTOM_PX,
  MINI_ROOM_SPEECH_RAISE_PX,
  resolveMiniRoomSpeechBottomPx
} from "./miniRoomAvatarStageModel"
import { resolveMiniRoomLayout } from "./miniRoomLayout"

test("an avatar's anchor moves by transform in room pixels", () => {
  assert.deepEqual(
    resolveMiniRoomAvatarAnchorOffset({ x: 0.25, y: 0.5 }, { width: 400, height: 300 }),
    { translateX: 100, translateY: 150 }
  )
})

test("the keyboard frames the room by transform: the typing camera is the resting one, scaled and moved", () => {
  const base = {
    windowWidth: 402, windowHeight: 874, safeTop: 62, safeBottom: 34,
    chatExpanded: true, fontScale: 1, roomAspectRatio: 1.25
  }
  const rest = resolveMiniRoomLayout({ ...base, keyboardVisible: false, keyboardInset: 0 }).camera
  const typing = resolveMiniRoomLayout({ ...base, keyboardVisible: true, keyboardInset: 336 }).camera
  const transform = resolveMiniRoomCameraTransform(rest, typing)
  // The transformed resting frame lands exactly on the typing frame.
  const width = rest.width * transform.scale
  const height = rest.height * transform.scale
  const centreX = rest.left + rest.width / 2 + transform.translateX
  const centreY = rest.top + rest.height / 2 + transform.translateY
  assert.ok(Math.abs(width - typing.width) < 1e-9)
  assert.ok(Math.abs(height - typing.height) < 1.5, "rounding of the layout only")
  assert.ok(Math.abs(centreX - (typing.left + typing.width / 2)) < 1e-9)
  assert.ok(Math.abs(centreY - (typing.top + typing.height / 2)) < 1e-9)
  assert.deepEqual(resolveMiniRoomCameraTransform(rest, rest), { translateX: 0, translateY: 0, scale: 1 })
})

test("a 2.5D figure's speech sits just above her head, not at the old box height", () => {
  const bottom = resolveMiniRoomSpeechBottomPx({ footFromBottomPx: 12, figureHeightPx: 72, raised: false })
  assert.ok(bottom > 12 + 72, "the bubble clears her head")
  assert.ok(bottom <= 12 + 72 + 12, "the bubble stays close to her head")
  assert.ok(bottom < MINI_ROOM_SPEECH_BOTTOM_PX)
})

test("speech keeps the old height without a measured figure and never rises above it", () => {
  assert.equal(resolveMiniRoomSpeechBottomPx({ footFromBottomPx: 12, raised: false }), MINI_ROOM_SPEECH_BOTTOM_PX)
  assert.equal(resolveMiniRoomSpeechBottomPx({ footFromBottomPx: 12, figureHeightPx: 400, raised: false }), MINI_ROOM_SPEECH_BOTTOM_PX)
})

test("a raised stack sits one step above the plain one", () => {
  const plain = resolveMiniRoomSpeechBottomPx({ footFromBottomPx: 12, figureHeightPx: 72, raised: false })
  const raised = resolveMiniRoomSpeechBottomPx({ footFromBottomPx: 12, figureHeightPx: 72, raised: true })
  assert.equal(raised - plain, MINI_ROOM_SPEECH_RAISE_PX)
})
