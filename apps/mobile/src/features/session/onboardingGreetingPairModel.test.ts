import assert from "node:assert/strict"
import test from "node:test"
import {
  ONBOARDING_GREETING_WAVE_SEQUENCE,
  getOnboardingWaveAssetFrameAtElapsed,
  getOnboardingWaveFrameAtElapsed,
  getOnboardingWaveFrameTimestampMs
} from "./onboardingGreetingPairModel"

test("the authored greeting is a visible out-and-back sprite sequence instead of a one-way pose change", () => {
  assert.deepEqual(ONBOARDING_GREETING_WAVE_SEQUENCE, [0, 1, 2, 3, 4, 3, 2, 1, 5])
  assert.equal(getOnboardingWaveAssetFrameAtElapsed({ elapsedMs: 0, frameDurationMs: 135 }), 0)
  assert.equal(getOnboardingWaveAssetFrameAtElapsed({ elapsedMs: 540, frameDurationMs: 135 }), 4)
  assert.equal(getOnboardingWaveAssetFrameAtElapsed({ elapsedMs: 810, frameDurationMs: 135 }), 2)
  assert.equal(getOnboardingWaveAssetFrameAtElapsed({ elapsedMs: 1_080, frameDurationMs: 135 }), 5)
})

test("wave frame resolution preserves the authored male offset across resume", () => {
  assert.equal(getOnboardingWaveFrameAtElapsed({
    elapsedMs: 0,
    frameCount: 6,
    frameDurationMs: 135
  }), 0)
  assert.equal(getOnboardingWaveFrameAtElapsed({
    elapsedMs: 140,
    frameCount: 6,
    frameDurationMs: 135
  }), 1)
  assert.equal(getOnboardingWaveFrameAtElapsed({
    elapsedMs: 80,
    frameCount: 6,
    frameDurationMs: 135,
    startOffsetMs: 120
  }), 0)
  assert.equal(getOnboardingWaveFrameAtElapsed({
    elapsedMs: 255,
    frameCount: 6,
    frameDurationMs: 135,
    startOffsetMs: 120
  }), 1)
  assert.equal(getOnboardingWaveFrameAtElapsed({
    elapsedMs: 760,
    frameCount: 6,
    frameDurationMs: 135,
    startOffsetMs: 120
  }), 4)
  assert.equal(getOnboardingWaveFrameAtElapsed({
    elapsedMs: 960,
    frameCount: 6,
    frameDurationMs: 135,
    startOffsetMs: 120
  }), 5)
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
