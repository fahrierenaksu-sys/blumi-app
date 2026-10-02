import assert from "node:assert/strict"
import test from "node:test"
import { resolveMiniRoomMotionPolicy } from "./miniRoomReducedMotion"

test("reduced motion makes decorative room motion instant or static", () => {
  assert.deepEqual(resolveMiniRoomMotionPolicy(true), {
    animateBreathe: false,
    animateJoin: false,
    animateSpeaking: false,
    animateBubble: false,
    animateWalking: true
  })
})

test("the default room policy retains tasteful motion", () => {
  assert.deepEqual(resolveMiniRoomMotionPolicy(false), {
    animateBreathe: true,
    animateJoin: true,
    animateSpeaking: true,
    animateBubble: true,
    animateWalking: true
  })
})
