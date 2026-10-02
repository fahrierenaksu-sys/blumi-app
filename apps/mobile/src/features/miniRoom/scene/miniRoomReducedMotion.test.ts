import assert from "node:assert/strict"
import test from "node:test"
import { resolveMiniRoomAvatarLoops, resolveMiniRoomMotionPolicy } from "./miniRoomReducedMotion"

test("reduced motion makes decorative room motion instant or static", () => {
  assert.deepEqual(resolveMiniRoomMotionPolicy(true), {
    animateBreathe: false,
    animateJoin: false,
    animateSpeaking: false,
    animateBubble: false,
    animateWalking: true,
    animateWalkBob: false
  })
})

test("the default room policy retains tasteful motion", () => {
  assert.deepEqual(resolveMiniRoomMotionPolicy(false), {
    animateBreathe: true,
    animateJoin: true,
    animateSpeaking: true,
    animateBubble: true,
    animateWalking: true,
    animateWalkBob: true
  })
})

test("an avatar runs only the loop its pose needs, and Reduce Motion keeps only the walk", () => {
  const full = resolveMiniRoomMotionPolicy(false)
  const reduced = resolveMiniRoomMotionPolicy(true)
  const loops = (motion: "idle" | "walking" | "sitting" | "speaking" | "emoting", policy = full, usesAnimatedFrames = false, arriving = false) =>
    resolveMiniRoomAvatarLoops({ motion, policy, usesAnimatedFrames, arriving })
  assert.deepEqual(loops("idle"), { breathe: true, walkBob: false, speaking: false, arrivalRing: false })
  assert.deepEqual(loops("walking"), { breathe: false, walkBob: true, speaking: false, arrivalRing: false })
  assert.deepEqual(loops("speaking"), { breathe: false, walkBob: false, speaking: true, arrivalRing: false })
  assert.deepEqual(loops("sitting"), { breathe: false, walkBob: false, speaking: false, arrivalRing: false })
  // Drawn frames already breathe and stride: no procedural bob on top.
  assert.equal(loops("idle", full, true).breathe, false)
  assert.equal(loops("walking", full, true).walkBob, false)
  assert.equal(loops("idle", full, false, true).arrivalRing, true)
  for (const motion of ["idle", "walking", "sitting", "speaking"] as const) {
    assert.deepEqual(loops(motion, reduced, false, true), { breathe: false, walkBob: false, speaking: false, arrivalRing: false })
  }
})
