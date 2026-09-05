import assert from "node:assert/strict"
import test from "node:test"
import {
  ONBOARDING_BRAND_PRELUDE_TIMELINE_MS,
  createOnboardingBrandPreludeState,
  getOnboardingBrandPreludeBeatAtElapsed,
  getOnboardingBootGateRemainingMs,
  getOnboardingBootPreludeElapsedSnapshotMs,
  getOnboardingPreludeMountElapsedMs,
  getOnboardingBrandPreludeProgressAtElapsed,
  getRemainingPreludeBeatDelay,
  getRemainingPreludeDuration,
  isOnboardingBrandPreludeInteractive,
  reduceOnboardingBrandPrelude,
  shouldReduceOnboardingBootMotion
} from "./onboardingBrandPreludeModel"

test("the prelude advances only through scan, brand, character entrance, then idle-ready", () => {
  const scanning = createOnboardingBrandPreludeState(false)
  const logo = reduceOnboardingBrandPrelude(scanning, { type: "scan-finished" })
  const composition = reduceOnboardingBrandPrelude(logo, { type: "logo-revealed" })
  const wave = reduceOnboardingBrandPrelude(composition, { type: "composition-finished" })
  const ready = reduceOnboardingBrandPrelude(wave, { type: "wave-finished" })

  assert.equal(scanning.beat, "scanning")
  assert.equal(logo.beat, "brand-reveal")
  assert.equal(composition.beat, "character-entrance")
  assert.equal(wave.beat, "idle-ready")
  assert.equal(ready.beat, "idle-ready")
  assert.equal(isOnboardingBrandPreludeInteractive(ready), true)
})

test("resuming a prelude beat preserves progress and only runs its remaining time", () => {
  assert.equal(getRemainingPreludeDuration(900, 0), 900)
  assert.equal(getRemainingPreludeDuration(900, 0.4), 540)
  assert.equal(getRemainingPreludeDuration(900, 1), 1)
  assert.equal(getRemainingPreludeDuration(900, 1.4), 1)
  assert.equal(getRemainingPreludeBeatDelay({
    elapsedMs: 0,
    revealDurationMs: 420,
    holdDurationMs: 260
  }), 260)
  assert.equal(getRemainingPreludeBeatDelay({
    elapsedMs: 420,
    revealDurationMs: 420,
    holdDurationMs: 260
  }), 260)
  assert.equal(getRemainingPreludeBeatDelay({
    elapsedMs: 548,
    revealDurationMs: 420,
    holdDurationMs: 260
  }), 132)
  assert.equal(getRemainingPreludeBeatDelay({
    elapsedMs: 840,
    revealDurationMs: 420,
    holdDurationMs: 260
  }), 1)
})

test("late or out-of-order callbacks cannot skip the branded story", () => {
  const scanning = createOnboardingBrandPreludeState(false)
  const logo = reduceOnboardingBrandPrelude(scanning, { type: "scan-finished" })

  assert.strictEqual(
    reduceOnboardingBrandPrelude(scanning, { type: "composition-finished" }),
    scanning
  )
  assert.strictEqual(
    reduceOnboardingBrandPrelude(logo, { type: "wave-finished" }),
    logo
  )
})

test("reduced motion renders the final pair and unlocks the CTA without motion", () => {
  const state = createOnboardingBrandPreludeState(true)
  assert.deepEqual(state, { beat: "idle-ready", reduceMotion: true })
  assert.equal(isOnboardingBrandPreludeInteractive(state), true)
})

test("the absolute timeline gives the scan room to breathe before the CTA system becomes usable", () => {
  assert.equal(getOnboardingBrandPreludeBeatAtElapsed(0), "scanning")
  assert.equal(getOnboardingBrandPreludeBeatAtElapsed(1_949), "scanning")
  assert.equal(getOnboardingBrandPreludeBeatAtElapsed(1_950), "brand-reveal")
  assert.equal(getOnboardingBrandPreludeBeatAtElapsed(2_249), "brand-reveal")
  assert.equal(getOnboardingBrandPreludeBeatAtElapsed(2_250), "character-entrance")
  assert.equal(getOnboardingBrandPreludeBeatAtElapsed(2_849), "character-entrance")
  assert.equal(getOnboardingBrandPreludeBeatAtElapsed(2_850), "idle-ready")
  assert.equal(getOnboardingBrandPreludeBeatAtElapsed(3_130), "idle-ready")
})

test("the authored prelude keeps scan, brand, character entrance, and CTA as readable sequential beats", () => {
  const timeline = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS
  assert.ok(timeline.scanSweepComplete >= 1_650)
  assert.ok(timeline.scanDissolveComplete <= timeline.brandRevealStart)
  assert.ok(timeline.brandRevealComplete <= timeline.characterEntranceStart)
  assert.equal(timeline.secondaryCtaStart, 0)
  assert.ok(timeline.secondaryCtaComplete <= 220)
  assert.ok(timeline.characterEntranceStart < timeline.primaryCtaStart)
  assert.ok(timeline.primaryCtaStart >= timeline.characterEntranceStart)
  assert.ok(timeline.primaryCtaStart <= 2_650)
  assert.ok(timeline.primaryCtaComplete <= 2_820)
  assert.ok(timeline.interactive <= 2_900)
  assert.equal(timeline.exitToWorld, 240)
})

test("loading owns the complete scan, then hands off at the brand reveal", () => {
  assert.equal(getOnboardingBootPreludeElapsedSnapshotMs(1_000, null), 0)
  assert.equal(getOnboardingBootPreludeElapsedSnapshotMs(1_850, 1_000), 850)
  assert.equal(getOnboardingPreludeMountElapsedMs(0), 0)
  assert.equal(getOnboardingPreludeMountElapsedMs(120), 120)
  assert.equal(getOnboardingPreludeMountElapsedMs(2_400), 1_950)
  assert.equal(getOnboardingPreludeMountElapsedMs(9_000), 1_950)

  assert.equal(getOnboardingBootGateRemainingMs(0, false), 1_950)
  assert.equal(getOnboardingBootGateRemainingMs(1_750, false), 200)
  assert.equal(getOnboardingBootGateRemainingMs(2_400, false), 0)
  assert.equal(getOnboardingBootGateRemainingMs(0, true), 0)
})

test("unresolved motion preference keeps the boot scan alive and the gate closed", () => {
  assert.equal(shouldReduceOnboardingBootMotion(false, true), false)
  assert.equal(shouldReduceOnboardingBootMotion(false, false), false)
  assert.equal(shouldReduceOnboardingBootMotion(true, true), true)
  assert.equal(shouldReduceOnboardingBootMotion(true, false), false)

  assert.equal(getOnboardingBootGateRemainingMs(0, true, false), null)
  assert.equal(getOnboardingBootGateRemainingMs(2_400, false, false), null)
  assert.equal(getOnboardingBootGateRemainingMs(0, true, true), 0)
})

test("hydration hands the loading scan into the mounted prelude without restarting progress", () => {
  assert.deepEqual(getOnboardingBrandPreludeProgressAtElapsed(0), {
    scanRows: 0,
    scanSweep: 0,
    scanOpacity: 1,
    brand: 0,
    characters: 0
  })
  assert.deepEqual(getOnboardingBrandPreludeProgressAtElapsed(1_750), {
    scanRows: 1,
    scanSweep: 1,
    scanOpacity: 0.8,
    brand: 0,
    characters: 0
  })
  assert.deepEqual(getOnboardingBrandPreludeProgressAtElapsed(3_130), {
    scanRows: 1,
    scanSweep: 1,
    scanOpacity: 0,
    brand: 1,
    characters: 1
  })
})
