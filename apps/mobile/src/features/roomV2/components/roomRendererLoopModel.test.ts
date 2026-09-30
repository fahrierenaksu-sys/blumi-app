import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomRendererAvatarLoops,
  shouldRunRoomRendererMarkerPulse
} from "./roomRendererLoopModel"

const idle = {
  isAvatar: true,
  state: "idle",
  usesAnimatedAssets: false,
  usesRuntimeLocomotion: false,
  usesRuntimeGesture: false,
  reduceMotion: false,
  paused: false
}

test("a focused room keeps today's loops, including walking under Reduce Motion", () => {
  assert.deepEqual(getRoomRendererAvatarLoops(idle), { breathe: true, walk: false, gesture: false })
  assert.deepEqual(getRoomRendererAvatarLoops({ ...idle, usesAnimatedAssets: true }), { breathe: false, walk: false, gesture: false })
  assert.deepEqual(getRoomRendererAvatarLoops({ ...idle, reduceMotion: true }), { breathe: false, walk: false, gesture: false })
  const walking = { ...idle, state: "walking", usesRuntimeLocomotion: true }
  assert.deepEqual(getRoomRendererAvatarLoops(walking), { breathe: false, walk: true, gesture: false })
  // The walk bob never honoured Reduce Motion; that stays as it was.
  assert.deepEqual(getRoomRendererAvatarLoops({ ...walking, reduceMotion: true }), { breathe: false, walk: true, gesture: false })
  const dancing = { ...idle, state: "dancing", usesRuntimeGesture: true }
  assert.deepEqual(getRoomRendererAvatarLoops(dancing), { breathe: false, walk: false, gesture: true })
  assert.deepEqual(getRoomRendererAvatarLoops({ ...dancing, reduceMotion: true }), { breathe: false, walk: false, gesture: false })
  assert.deepEqual(getRoomRendererAvatarLoops({ ...idle, isAvatar: false }), { breathe: false, walk: false, gesture: false })
})

test("an unfocused room runs no idle loop", () => {
  for (const input of [
    idle,
    { ...idle, state: "walking", usesRuntimeLocomotion: true },
    { ...idle, state: "waving", usesRuntimeGesture: true }
  ]) {
    assert.deepEqual(getRoomRendererAvatarLoops({ ...input, paused: true }), { breathe: false, walk: false, gesture: false })
  }
  assert.equal(shouldRunRoomRendererMarkerPulse({ reduceMotion: false, paused: false }), true)
  assert.equal(shouldRunRoomRendererMarkerPulse({ reduceMotion: true, paused: false }), false)
  assert.equal(shouldRunRoomRendererMarkerPulse({ reduceMotion: false, paused: true }), false)
})
