import assert from "node:assert/strict"
import test from "node:test"
import {
  MINI_ROOM_ENTRY_DURATION_MS,
  MINI_ROOM_PARTNER_ARRIVAL_MS,
  MINI_ROOM_WELCOME_FADE_MS,
  MINI_ROOM_WELCOME_HOLD_MS,
  MINI_ROOM_WELCOME_REVEAL_MS,
  resolveMiniRoomMotionPolicy
} from "./miniRoomReducedMotion"

test("MiniRoom scene motion uses one short entry and a one-shot partner arrival", () => {
  assert.equal(MINI_ROOM_ENTRY_DURATION_MS, 440)
  assert.equal(MINI_ROOM_PARTNER_ARRIVAL_MS, 900)
  assert.equal(MINI_ROOM_WELCOME_REVEAL_MS, 180)
  assert.equal(MINI_ROOM_WELCOME_HOLD_MS, 900)
  assert.equal(MINI_ROOM_WELCOME_FADE_MS, 240)
})

test("reduced motion makes decorative room motion instant or static", () => {
  assert.deepEqual(resolveMiniRoomMotionPolicy(true), {
    animateBreathe: false,
    animateJoin: false,
    animateHeart: false,
    animateSpeaking: false,
    animateEmote: false,
    animateBubble: false,
    animateWalking: true,
    transitionDuration: 0
  })
})

test("the default room policy retains tasteful motion", () => {
  assert.deepEqual(resolveMiniRoomMotionPolicy(false), {
    animateBreathe: true,
    animateJoin: true,
    animateHeart: true,
    animateSpeaking: true,
    animateEmote: true,
    animateBubble: true,
    animateWalking: true,
    transitionDuration: 420
  })
})
