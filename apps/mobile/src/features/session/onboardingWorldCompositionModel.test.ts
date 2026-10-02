import assert from "node:assert/strict"
import test from "node:test"
import {
  ONBOARDING_WORLD_FLIGHT,
  ONBOARDING_WORLD_RUNNER_PROGRESS,
  getOnboardingWorldLayout,
  getOnboardingWorldRunnerPlacement,
  getOnboardingWorldSurfaceY
} from "./onboardingWorldCompositionModel"

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

test("both runners land on the same curved crown and keep their order", () => {
  for (const progress of ONBOARDING_WORLD_RUNNER_PROGRESS) {
    const leader = getOnboardingWorldRunnerPlacement("leader", progress)
    const chaser = getOnboardingWorldRunnerPlacement("chaser", progress)

    assert.equal(leader.footY, leader.surfaceY)
    assert.equal(chaser.footY, chaser.surfaceY)
    assert.equal(leader.surfaceY, getOnboardingWorldSurfaceY(leader.footX))
    assert.equal(chaser.surfaceY, getOnboardingWorldSurfaceY(chaser.footX))
  }

  const leaderReady = getOnboardingWorldRunnerPlacement("leader", 1)
  const chaserReady = getOnboardingWorldRunnerPlacement("chaser", 1)
  const globeRadius = 304 / 2
  const expectedLeaderSurface = globeRadius - Math.sqrt(
    globeRadius * globeRadius - leaderReady.footX * leaderReady.footX
  ) + 1
  const expectedChaserSurface = globeRadius - Math.sqrt(
    globeRadius * globeRadius - chaserReady.footX * chaserReady.footX
  ) + 1
  assert.ok(Math.abs(leaderReady.surfaceY - expectedLeaderSurface) <= 0.01)
  assert.ok(Math.abs(chaserReady.surfaceY - expectedChaserSurface) <= 0.01)
  assert.ok(leaderReady.footX > chaserReady.footX)
})

test("the impact arc is cinematic without throwing the pair outside the scene", () => {
  assert.ok(Math.abs(Math.min(...ONBOARDING_WORLD_FLIGHT.male.translateY)) <= 360)
  assert.ok(Math.abs(Math.min(...ONBOARDING_WORLD_FLIGHT.female.translateY)) <= 380)
  assert.ok(Math.max(...ONBOARDING_WORLD_FLIGHT.male.scale) <= 1.04)
  assert.ok(Math.max(...ONBOARDING_WORLD_FLIGHT.female.scale) <= 1.04)
})
