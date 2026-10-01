import assert from "node:assert/strict"
import test from "node:test"
import {
  getMiniRoomAvatarZIndex,
  resolveMiniRoomAvatarAnchorOffset,
  resolveMiniRoomAvatarDepthOrder,
  resolveMiniRoomCameraTransform
} from "./miniRoomAvatarStageModel"
import { resolveMiniRoomLayout } from "./miniRoomLayout"

test("draw order changes only when one avatar passes the other in depth (was every frame)", () => {
  const orders: string[] = []
  let previous: string | null = null
  // Partner walks from behind the local avatar to in front of it, frame by frame.
  for (let frame = 0; frame <= 60; frame += 1) {
    const order = resolveMiniRoomAvatarDepthOrder([
      { id: "local", y: 0.7 },
      { id: "partner", y: 0.55 + frame * 0.005 }
    ])
    if (order !== previous) orders.push(order)
    previous = order
  }
  assert.deepEqual(orders, ["partner|local", "local|partner"], "one flip, so one React update for 61 frames")
  assert.equal(getMiniRoomAvatarZIndex("partner|local", "local"), 2)
  assert.equal(getMiniRoomAvatarZIndex("partner|local", "partner"), 1)
  assert.equal(resolveMiniRoomAvatarDepthOrder([{ id: "b", y: 0.5 }, { id: "a", y: 0.5 }]), "a|b", "ties agree on both phones")
})

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
