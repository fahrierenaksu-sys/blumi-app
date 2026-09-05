import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import {
  ONBOARDING_WELCOME_HOME_TIMELINE_MS,
  getOnboardingWelcomeHomeProgressAtElapsed,
  getOnboardingWelcomeHomeSceneAtElapsed
} from "./onboardingWelcomeHomeModel"
import { ONBOARDING_BRAND_PRELUDE_TIMELINE_MS } from "./onboardingBrandPreludeModel"

test("welcome-home choreography stays distinct from the later greeting beat", () => {
  const timeline = ONBOARDING_WELCOME_HOME_TIMELINE_MS

  assert.ok(timeline.houseRevealStart < timeline.characterEntranceStart)
  assert.ok(timeline.characterEntranceStart < timeline.settleStart)
  assert.ok(timeline.settleStart < timeline.settleComplete)
  assert.ok(timeline.settleComplete <= timeline.settled)
  assert.ok(timeline.settled >= 1_400)
  assert.ok(timeline.settled <= 1_700)
  assert.ok(
    ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.primaryCtaStart <
      ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.characterEntranceStart + timeline.settled
  )

  assert.equal(getOnboardingWelcomeHomeSceneAtElapsed(0), "home-reveal")
  assert.equal(
    getOnboardingWelcomeHomeSceneAtElapsed(timeline.characterEntranceStart),
    "character-entrance"
  )
  assert.equal(
    getOnboardingWelcomeHomeSceneAtElapsed(timeline.settleStart),
    "settle"
  )
  assert.equal(
    getOnboardingWelcomeHomeSceneAtElapsed(timeline.settled),
    "ambient-idle"
  )
})

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

test("welcome home keeps canonical characters and no longer mounts pet props", () => {
  const source = readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "OnboardingWelcomeHomeScene.tsx"),
    "utf8"
  )

  assert.match(source, /<OnboardingGreetingPair/)
  assert.match(source, /ambientOnly=\{true\}/)
  assert.match(source, /entranceVariant="doorway"/)
  assert.match(source, /styles\.floorLight/)
  assert.doesNotMatch(source, /characterShadow/)
  assert.doesNotMatch(source, /WELCOME_KITTEN|WELCOME_PUPPY|blumi_welcome_kitten|blumi_welcome_puppy/)
})

test("the warm-home scene mounts independently from the later greeting-wave leg", () => {
  const source = readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "OnboardingBrandPrelude.tsx"),
    "utf8"
  )

  assert.match(source, /<OnboardingWelcomeHomeScene/)
  assert.doesNotMatch(
    source,
    /charactersStarted\s*\?\s*\(\s*<>\s*[\s\S]*<OnboardingWelcomeHomeScene/s
  )
})

test("reduce motion resolves directly to the warm final composition", () => {
  assert.deepEqual(getOnboardingWelcomeHomeProgressAtElapsed(0, true), {
    house: 1,
    doorLight: 1,
    entranceGroup: 1,
    settle: 1
  })
})
