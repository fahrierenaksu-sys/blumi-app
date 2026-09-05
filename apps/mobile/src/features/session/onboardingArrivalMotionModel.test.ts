import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import {
  ONBOARDING_ARRIVAL_BEATS,
  ONBOARDING_ARRIVAL_FRAME_COUNT,
  ONBOARDING_ARRIVAL_FRAME_VISIBILITY_START_PROGRESS,
  ONBOARDING_ARRIVAL_IMPACT_START_FRAME_INDEX,
  ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS,
  ONBOARDING_ARRIVAL_PREROLL_MS,
  getOnboardingArrivalFrameIndex,
  getOnboardingArrivalImpactStartProgress,
  getOnboardingArrivalPose,
  getOnboardingRunHandoffFrameIndex,
  shouldShowOnboardingRunnerCrownMask,
  shouldShowOnboardingUnifiedActors,
  shouldUseOnboardingArrivalFrames
} from "./onboardingArrivalMotionModel"
import {
  ONBOARDING_INTRO_TIMELINE_MS,
  getOnboardingImpactVisualProgressAtElapsed,
  getOnboardingRunnerMotionTrack
} from "./onboardingIntroModel"

test("arrival choreography preserves impact, tuck, opening, landing and run handoff beats", () => {
  assert.deepEqual(ONBOARDING_ARRIVAL_BEATS, {
    impact: 0,
    launchStretch: 0.12,
    tuck: 0.28,
    inverted: 0.46,
    open: 0.64,
    landingPrep: 0.78,
    landingSquash: 0.9,
    runReady: 1
  })
})

test("arrival frame selection is deterministic and reaches the run-ready frame", () => {
  assert.equal(getOnboardingArrivalFrameIndex(0), 0)
  assert.equal(getOnboardingArrivalFrameIndex(0.5), 15)
  assert.equal(getOnboardingArrivalFrameIndex(0.9), 27)
  assert.equal(getOnboardingArrivalFrameIndex(1), 29)
})

test("female and male use distinct authored body mechanics", () => {
  const female = getOnboardingArrivalPose("female", 0.46)
  const male = getOnboardingArrivalPose("male", 0.46)

  assert.notDeepEqual(female, male)
  assert.ok(Math.abs(female.rotateDeg) <= 4)
  assert.ok(Math.abs(male.rotateDeg) <= 4)
  assert.ok(female.translateX > 0)
  assert.ok(male.translateX < 0)
})

test("landing settles onto the run baseline without a positional pop", () => {
  const female = getOnboardingArrivalPose("female", 1)
  const male = getOnboardingArrivalPose("male", 1)

  assert.deepEqual(female, {
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotateDeg: 0
  })
  assert.deepEqual(male, {
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotateDeg: 0
  })
})

test("arrival uses thirty real authored poses instead of baseline-shifting duplicate art", () => {
  assert.equal(ONBOARDING_ARRIVAL_FRAME_COUNT, 30)
})

test("arrival hands off at ground contact so population counting never delays the first run step", () => {
  assert.equal(shouldUseOnboardingArrivalFrames("globe-launching"), false)
  assert.equal(shouldUseOnboardingArrivalFrames("impact"), true)
  assert.equal(shouldUseOnboardingArrivalFrames("airborne"), true)
  assert.equal(shouldUseOnboardingArrivalFrames("landing"), true)
  assert.equal(shouldUseOnboardingArrivalFrames("population-counting"), false)
  assert.equal(shouldUseOnboardingArrivalFrames("chasing"), false)
})

test("the landing hands off to the matching pose in the complete approved run cycle", () => {
  assert.equal(getOnboardingRunHandoffFrameIndex("female"), 6)
  assert.equal(getOnboardingRunHandoffFrameIndex("male"), 0)
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

test("the unified actors stay visible while landing hands directly into the population run", () => {
  assert.equal(shouldShowOnboardingUnifiedActors("globe-launching"), true)
  assert.equal(shouldShowOnboardingUnifiedActors("impact"), true)
  assert.equal(shouldShowOnboardingUnifiedActors("landing"), true)
  assert.equal(shouldShowOnboardingUnifiedActors("population-counting"), true)
  assert.equal(shouldShowOnboardingUnifiedActors("chasing"), true)
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
  assert.equal(ONBOARDING_ARRIVAL_PREROLL_MS, 0)
  assert.equal(
    ONBOARDING_ARRIVAL_FRAME_VISIBILITY_START_PROGRESS,
    ONBOARDING_ARRIVAL_BEATS.launchStretch
  )
  assert.deepEqual(ONBOARDING_ARRIVAL_IMPACT_START_FRAME_INDEX, {
    female: 3,
    male: 3
  })
  assert.equal(getOnboardingArrivalImpactStartProgress("female"), 0.1)
  assert.equal(getOnboardingArrivalImpactStartProgress("male"), 0.1)
  assert.deepEqual(ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS, {
    start: 0.88,
    complete: 0.91
  })
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
  assert.ok(
    ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS.complete -
      ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS.start <= 0.05,
    "the contact-pose handoff must stay a short soft crossfade after impact"
  )

  const revealElapsed = ONBOARDING_INTRO_TIMELINE_MS.globeLaunchComplete *
    (1 - Math.cbrt(1 - ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS.start))
  const arrivalAtReveal = (
    revealElapsed -
    (ONBOARDING_INTRO_TIMELINE_MS.impact - ONBOARDING_ARRIVAL_PREROLL_MS)
  ) / (
    ONBOARDING_INTRO_TIMELINE_MS.landingComplete -
    (ONBOARDING_INTRO_TIMELINE_MS.impact - ONBOARDING_ARRIVAL_PREROLL_MS)
  )
  assert.equal(
    getOnboardingArrivalFrameIndex(arrivalAtReveal),
    0,
    "the first authored pose at contact must still be the upright reaction start"
  )
})

test("landing squash compresses into the globe before returning to the run baseline", () => {
  const femaleSquash = getOnboardingArrivalPose("female", ONBOARDING_ARRIVAL_BEATS.landingSquash)
  const maleSquash = getOnboardingArrivalPose("male", ONBOARDING_ARRIVAL_BEATS.landingSquash)

  assert.equal(femaleSquash.translateY, 5)
  assert.equal(maleSquash.translateY, 5)
  assert.ok(femaleSquash.scale < 1)
  assert.ok(maleSquash.scale < 1)
})

test("runtime uses one 6x5 atlas per role for thirty authored 30 FPS hard-cut poses", () => {
  const directory = path.dirname(new URL(import.meta.url).pathname)
  const component = readFileSync(path.join(directory, "OnboardingArrivalCharacter.tsx"), "utf8")
  const catalog = readFileSync(path.join(directory, "onboardingArrivalAssetCatalog.ts"), "utf8")
  const hero = readFileSync(path.join(directory, "OnboardingWorldHero.tsx"), "utf8")

  assert.match(component, /ONBOARDING_ARRIVAL_FRAME_COUNT/)
  assert.match(component, /FRAME_CUT_WINDOW = 0\.0005/)
  assert.doesNotMatch(component, /FRAME_CROSSFADE/)
  assert.match(component, /getOnboardingArrivalImpactStartProgress/)
  assert.match(component, /const displayProgress = progress\.interpolate/)
  assert.match(component, /revealProgress !== undefined/)
  assert.equal((catalog.match(/arrival_female_atlas\.png/g) ?? []).length, 1)
  assert.equal((catalog.match(/arrival_male_atlas\.png/g) ?? []).length, 1)
  assert.doesNotMatch(catalog, /arrival_female_f\d+\.png/)
  assert.doesNotMatch(catalog, /arrival_male_f\d+\.png/)
  assert.doesNotMatch(component, /\.map\(\(source, frameIndex\)/)
  assert.match(component, /overflow: "hidden"/)
  assert.doesNotMatch(catalog, /ONBOARDING_ARRIVAL_CONTINUOUS_RUN_ASSETS/)
  assert.match(catalog, /onboarding-arrival-v3-candidate/)
  assert.match(hero, /crownMaskOpacity/)
  assert.match(hero, /inputRange:\s*\[0, 0\.2, 0\.45, 1\]/)
  assert.match(hero, /outputRange:\s*\[0, 0, 1, 1\]/)
})

test("globe rise, contact, flight and landing are driven by one uninterrupted native clock", () => {
  const directory = path.dirname(new URL(import.meta.url).pathname)
  const scene = readFileSync(path.join(directory, "OnboardingWorldScene.tsx"), "utf8")
  const hero = readFileSync(path.join(directory, "OnboardingWorldHero.tsx"), "utf8")
  const runner = readFileSync(path.join(directory, "OnboardingRunner.tsx"), "utf8")
  const prelude = readFileSync(path.join(directory, "OnboardingBrandPrelude.tsx"), "utf8")

  assert.match(scene, /impactTimeline/)
  assert.match(scene, /getOnboardingImpactVisualProgressAtElapsed/)
  assert.match(scene, /IMPACT_VISUAL_CLOCK_INPUT_RANGE\.map/)
  assert.match(scene, /showCharacters=\{preludeOwnsLaunchCharacters\}/)
  assert.match(scene, /toValue: ONBOARDING_INTRO_TIMELINE_MS\.landingComplete/)
  assert.match(scene, /easing: Easing\.linear/)
  assert.doesNotMatch(scene, /Animated\.timing\(avatarFlight/)
  assert.doesNotMatch(scene, /Animated\.timing\(globeRise/)
  assert.doesNotMatch(scene, /Animated\.timing\(globeImpact/)
  assert.doesNotMatch(scene, /Animated\.timing\(landingReaction/)
  assert.doesNotMatch(scene, /case "airborne": \{[\s\S]*Animated\.timing\(avatarFlight/)
  assert.doesNotMatch(scene, /case "landing": \{[\s\S]*Animated\.timing\(avatarFlight/)
  assert.doesNotMatch(hero, /heroContactShadowRow/)
  assert.match(hero, /const pairOpacity = arrivalAssetsEnabled/)
  assert.match(hero, /phase === "globe-launching"/)
  assert.match(hero, /phase === "impact"/)
  assert.match(hero, /globeImpact\.interpolate/)
  assert.match(hero, /const actorOpacity = runnerOpacity/)
  assert.match(hero, /inputRange: \[0, 0\.04, 0\.1\]/)
  assert.match(hero, /size=\{ONBOARDING_SHARED_CHARACTER_WIDTH\}/)
  assert.match(hero, /revealProgress=\{arrivalReveal\}/)
  assert.match(hero, /<Animated\.View\s+style=\{\[\s*styles\.worldStage/)
  assert.match(runner, /styles\.arrivalLayer/)
  assert.match(runner, /styles\.runLayer/)
  assert.match(runner, /ONBOARDING_SHARED_CHARACTER_HEIGHT \/ ONBOARDING_SHARED_CHARACTER_WIDTH/)
  assert.match(runner, /APPROVED_ONBOARDING_RUN_ASSETS/)
  assert.doesNotMatch(runner, /ONBOARDING_ARRIVAL_CONTINUOUS_RUN_ASSETS/)
  assert.match(runner, /const frameSet = pose\.animationState === "orbit-chase"/)
  assert.doesNotMatch(runner, /ONBOARDING_ARRIVAL_CANDIDATE_ASSETS/)
  assert.equal((hero.match(/arrivalEnabled=\{arrivalAssetsEnabled\}/g) ?? []).length, 2)
  assert.equal((hero.match(/arrivalProgress=\{arrivalProgress\}/g) ?? []).length, 2)
  assert.equal((hero.match(/arrivalExitProgress=\{populationReveal\}/g) ?? []).length, 0)
  assert.equal((hero.match(/arrivalVisible=\{arrivalFramesEnabled\}/g) ?? []).length, 2)
  assert.equal((hero.match(/arrivalRevealProgress=\{arrivalReveal\}/g) ?? []).length, 2)
  assert.equal((hero.match(/arrivalFallbackSource=\{/g) ?? []).length, 2)
  assert.match(hero, /const unifiedActorOpacity = arrivalAssetsEnabled/)
  assert.match(hero, /opacity: pairOpacity/)
  assert.match(runner, /const isArrivalRunWarmup = arrivalEnabled && phase === "landing"/)
  assert.match(
    runner,
    /const isRunning = motionEnabled && \(hasAnimatedPose \|\| isArrivalRunWarmup\)/
  )
  assert.match(runner, /const staticFrameIndex = isRunning\s+\? null\s+:\s+isArrivalRunWarmup\s+\? handoffFrameIndex\s+: 0/)
  assert.doesNotMatch(runner, /const frameDuration = pose\.animationState/)
  assert.match(runner, /const RUNNER_FRAME_DURATION_MS = 60/)
  assert.match(runner, /RUNNER_JOG_FRAME_DURATION_MS = 60/)
  assert.match(runner, /ONBOARDING_RUNNER_FRAME_COUNT = 12/)
  assert.doesNotMatch(runner, /CHASER_RUNNER_(?:FRAME_COUNT|LOOP_DURATION_MS|FRAME_CLOCK_POSITIONS)/)
  assert.match(runner, /sharedFrameClock: Animated\.Value/)
  assert.match(runner, /const sourceFrameIndex = \(frameIndex \+ handoffFrameIndex\) % frameSet\.length/)
  assert.doesNotMatch(runner, /Animated\.loop\(/)
  assert.match(runner, /const FRAME_CROSSFADE = 0\.0005/)
  assert.match(runner, /chaser: \[13, 13, 22, 22, 16, 16, 5, 5, 17, 17, 15, 15\]/)
  assert.doesNotMatch(runner, /placement\.footX - readyPlacement\.footX \+ track\.translateX/)
  assert.doesNotMatch(runner, /placement\.surfaceY - readyPlacement\.surfaceY \+ track\.translateY/)
  assert.match(runner, /pose\.animationState === "reacting"/)
  assert.match(runner, /pose\.animationState === "orbit-chase"/)
  assert.match(runner, /ONBOARDING_RUNNER_CATCH_X_OFFSETS\[role\]/)
  assert.doesNotMatch(runner, /frameProgressRef/)
  assert.match(runner, /const arrivalLayerOpacity = arrivalVisible && arrivalProgress/)
  assert.match(runner, /const runLayerOpacity = arrivalVisible && arrivalProgress/)
  assert.match(
    runner,
    /const RUN_HANDOFF_START_PROGRESS = ONBOARDING_ARRIVAL_BEATS\.landingSquash/
  )
  assert.equal((runner.match(/RUN_HANDOFF_START_PROGRESS,/g) ?? []).length, 2)
  assert.match(runner, /outputRange: \[1, 1, 0, 0\]/)
  assert.match(runner, /outputRange: \[0, 0, 1, 1\]/)
  assert.doesNotMatch(runner, /arrivalExitProgress/)
  assert.match(prelude, /opacity: showCharacters \? 1 : 0/)
})

test("both runners share the same six-pose cadence without clock drift", () => {
  const directory = path.dirname(new URL(import.meta.url).pathname)
  const hero = readFileSync(path.join(directory, "OnboardingWorldHero.tsx"), "utf8")

  assert.match(hero, /const runnerFrameClock = useRef\(new Animated\.Value\(0\)\)\.current/)
  assert.equal((hero.match(/sharedFrameClock=\{runnerFrameClock\}/g) ?? []).length, 2)
  assert.equal((hero.match(/Animated\.loop\(/g) ?? []).length, 1)
  assert.match(hero, /duration: RUNNER_FRAME_DURATION_MS \* ONBOARDING_RUNNER_FRAME_COUNT/)
  assert.doesNotMatch(hero, /CHASER_RUNNER_LOOP_DURATION_MS/)
  assert.match(hero, /const shouldAnimateRunners = showRunners \|\| phase === "landing"/)
  assert.match(hero, /if \(!motionEnabled \|\| !shouldAnimateRunners\) return undefined/)
  assert.match(hero, /useNativeDriver: true/)
})
