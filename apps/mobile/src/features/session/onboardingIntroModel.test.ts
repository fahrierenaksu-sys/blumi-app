import assert from "node:assert/strict"
import test from "node:test"
import {
  ONBOARDING_GLOBE_LOOP_DURATION_MS,
  ONBOARDING_IMPACT_REACTION_MAX_LATENCY_MS,
  ONBOARDING_INTRO_TIMELINE_MS,
  ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS,
  ONBOARDING_RUNNER_CATCH_X_OFFSETS,
  ONBOARDING_RUNNER_ORBIT_DURATION_MS,
  ONBOARDING_WHOAA_REVEAL_LEAD_MS,
  ONBOARDING_SCENE_HANDOFF_MS,
  getOnboardingImpactVisualProgressAtElapsed,
  getOnboardingRunnerMotionTrack,
  getOnboardingRunnerOrbitTrack,
  getOnboardingRunnerPose,
  getOnboardingRunnerState,
  getOnboardingIntroAnimationProgress,
  createOnboardingIntroState,
  getOnboardingIntroPrimaryAction,
  isOnboardingIntroPrimaryActionEnabled,
  reduceOnboardingIntro,
  shouldInitializeOnboardingImpactSettled,
  shouldShowOnboardingPopulationCard,
  shouldShowOnboardingRunners,
  shouldRunOnboardingIntroMotion,
  shouldRunOnboardingRunnerOrbit
} from "./onboardingIntroModel"
import {
  ONBOARDING_SHARED_CHARACTER_WIDTH,
  getOnboardingWorldRunnerPlacement
} from "./onboardingWorldCompositionModel"

test("unresolved reduced-motion preference never pre-settles the impact clock", () => {
  assert.equal(shouldInitializeOnboardingImpactSettled(false, true), false)
  assert.equal(shouldInitializeOnboardingImpactSettled(false, false), false)
  assert.equal(shouldInitializeOnboardingImpactSettled(true, false), false)
  assert.equal(shouldInitializeOnboardingImpactSettled(true, true), true)
})

test("prelude ownership ends before the rising globe becomes visually dominant", () => {
  assert.deepEqual(ONBOARDING_SCENE_HANDOFF_MS, {
    actionResponse: 100,
    preludeExit: 180,
    worldReveal: 150
  })
  assert.ok(
    ONBOARDING_SCENE_HANDOFF_MS.actionResponse < ONBOARDING_SCENE_HANDOFF_MS.worldReveal,
    "the pressed CTA should clear before the smoother world reveal completes"
  )
  assert.ok(
    ONBOARDING_SCENE_HANDOFF_MS.preludeExit < ONBOARDING_INTRO_TIMELINE_MS.impact,
    "the old character pair must never survive into globe contact"
  )
})

test("globe contact and character launch share the same visual clock", () => {
  const timeline = ONBOARDING_INTRO_TIMELINE_MS
  const beforeContact = getOnboardingImpactVisualProgressAtElapsed(timeline.impact - 1)
  const atContact = getOnboardingImpactVisualProgressAtElapsed(timeline.impact)
  const firstReactionFrame = getOnboardingImpactVisualProgressAtElapsed(
    timeline.impact + ONBOARDING_IMPACT_REACTION_MAX_LATENCY_MS
  )
  const globeSettled = getOnboardingImpactVisualProgressAtElapsed(
    timeline.globeLaunchComplete
  )
  const landingSettled = getOnboardingImpactVisualProgressAtElapsed(
    timeline.landingComplete
  )

  assert.ok(beforeContact.globeRise > 0)
  assert.equal(beforeContact.avatarFlight, 0)
  assert.ok(beforeContact.contactShadow > 0)
  assert.equal(atContact.avatarFlight, 0)
  assert.equal(atContact.contactShadow, 0)
  assert.ok(
    firstReactionFrame.avatarFlight > 0,
    "the character must visibly react within one measured reference-video frame"
  )
  assert.equal(firstReactionFrame.contactShadow, 0)
  assert.equal(globeSettled.globeRise, 1)
  assert.ok(globeSettled.avatarFlight > 0)
  assert.ok(globeSettled.avatarFlight < 1)
  assert.deepEqual(landingSettled, {
    globeRise: 1,
    globeImpact: 1,
    avatarFlight: 1,
    landingReaction: 1,
    contactShadow: 0
  })
})

test("first launch and returning users share the cinematic greeting instead of a duplicate account screen", () => {
  assert.deepEqual(createOnboardingIntroState(false, false), {
    phase: "greeting",
    isPaused: false
  })
  assert.deepEqual(createOnboardingIntroState(true, false), {
    phase: "greeting",
    isPaused: false
  })
})

test("reduced motion preserves the story but opens the world in its settled state", () => {
  const initial = createOnboardingIntroState(false, true)
  const greeting = reduceOnboardingIntro(initial, { type: "open-greeting" })
  assert.deepEqual(reduceOnboardingIntro(greeting, { type: "reveal-world", reduceMotion: true }), {
    phase: "world-ready",
    isPaused: false
  })
})

test("Get started opens the character greeting before the world launch", () => {
  const prelude = createOnboardingIntroState(false, false)
  const greeting = reduceOnboardingIntro(prelude, {
    type: "open-greeting"
  })
  const world = reduceOnboardingIntro(greeting, {
    type: "reveal-world",
    reduceMotion: false
  })

  assert.equal(greeting.phase, "character-greeting")
  assert.equal(world.phase, "globe-launching")
})

test("enabling reduced motion mid-cinematic settles the state and unlocks the CTA", () => {
  for (const phase of [
    "globe-launching",
    "impact",
    "airborne",
    "landing",
    "population-counting",
    "chasing",
    "catching"
  ] as const) {
    assert.deepEqual(
      reduceOnboardingIntro({ phase, isPaused: false }, { type: "motion-reduced" }),
      { phase: "world-ready", isPaused: false }
    )
  }
  const ready = { phase: "world-ready", isPaused: false } as const
  assert.strictEqual(reduceOnboardingIntro(ready, { type: "motion-reduced" }), ready)
})

test("the cinematic advances only in the authored order", () => {
  const prelude = createOnboardingIntroState(false, false)
  const greeting = reduceOnboardingIntro(prelude, { type: "open-greeting" })
  const launching = reduceOnboardingIntro(greeting, { type: "reveal-world", reduceMotion: false })
  const impact = reduceOnboardingIntro(launching, { type: "globe-impact" })
  const airborne = reduceOnboardingIntro(impact, { type: "launch-finished" })
  const landing = reduceOnboardingIntro(airborne, { type: "landing-started" })
  const population = reduceOnboardingIntro(landing, { type: "landing-finished" })
  const chasing = reduceOnboardingIntro(population, { type: "population-finished" })
  const catching = reduceOnboardingIntro(chasing, { type: "chase-finished" })
  const ready = reduceOnboardingIntro(catching, { type: "catch-finished" })
  const handoff = reduceOnboardingIntro(ready, { type: "handoff-started" })
  const returnedPrelude = reduceOnboardingIntro(handoff, { type: "intro-completed" })

  assert.equal(launching.phase, "globe-launching")
  assert.equal(impact.phase, "impact")
  assert.equal(airborne.phase, "airborne")
  assert.equal(landing.phase, "landing")
  assert.equal(population.phase, "population-counting")
  assert.equal(chasing.phase, "chasing")
  assert.equal(catching.phase, "catching")
  assert.equal(ready.phase, "world-ready")
  assert.equal(handoff.phase, "handoff")
  assert.equal(returnedPrelude.phase, "greeting")
  assert.equal(getOnboardingIntroPrimaryAction(ready.phase), "start-registration")
})

test("the reference choreography overlaps the launch, cushions the landing, and lets the count breathe", () => {
  const timeline = ONBOARDING_INTRO_TIMELINE_MS

  assert.equal(timeline.impact, 260)
  assert.equal(timeline.globeLaunchComplete, 500)
  assert.ok(
    timeline.globeLaunchComplete - timeline.impact <= 260,
    "the globe must meet the launch without altering the approved flip cadence"
  )
  assert.equal(
    timeline.landingComplete - timeline.impact,
    920,
    "the authored flip should stay continuous while reaching the run handoff sooner"
  )
  assert.ok(
    timeline.landingComplete - timeline.airborneComplete <= 140,
    "landing needs time for preparation, squash and the run handoff"
  )
  assert.ok(
    timeline.populationComplete - timeline.landingComplete >= 1_000,
    "the population counter needs enough time to read without delaying the run handoff"
  )
  assert.equal(
    timeline.populationComplete,
    2_400,
    "the run should begin promptly after the landing beat without rushing the counter"
  )
  assert.ok(timeline.chaseComplete > timeline.populationComplete)
  assert.ok(timeline.catchComplete > timeline.chaseComplete)
})

test("Whoa appears two seconds into the world story without waiting for chase", () => {
  const timeline = ONBOARDING_INTRO_TIMELINE_MS
  const whoaAt = timeline.catchComplete - ONBOARDING_WHOAA_REVEAL_LEAD_MS

  assert.equal(ONBOARDING_WHOAA_REVEAL_LEAD_MS, 3_560)
  assert.equal(whoaAt, 2_000)
  assert.ok(
    whoaAt > timeline.landingComplete,
    "Whoa must wait until the pair has landed"
  )
  assert.ok(
    whoaAt < timeline.populationComplete,
    "Whoa should not wait for the chase phase to begin"
  )
})

test("the male runner stays on a shorter, collision-safe surface lane", () => {
  const leader = getOnboardingRunnerMotionTrack("leader")
  const chaser = getOnboardingRunnerMotionTrack("chaser")

  assert.deepEqual(leader.inputRange, [0, 0.34, 0.68, 1])
  assert.deepEqual(chaser.inputRange, leader.inputRange)
  assert.equal(leader.scale[0], 1)
  assert.equal(chaser.scale[0], 1)
  assert.ok(leader.translateY[2] < leader.translateY[0])
  assert.deepEqual(chaser.translateY, [0, 0, 0, 0])
  assert.equal(leader.rotate[0], 0)
  assert.equal(chaser.rotate[0], 0)
  assert.ok(leader.translateX.at(-1)! < leader.translateX[2])
  assert.deepEqual(chaser.translateX, [-88, -88, -88, -88])
  assert.deepEqual(chaser.scale, [1, 1, 1, 1])
  assert.deepEqual(chaser.rotate, [0, 0, 0, 0])
  assert.ok(leader.translateY.at(-1)! <= leader.translateY[2])
  assert.ok(chaser.translateY.at(-1)! <= chaser.translateY[2])
  assert.ok(
    Math.abs(chaser.translateY.at(-1)! - leader.translateY.at(-1)!) <= 10
  )
  assert.ok(leader.translateX.at(-1)! < 0)
  assert.ok(chaser.translateX.at(-1)! < 0)

  const leaderFinalX =
    getOnboardingWorldRunnerPlacement("leader", 1).footX + leader.translateX.at(-1)!
  const chaserFinalX =
    getOnboardingWorldRunnerPlacement("chaser", 1).footX + chaser.translateX.at(-1)!
  assert.ok(
    leaderFinalX - chaserFinalX >= ONBOARDING_SHARED_CHARACTER_WIDTH + 8,
    "the final chase must preserve a visible collision-safe gap"
  )

  assert.equal(getOnboardingWorldRunnerPlacement("chaser", 0).footX, -74)
  assert.equal(getOnboardingWorldRunnerPlacement("chaser", 1).footX, -62)
  assert.equal(getOnboardingWorldRunnerPlacement("leader", 0).footX, 66)
  assert.equal(getOnboardingWorldRunnerPlacement("leader", 1).footX, 44)
})

test("the catch beat widens the runner spacing instead of letting the chaser clip in", () => {
  const leaderFinalX =
    getOnboardingWorldRunnerPlacement("leader", 1).footX +
    getOnboardingRunnerMotionTrack("leader").translateX.at(-1)!
  const chaserFinalX =
    getOnboardingWorldRunnerPlacement("chaser", 1).footX +
    getOnboardingRunnerMotionTrack("chaser").translateX.at(-1)!
  const chaseGap = leaderFinalX - chaserFinalX
  const catchGap =
    leaderFinalX +
    ONBOARDING_RUNNER_CATCH_X_OFFSETS.leader -
    (chaserFinalX + ONBOARDING_RUNNER_CATCH_X_OFFSETS.chaser)

  assert.equal(ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS, 0.42)
  assert.ok(
    ONBOARDING_RUNNER_CATCH_X_OFFSETS.chaser < ONBOARDING_RUNNER_CATCH_X_OFFSETS.leader
  )
  assert.ok(
    catchGap > chaseGap,
    "the catch reaction should open the spacing slightly so the chaser still reads as running"
  )
})

test("the settled world keeps both runners in a live orbit-chase instead of freezing in place", () => {
  const leaderOrbit = getOnboardingRunnerOrbitTrack("leader")
  const chaserOrbit = getOnboardingRunnerOrbitTrack("chaser")

  assert.deepEqual(leaderOrbit.inputRange, [0, 0.25, 0.5, 0.75, 1])
  assert.deepEqual(chaserOrbit.inputRange, leaderOrbit.inputRange)
  assert.equal(leaderOrbit.translateX[0], leaderOrbit.translateX.at(-1))
  assert.equal(chaserOrbit.translateX[0], chaserOrbit.translateX.at(-1))
  assert.equal(leaderOrbit.translateX[0], 0)
  assert.equal(chaserOrbit.translateX[0], 0)
  assert.equal(leaderOrbit.translateY[0], 0)
  assert.equal(chaserOrbit.translateY[0], 0)
  assert.equal(leaderOrbit.scale[0], 1)
  assert.equal(chaserOrbit.scale[0], 1)
  assert.ok(leaderOrbit.translateY[2] > leaderOrbit.translateY[0])
  assert.ok(chaserOrbit.translateY[2] > chaserOrbit.translateY[0])
  assert.ok(leaderOrbit.scale[2] < leaderOrbit.scale[0])
  assert.ok(chaserOrbit.scale[2] > chaserOrbit.scale[0])
  const leaderChaseX = getOnboardingRunnerMotionTrack("leader").translateX.at(-1)!
  const chaserChaseX = getOnboardingRunnerMotionTrack("chaser").translateX.at(-1)!
  const orbitGapAtEachCheckpoint = leaderOrbit.translateX.map(
    (leaderX, index) =>
      getOnboardingWorldRunnerPlacement("leader", 1).footX + leaderChaseX + leaderX -
      (getOnboardingWorldRunnerPlacement("chaser", 1).footX + chaserChaseX + chaserOrbit.translateX[index])
  )
  assert.ok(
    Math.min(...orbitGapAtEachCheckpoint) >= ONBOARDING_SHARED_CHARACTER_WIDTH + 8,
    "the settled orbit must never let the character bounds touch"
  )
  assert.ok(orbitGapAtEachCheckpoint[2] < orbitGapAtEachCheckpoint[0])
  assert.ok(chaserOrbit.translateX[2] > leaderOrbit.translateX[2])
  assert.ok(leaderOrbit.translateX[2] <= 8)
  assert.ok(ONBOARDING_RUNNER_ORBIT_DURATION_MS <= 4_800)
  assert.ok(ONBOARDING_RUNNER_ORBIT_DURATION_MS < ONBOARDING_GLOBE_LOOP_DURATION_MS)
})

test("runner orbit starts only after the catch so no hidden progress can teleport the chaser", () => {
  const active = {
    isPaused: false,
    reduceMotion: false,
    isFocused: true,
    appState: "active" as const
  }

  assert.equal(shouldRunOnboardingRunnerOrbit({ ...active, phase: "chasing" }), false)
  assert.equal(shouldRunOnboardingRunnerOrbit({ ...active, phase: "catching" }), false)
  assert.equal(shouldRunOnboardingRunnerOrbit({ ...active, phase: "world-ready" }), true)
  assert.equal(shouldRunOnboardingRunnerOrbit({ ...active, phase: "handoff" }), true)
  assert.equal(shouldRunOnboardingRunnerOrbit({ ...active, phase: "world-ready", reduceMotion: true }), false)
})

test("runner poses settle into a grounded catch reaction then keep the live chase orbit running", () => {
  assert.deepEqual(getOnboardingRunnerPose("chaser", "landing"), {
    animationState: "settled",
    showGroundShadow: false
  })
  assert.deepEqual(getOnboardingRunnerPose("leader", "population-counting"), {
    animationState: "running",
    showGroundShadow: true
  })
  assert.deepEqual(getOnboardingRunnerPose("chaser", "chasing"), {
    animationState: "running",
    showGroundShadow: true
  })
  assert.equal(
    getOnboardingRunnerPose("leader", "catching").animationState,
    "reacting"
  )
  assert.equal(
    getOnboardingRunnerPose("chaser", "catching").animationState,
    "running"
  )
  assert.equal(
    getOnboardingRunnerPose("leader", "world-ready").animationState,
    "orbit-chase"
  )
  assert.equal(
    getOnboardingRunnerPose("chaser", "world-ready").animationState,
    "orbit-chase"
  )
  assert.equal(getOnboardingRunnerState("catching"), "reacting")
  assert.equal(getOnboardingRunnerState("world-ready"), "orbit-chase")
})

test("late or out-of-order animation callbacks cannot skip the story", () => {
  const prelude = { phase: "greeting", isPaused: false } as const
  const greeting = reduceOnboardingIntro(prelude, { type: "open-greeting" })
  const launching = reduceOnboardingIntro(greeting, { type: "reveal-world", reduceMotion: false })
  assert.strictEqual(reduceOnboardingIntro(prelude, { type: "chase-finished" }), prelude)
  assert.strictEqual(reduceOnboardingIntro(launching, { type: "launch-finished" }), launching)
  assert.strictEqual(reduceOnboardingIntro(launching, { type: "landing-finished" }), launching)

  const impact = reduceOnboardingIntro(launching, { type: "globe-impact" })
  assert.strictEqual(reduceOnboardingIntro(impact, { type: "population-finished" }), impact)
})

test("persisted intro completion resets to the cinematic greeting without a duplicate account screen", () => {
  const chasing = { phase: "chasing", isPaused: false } as const

  assert.deepEqual(reduceOnboardingIntro(chasing, { type: "intro-completed" }), {
    phase: "greeting",
    isPaused: false
  })
  assert.deepEqual(
    reduceOnboardingIntro({ phase: "world-ready", isPaused: true }, { type: "intro-completed" }),
    { phase: "greeting", isPaused: false }
  )
})

test("pausing preserves the phase and blocks callbacks until resumed", () => {
  const greeting = reduceOnboardingIntro(
    { phase: "greeting", isPaused: false },
    { type: "open-greeting" }
  )
  const launching = reduceOnboardingIntro(greeting, {
    type: "reveal-world",
    reduceMotion: false
  })
  const paused = reduceOnboardingIntro(launching, { type: "pause" })
  assert.deepEqual(paused, { phase: "globe-launching", isPaused: true })
  assert.strictEqual(reduceOnboardingIntro(paused, { type: "globe-impact" }), paused)
  assert.deepEqual(reduceOnboardingIntro(paused, { type: "resume" }), {
    phase: "globe-launching",
    isPaused: false
  })
  assert.deepEqual(launching, { phase: "globe-launching", isPaused: false })
})

test("continuous world motion starts with the globe and runs only while focused active and unpaused", () => {
  const activeWorld = {
    phase: "chasing",
    isPaused: false,
    reduceMotion: false,
    isFocused: true,
    appState: "active"
  } as const

  assert.equal(shouldRunOnboardingIntroMotion(activeWorld), true)
  assert.equal(
    shouldRunOnboardingIntroMotion({ ...activeWorld, phase: "globe-launching" }),
    true
  )
  assert.equal(
    shouldRunOnboardingIntroMotion({ ...activeWorld, phase: "population-counting" }),
    true
  )
  assert.equal(
    shouldRunOnboardingIntroMotion({ ...activeWorld, phase: "world-ready" }),
    true
  )
  assert.equal(
    shouldRunOnboardingIntroMotion({ ...activeWorld, reduceMotion: true }),
    false
  )
  assert.equal(
    shouldRunOnboardingIntroMotion({ ...activeWorld, isFocused: false }),
    false
  )
  assert.equal(
    shouldRunOnboardingIntroMotion({ ...activeWorld, appState: "background" }),
    false
  )
  assert.equal(
    shouldRunOnboardingIntroMotion({ ...activeWorld, isPaused: true }),
    false
  )
  assert.equal(
    shouldRunOnboardingIntroMotion({ ...activeWorld, phase: "greeting" }),
    false
  )
})

test("primary CTA is gated until the authored stable states", () => {
  assert.equal(isOnboardingIntroPrimaryActionEnabled("greeting"), true)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("character-greeting"), true)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("globe-launching"), false)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("impact"), false)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("airborne"), false)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("landing"), false)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("population-counting"), false)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("chasing"), false)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("catching"), false)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("world-ready"), true)
  assert.equal(isOnboardingIntroPrimaryActionEnabled("handoff"), false)
})

test("a failed handoff rolls back only the handoff phase to the ready CTA", () => {
  const handoff = { phase: "handoff", isPaused: false } as const
  const ready = { phase: "world-ready", isPaused: false } as const
  const chasing = { phase: "chasing", isPaused: false } as const

  assert.deepEqual(
    reduceOnboardingIntro(handoff, { type: "handoff-cancelled" }),
    ready
  )
  assert.strictEqual(
    reduceOnboardingIntro(ready, { type: "handoff-cancelled" }),
    ready
  )
  assert.strictEqual(
    reduceOnboardingIntro(chasing, { type: "handoff-cancelled" }),
    chasing
  )
})

test("the globe turns at a calm natural pace", () => {
  assert.ok(ONBOARDING_GLOBE_LOOP_DURATION_MS >= 12_000)
  assert.ok(ONBOARDING_GLOBE_LOOP_DURATION_MS <= 16_000)
})

test("the choreography metadata overlaps impact with launch and keeps every milestone ordered", () => {
  const timeline = ONBOARDING_INTRO_TIMELINE_MS

  assert.ok(timeline.impact > 0)
  assert.ok(timeline.impact < timeline.globeLaunchComplete)
  assert.ok(timeline.globeLaunchComplete - timeline.impact >= 240)
  assert.ok(timeline.globeLaunchComplete < timeline.airborneComplete)
  assert.ok(timeline.airborneComplete - timeline.globeLaunchComplete >= 540)
  assert.ok(timeline.airborneComplete < timeline.landingComplete)
  assert.ok(timeline.landingComplete - timeline.airborneComplete >= 120)
  assert.equal(
    timeline.landingComplete - timeline.impact,
    920,
    "the authored frames must stay continuous while the final landing hold is shortened"
  )
  assert.ok(timeline.landingComplete < timeline.populationComplete)
  assert.ok(timeline.populationComplete - timeline.landingComplete >= 620)
  assert.ok(timeline.populationComplete < timeline.chaseComplete)
  assert.ok(timeline.chaseComplete < timeline.catchComplete)
  assert.ok(timeline.chaseComplete - timeline.populationComplete >= 1_600)
  assert.ok(timeline.catchComplete - timeline.chaseComplete >= 480)
  assert.ok(timeline.catchComplete <= 5_800)
  assert.ok(timeline.handoffDuration >= 180)
  assert.ok(timeline.handoffDuration <= 220)
})

test("the world CTA waits long enough for the chase to read without overstaying", () => {
  const timeline = ONBOARDING_INTRO_TIMELINE_MS

  assert.ok(
    timeline.catchComplete <= 5_800,
    "the chase should remain readable while the first-launch cinematic stays under 5.8s"
  )
})

test("runner chase motion preserves a visible gap at the globe crown", () => {
  const leader = getOnboardingRunnerMotionTrack("leader")
  const chaser = getOnboardingRunnerMotionTrack("chaser")
  const finalCrownGap = Math.abs(chaser.translateX.at(-1)! - leader.translateX.at(-1)!)

  assert.ok(
    finalCrownGap >= 50,
    "the chase runner should stay visibly behind the leader at the globe crown"
  )
})

test("population copy and runners appear only after the globe launch completes", () => {
  assert.equal(shouldShowOnboardingPopulationCard("greeting"), false)
  assert.equal(shouldShowOnboardingPopulationCard("airborne"), false)
  assert.equal(shouldShowOnboardingPopulationCard("landing"), false)
  assert.equal(shouldShowOnboardingPopulationCard("population-counting"), true)
  assert.equal(shouldShowOnboardingPopulationCard("chasing"), true)
  assert.equal(shouldShowOnboardingPopulationCard("catching"), true)
  assert.equal(shouldShowOnboardingPopulationCard("world-ready"), true)

  assert.equal(shouldShowOnboardingRunners("globe-launching"), false)
  assert.equal(shouldShowOnboardingRunners("population-counting"), true)
  assert.equal(shouldShowOnboardingRunners("chasing"), true)
  assert.equal(shouldShowOnboardingRunners("catching"), true)
  assert.equal(shouldShowOnboardingRunners("world-ready"), true)
})

test("animation progress settles to the authored world state when reduced motion is enabled", () => {
  assert.deepEqual(
    getOnboardingIntroAnimationProgress("world-ready", true),
    { globeRise: 1, impact: 1, flight: 1, landing: 1, population: 1, chase: 1 }
  )
  assert.deepEqual(
    getOnboardingIntroAnimationProgress("airborne", true),
    { globeRise: 1, impact: 1, flight: 1, landing: 1, population: 1, chase: 1 }
  )
  assert.deepEqual(
    getOnboardingIntroAnimationProgress("chasing", false),
    { globeRise: 1, impact: 1, flight: 1, landing: 1, population: 1, chase: 0 }
  )
  assert.deepEqual(
    getOnboardingIntroAnimationProgress("landing", false),
    { globeRise: 1, impact: 1, flight: 1, landing: 0, population: 0, chase: 0 }
  )
  assert.deepEqual(
    getOnboardingIntroAnimationProgress("greeting", false),
    { globeRise: 0, impact: 0, flight: 0, landing: 0, population: 0, chase: 0 }
  )
})
