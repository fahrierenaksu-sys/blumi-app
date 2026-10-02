import assert from "node:assert/strict"
import test from "node:test"
import {
  resolveMiniRoomAvatarAnchorOffset,
  resolveMiniRoomCameraTransform
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
