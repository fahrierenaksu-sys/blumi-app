import assert from "node:assert/strict"
import test from "node:test"
import {
  ONBOARDING_GREETING_WAVE_SEQUENCE,
  getOnboardingWaveAssetFrameAtElapsed,
  getOnboardingWaveFrameTimestampMs
} from "./onboardingGreetingPairModel"

test("the authored greeting is a visible out-and-back sprite sequence instead of a one-way pose change", () => {
  const sequence = ONBOARDING_GREETING_WAVE_SEQUENCE
  const frameDurationMs = 135
  for (let index = 0; index < sequence.length; index += 1) {
    assert.equal(
      getOnboardingWaveAssetFrameAtElapsed({ elapsedMs: index * frameDurationMs, frameDurationMs }),
      sequence[index]
    )
  }
  assert.equal(
    getOnboardingWaveAssetFrameAtElapsed({ elapsedMs: sequence.length * frameDurationMs * 4, frameDurationMs }),
    sequence[sequence.length - 1]
  )
})

test("wave timestamp helpers expose absolute authored cue times", () => {
  assert.equal(
    getOnboardingWaveFrameTimestampMs({
      frameIndex: 3,
      frameDurationMs: 135
    }),
    405
  )
  assert.equal(
    getOnboardingWaveFrameTimestampMs({
      frameIndex: 3,
      frameDurationMs: 135,
      startOffsetMs: 120
    }),
    525
  )
})
