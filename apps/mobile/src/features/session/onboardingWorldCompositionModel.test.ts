import assert from "node:assert/strict"
import test from "node:test"
import {
  ONBOARDING_GREETING_PAIR_LAYER_BOTTOM_IN_STAGE,
  ONBOARDING_SHARED_CHARACTER_BASELINE_FROM_SCENE_CENTER,
  ONBOARDING_SHARED_CHARACTER_HEIGHT,
  ONBOARDING_SHARED_CHARACTER_STAGE_OFFSET,
  ONBOARDING_SHARED_CHARACTER_WIDTH,
  ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y,
  ONBOARDING_WORLD_GLOBE_TOP_IN_STAGE,
  ONBOARDING_WORLD_GLOBE_ENTRY_OFFSET_MULTIPLIER,
  ONBOARDING_WORLD_GLOBE_INITIAL_OPACITY,
  ONBOARDING_WORLD_HERO_BOTTOM_IN_STAGE,
  ONBOARDING_WORLD_STAGE_HEIGHT,
  ONBOARDING_WORLD_FLIGHT,
  ONBOARDING_WORLD_COMPOSITION_LIFT,
  ONBOARDING_RUNNER_SURFACE_EMBED,
  ONBOARDING_WORLD_RUNNER_PROGRESS,
  ONBOARDING_WORLD_SCENE_LIFT,
  getOnboardingWorldLayout,
  getOnboardingWorldRunnerPlacement,
  getOnboardingWorldSurfaceY
} from "./onboardingWorldCompositionModel"

test("the globe begins at the CTA rail instead of spending the handoff off-screen", () => {
  assert.ok(ONBOARDING_WORLD_GLOBE_ENTRY_OFFSET_MULTIPLIER >= 0.5)
  assert.ok(ONBOARDING_WORLD_GLOBE_ENTRY_OFFSET_MULTIPLIER <= 0.68)
  assert.ok(ONBOARDING_WORLD_GLOBE_INITIAL_OPACITY >= 0.1)
  assert.ok(ONBOARDING_WORLD_GLOBE_INITIAL_OPACITY <= 0.2)
})

test("the approved flip keeps its original world-stage anchor", () => {
  const heroTopFromSceneCenter =
    ONBOARDING_SHARED_CHARACTER_STAGE_OFFSET +
    ONBOARDING_WORLD_STAGE_HEIGHT -
    ONBOARDING_WORLD_HERO_BOTTOM_IN_STAGE -
    ONBOARDING_SHARED_CHARACTER_HEIGHT
  const heroBaselineFromSceneCenter =
    heroTopFromSceneCenter + ONBOARDING_SHARED_CHARACTER_HEIGHT
  const globeCrownFromSceneCenter =
    ONBOARDING_SHARED_CHARACTER_STAGE_OFFSET + ONBOARDING_WORLD_GLOBE_TOP_IN_STAGE

  assert.equal(ONBOARDING_SHARED_CHARACTER_WIDTH, 108)
  assert.equal(ONBOARDING_SHARED_CHARACTER_HEIGHT, 178)
  assert.equal(ONBOARDING_WORLD_HERO_BOTTOM_IN_STAGE, 306)
  assert.equal(heroTopFromSceneCenter, 10)
  assert.equal(ONBOARDING_SHARED_CHARACTER_BASELINE_FROM_SCENE_CENTER, 188)
  assert.equal(
    heroBaselineFromSceneCenter,
    ONBOARDING_SHARED_CHARACTER_BASELINE_FROM_SCENE_CENTER
  )
  assert.equal(heroBaselineFromSceneCenter - globeCrownFromSceneCenter, 16)
  assert.equal(ONBOARDING_GREETING_PAIR_LAYER_BOTTOM_IN_STAGE, 9)
  assert.equal(ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y, 27)
})

test("all cinematic phases share one viewport-safe upward alignment", () => {
  assert.equal(ONBOARDING_WORLD_SCENE_LIFT.compact, -28)
  assert.equal(ONBOARDING_WORLD_SCENE_LIFT.regular, -32)
})

test("the globe and airborne pair recenter as one composition only after contact", () => {
  assert.deepEqual(ONBOARDING_WORLD_COMPOSITION_LIFT.inputRange, [0, 0.12, 0.46, 0.78, 1])
  assert.deepEqual(ONBOARDING_WORLD_COMPOSITION_LIFT.translateY, [0, -16, -72, -116, -144])
  assert.equal(ONBOARDING_WORLD_COMPOSITION_LIFT.translateY[0], 0)
  assert.ok(ONBOARDING_WORLD_COMPOSITION_LIFT.translateY.at(-1)! < -100)
})

test("the premium world composition keeps editorial copy, globe, and CTA rail separated", () => {
  for (const viewport of [
    { width: 440, height: 956, compact: false },
    { width: 390, height: 844, compact: true }
  ]) {
    const layout = getOnboardingWorldLayout(viewport)

    assert.equal(layout.statSurface, "editorial")
    assert.ok(layout.globeSize >= (viewport.compact ? 252 : 296))
    assert.ok(layout.statBottom + 36 <= layout.worldTop)
    assert.ok(layout.worldBottom + 64 <= layout.ctaTop)
  }
})

test("both runners land on the same curved crown and settle with readable separation", () => {
  assert.ok(ONBOARDING_RUNNER_SURFACE_EMBED >= 6)
  assert.ok(ONBOARDING_RUNNER_SURFACE_EMBED <= 10)
  for (const progress of ONBOARDING_WORLD_RUNNER_PROGRESS) {
    const leader = getOnboardingWorldRunnerPlacement("leader", progress)
    const chaser = getOnboardingWorldRunnerPlacement("chaser", progress)

    assert.equal(leader.footY, leader.surfaceY)
    assert.equal(chaser.footY, chaser.surfaceY)
    assert.equal(leader.surfaceY, getOnboardingWorldSurfaceY(leader.footX))
    assert.equal(chaser.surfaceY, getOnboardingWorldSurfaceY(chaser.footX))
  }

  const leaderStart = getOnboardingWorldRunnerPlacement("leader", 0)
  const chaserStart = getOnboardingWorldRunnerPlacement("chaser", 0)
  const leaderReady = getOnboardingWorldRunnerPlacement("leader", 1)
  const chaserReady = getOnboardingWorldRunnerPlacement("chaser", 1)
  const globeRadius = 304 / 2
  const expectedLeaderSurface = globeRadius - Math.sqrt(
    globeRadius * globeRadius - leaderReady.footX * leaderReady.footX
  ) + 1
  const expectedChaserSurface = globeRadius - Math.sqrt(
    globeRadius * globeRadius - chaserReady.footX * chaserReady.footX
  ) + 1
  const readyGap = leaderReady.footX - chaserReady.footX
  assert.deepEqual([leaderStart.footX, leaderReady.footX], [66, 44])
  assert.deepEqual([chaserStart.footX, chaserReady.footX], [-74, -62])
  assert.equal(Math.abs(leaderReady.footX - leaderStart.footX), 22)
  assert.equal(Math.abs(chaserReady.footX - chaserStart.footX), 12)
  assert.equal(readyGap, 106)
  assert.ok(Math.abs(leaderReady.surfaceY - expectedLeaderSurface) <= 0.01)
  assert.ok(Math.abs(chaserReady.surfaceY - expectedChaserSurface) <= 0.01)
  assert.ok(Math.abs(getOnboardingWorldSurfaceY(44) - expectedLeaderSurface) <= 0.01)
  assert.ok(leaderReady.surfaceY <= 22)
  assert.ok(chaserReady.surfaceY <= 22)
})

test("the impact arc is cinematic without throwing the pair outside the scene", () => {
  assert.deepEqual(ONBOARDING_WORLD_FLIGHT.inputRange, [0, 0.18, 0.32, 0.74, 1])
  assert.ok(Math.abs(Math.min(...ONBOARDING_WORLD_FLIGHT.male.translateY)) <= 360)
  assert.ok(Math.abs(Math.min(...ONBOARDING_WORLD_FLIGHT.female.translateY)) <= 380)
  assert.ok(Math.max(...ONBOARDING_WORLD_FLIGHT.male.scale) <= 1.04)
  assert.ok(Math.max(...ONBOARDING_WORLD_FLIGHT.female.scale) <= 1.04)
})
