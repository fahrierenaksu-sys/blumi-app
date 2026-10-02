import assert from "node:assert/strict"
import test from "node:test"
import {
  ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS,
  shouldShowOnboardingRunnerCrownMask,
  shouldUseOnboardingArrivalFrames
} from "./onboardingArrivalMotionModel"
import {
  ONBOARDING_INTRO_TIMELINE_MS,
  getOnboardingImpactVisualProgressAtElapsed,
  getOnboardingRunnerMotionTrack
} from "./onboardingIntroModel"

test("arrival hands off at ground contact so population counting never delays the first run step", () => {
  assert.equal(shouldUseOnboardingArrivalFrames("globe-launching"), false)
  assert.equal(shouldUseOnboardingArrivalFrames("impact"), true)
  assert.equal(shouldUseOnboardingArrivalFrames("airborne"), true)
  assert.equal(shouldUseOnboardingArrivalFrames("landing"), true)
  assert.equal(shouldUseOnboardingArrivalFrames("population-counting"), false)
  assert.equal(shouldUseOnboardingArrivalFrames("chasing"), false)
})

test("the run track starts neutral so the first post-landing frame cannot rotate or shrink", () => {
  const leader = getOnboardingRunnerMotionTrack("leader")
  const chaser = getOnboardingRunnerMotionTrack("chaser")

  for (const track of [leader, chaser]) {
    assert.equal(track.translateY[0], 0)
    assert.equal(track.scale[0], 1)
    assert.equal(track.rotate[0], 0)
  }
})

test("the globe crown mask stays attached to the surface instead of flying with airborne actors", () => {
  assert.equal(shouldShowOnboardingRunnerCrownMask("globe-launching"), false)
  assert.equal(shouldShowOnboardingRunnerCrownMask("impact"), false)
  assert.equal(shouldShowOnboardingRunnerCrownMask("airborne"), false)
  assert.equal(shouldShowOnboardingRunnerCrownMask("landing"), false)
  assert.equal(shouldShowOnboardingRunnerCrownMask("population-counting"), true)
  assert.equal(shouldShowOnboardingRunnerCrownMask("world-ready"), true)
})

test("the authored reaction begins at globe contact while the upright pose holds before impact", () => {
  const impactProgress = getOnboardingImpactVisualProgressAtElapsed(
    ONBOARDING_INTRO_TIMELINE_MS.impact
  ).globeRise
  assert.ok(
    ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS.start <= impactProgress,
    "the upright-to-reaction handoff must begin on the globe-impact beat"
  )
  assert.ok(
    ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS.complete > impactProgress,
    "the reaction art must not replace the upright character before impact"
  )
})
