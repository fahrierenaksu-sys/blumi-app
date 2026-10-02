import assert from "node:assert/strict"
import test from "node:test"
import {
  ONBOARDING_WELCOME_HOME_TIMELINE_MS,
  getOnboardingWelcomeHomeProgressAtElapsed
} from "./onboardingWelcomeHomeModel"

test("warm-home settle reaches the house, door glow, and canonical pair without pets", () => {
  const timeline = ONBOARDING_WELCOME_HOME_TIMELINE_MS
  const settling = getOnboardingWelcomeHomeProgressAtElapsed(
    timeline.settleStart + 80
  )

  assert.equal(settling.entranceGroup, 1)
  assert.ok(settling.settle > 0)
  assert.ok(settling.house > 0.98)
  assert.ok(settling.doorLight > 0.8)
})

test("reduce motion resolves directly to the warm final composition", () => {
  assert.deepEqual(getOnboardingWelcomeHomeProgressAtElapsed(0, true), {
    house: 1,
    doorLight: 1,
    entranceGroup: 1,
    settle: 1
  })
})
