import assert from "node:assert/strict"
import test from "node:test"
import {
  advanceRoomAvatarStridePhase,
  getRoomAvatarContactShadow,
  getRoomAvatarPoseTransitionDurationMs,
  getRoomAvatarPoseTransitionKind,
  getRoomAvatarPoseTransitionPose,
  getRoomAvatarStrideBob,
  getRoomAvatarStrideFrameIndex,
  getRoomAvatarStridePhaseDelta,
  ROOM_AVATAR_STRIDE_CYCLE_BOX_HEIGHTS
} from "./roomAvatarBodyMotionModel"

const LIFT = 14

test("sitting down and standing up play a transition; other pose changes do not", () => {
  assert.equal(getRoomAvatarPoseTransitionKind("walking", "sitting"), "sit")
  assert.equal(getRoomAvatarPoseTransitionKind("idle", "sitting"), "sit")
  assert.equal(getRoomAvatarPoseTransitionKind("sitting", "walking"), "stand")
  assert.equal(getRoomAvatarPoseTransitionKind("sitting", "idle"), "stand")
  assert.equal(getRoomAvatarPoseTransitionKind("idle", "walking"), null)
  assert.equal(getRoomAvatarPoseTransitionKind("sitting", "sitting"), null)
  assert.equal(getRoomAvatarPoseTransitionKind(undefined, "sitting"), null)
})

test("sit and stand last within the natural 300–480 ms window (S1)", () => {
  const sit = getRoomAvatarPoseTransitionDurationMs("sit")
  const stand = getRoomAvatarPoseTransitionDurationMs("stand")
  assert.ok(sit >= 360 && sit <= 480, `sit ${sit} ms`)
  assert.ok(stand >= 300 && stand <= 400, `stand ${stand} ms`)
})

test("a sit starts where the standing body was, drops down and lands exactly at rest", () => {
  const duration = getRoomAvatarPoseTransitionDurationMs("sit")
  const start = getRoomAvatarPoseTransitionPose("sit", 0, LIFT)
  assert.ok(start.translateY <= -LIFT, "starts raised by the hip lift")
  let highest = 0
  let lowestSoFar = -Infinity
  let falling = false
  let landed = false
  for (let t = 0; t <= duration; t += 4) {
    const { translateY, scaleY } = getRoomAvatarPoseTransitionPose("sit", t, LIFT)
    highest = Math.min(highest, translateY)
    if (translateY >= 0) landed = true
    if (translateY > lowestSoFar && lowestSoFar !== -Infinity) falling = true
    // Once it has started falling, it never climbs back up (no bounce off the seat).
    if (falling) assert.ok(translateY >= lowestSoFar - 1e-9, `rose again at ${t} ms`)
    lowestSoFar = Math.max(lowestSoFar, translateY)
    assert.ok(scaleY > 0.9 && scaleY < 1.05, `scale stays subtle at ${t} ms`)
  }
  assert.ok(highest < -LIFT, "anticipation pushes up before the drop")
  assert.ok(landed)
  assert.deepEqual(getRoomAvatarPoseTransitionPose("sit", duration, LIFT), { translateY: 0, scaleY: 1 })
  assert.deepEqual(getRoomAvatarPoseTransitionPose("sit", duration + 500, LIFT), { translateY: 0, scaleY: 1 })
})

test("the landing squashes the body, then it settles", () => {
  const duration = getRoomAvatarPoseTransitionDurationMs("sit")
  const squash = Math.min(...Array.from({ length: duration }, (_, t) => getRoomAvatarPoseTransitionPose("sit", t, LIFT).scaleY))
  assert.ok(squash < 0.97, "a visible squash on landing")
  const nearEnd = getRoomAvatarPoseTransitionPose("sit", duration - 1, LIFT)
  assert.ok(Math.abs(nearEnd.scaleY - 1) < 0.01, "settled before the end, no jump")
})

test("a stand starts low and crouched and rises to rest", () => {
  const duration = getRoomAvatarPoseTransitionDurationMs("stand")
  const start = getRoomAvatarPoseTransitionPose("stand", 0, LIFT)
  assert.ok(start.translateY > 0 && start.scaleY < 1)
  const nearEnd = getRoomAvatarPoseTransitionPose("stand", duration - 1, LIFT)
  assert.ok(Math.abs(nearEnd.translateY) < 0.5 && Math.abs(nearEnd.scaleY - 1) < 0.01)
  assert.deepEqual(getRoomAvatarPoseTransitionPose("stand", duration, LIFT), { translateY: 0, scaleY: 1 })
})

test("walk frames follow distance: no movement, no frame change; one cycle per stride", () => {
  const boxHeight = 120
  let phase = 0
  const frames: number[] = []
  // A cycle's distance in 40 even moves shows each of the four frames in order.
  const cyclePx = boxHeight * ROOM_AVATAR_STRIDE_CYCLE_BOX_HEIGHTS
  for (let step = 0; step < 40; step += 1) {
    phase = advanceRoomAvatarStridePhase(phase, getRoomAvatarStridePhaseDelta(cyclePx / 40, boxHeight))
    frames.push(getRoomAvatarStrideFrameIndex(phase, 4))
  }
  assert.deepEqual([...new Set(frames)], [0, 1, 2, 3])
  const slowHold = frames.filter((frame) => frame === 1).length
  assert.ok(slowHold >= 9 && slowHold <= 11, `frame held for ${slowHold} moves`)
  const stopped = getRoomAvatarStrideFrameIndex(advanceRoomAvatarStridePhase(phase, getRoomAvatarStridePhaseDelta(0, boxHeight)), 4)
  assert.equal(stopped, frames.at(-1))
  // Twice as fast covers the cycle in half the moves: frames speed up with the body.
  let fastPhase = 0
  const fastFrames: number[] = []
  for (let step = 0; step < 20; step += 1) {
    fastPhase = advanceRoomAvatarStridePhase(fastPhase, getRoomAvatarStridePhaseDelta(cyclePx / 20, boxHeight))
    fastFrames.push(getRoomAvatarStrideFrameIndex(fastPhase, 4))
  }
  const fastHold = fastFrames.filter((frame) => frame === 1).length
  assert.ok(fastHold >= 4 && fastHold <= 6, `frame held for ${fastHold} moves at double pace`)
})

test("stride phase wraps and survives odd inputs", () => {
  assert.ok(advanceRoomAvatarStridePhase(0.9, 0.3) < 1)
  assert.equal(getRoomAvatarStridePhaseDelta(10, 0), 0)
  assert.equal(getRoomAvatarStridePhaseDelta(-5, 100), 0)
  assert.equal(getRoomAvatarStrideFrameIndex(0.999999, 4), 3)
  assert.equal(getRoomAvatarStrideFrameIndex(0.5, 1), 0)
})

test("the body bobs twice per cycle, grounded when a foot plants, and the shadow answers", () => {
  assert.equal(getRoomAvatarStrideBob(0), 0)
  assert.ok(getRoomAvatarStrideBob(0.5) < 1e-9)
  assert.ok(Math.abs(getRoomAvatarStrideBob(0.25) - 1) < 1e-9)
  assert.ok(Math.abs(getRoomAvatarStrideBob(0.75) - 1) < 1e-9)
  const grounded = getRoomAvatarContactShadow(0)
  const lifted = getRoomAvatarContactShadow(1)
  assert.deepEqual(grounded, { scale: 1, opacity: 1 })
  assert.ok(lifted.scale < 1 && lifted.opacity < 1)
})
