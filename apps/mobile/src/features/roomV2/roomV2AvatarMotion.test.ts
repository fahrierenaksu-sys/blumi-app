import assert from "node:assert/strict"
import test from "node:test"
import type { Animated } from "react-native"
import {
  getAvatarMotionScaleY,
  type RoomRendererAvatarMotion
} from "./components/roomRendererAvatarMotionStyle"
import {
  getRoomV2AvatarSittingTranslateY,
  ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX
} from "./roomV2AvatarMotion"

test("sitting rig converts the normalized seat height into a responsive stage offset", () => {
  assert.equal(
    getRoomV2AvatarSittingTranslateY({ seatHeight: 0.09 }, 1_000),
    137
  )
  assert.equal(getRoomV2AvatarSittingTranslateY({ seatHeight: 0.056 }, 1_000), 103)
  assert.equal(getRoomV2AvatarSittingTranslateY({ seatHeight: 0.085 }, 800), 115)
  assert.ok(
    getRoomV2AvatarSittingTranslateY({ seatHeight: 0.09 }, 1_000) >
      getRoomV2AvatarSittingTranslateY({ seatHeight: 0.056 }, 1_000),
    "a taller seat must preserve the larger normalized vertical drop"
  )
})

test("sitting rig fails safe to the calibrated default until layout and metadata are valid", () => {
  assert.equal(getRoomV2AvatarSittingTranslateY(), ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX)
  assert.equal(
    getRoomV2AvatarSittingTranslateY({ seatHeight: Number.NaN }, 1_000),
    ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX
  )
  assert.equal(
    getRoomV2AvatarSittingTranslateY({ seatHeight: 0.056 }, 0),
    ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX
  )
})

test("a sitting avatar is never squashed: its vertical scale stays exactly 1", () => {
  // Interpolating refs would return a non-numeric value, so any animated
  // squash or breathe on a seated avatar fails this check.
  const animatedRef = {
    interpolate: () => ({ animated: true })
  } as unknown as Animated.Value
  const treatments = ["animatedMotionAssets", "exactMotionAssets", "runtimeLocomotion", "runtimeGesture", "static"]
  for (const treatment of treatments) {
    for (const usesRuntimeLocomotion of [false, true]) {
      for (const usesRuntimeGesture of [false, true]) {
        for (const usesAnimatedAssets of [false, true]) {
          for (const usesIdleBreathe of [false, true]) {
            const motion = {
              state: "sitting",
              treatment,
              usesRuntimeLocomotion,
              usesRuntimeGesture,
              usesAnimatedAssets
            } as unknown as RoomRendererAvatarMotion
            assert.equal(
              getAvatarMotionScaleY(motion, animatedRef, animatedRef, usesIdleBreathe),
              1,
              `${treatment} locomotion=${usesRuntimeLocomotion} gesture=${usesRuntimeGesture} ` +
                `assets=${usesAnimatedAssets} breathe=${usesIdleBreathe}`
            )
          }
        }
      }
    }
  }
})
