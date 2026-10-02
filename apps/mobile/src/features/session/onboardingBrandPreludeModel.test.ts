import assert from "node:assert/strict"
import test from "node:test"
import {
  ONBOARDING_BOOT_MIN_DISSOLVE_MS,
  ONBOARDING_BRAND_PRELUDE_TIMELINE_MS,
  getOnboardingBootDissolvePlan,
  getOnboardingLoadingScanResume,
  getOnboardingBootGateRemainingMs,
  getOnboardingBootPreludeElapsedSnapshotMs,
  getOnboardingPreludeMountElapsedMs,
  getOnboardingBrandPreludeProgressAtElapsed,
  shouldReduceOnboardingBootMotion
} from "./onboardingBrandPreludeModel"

const DISSOLVE_START = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.scanDissolveStart
const DISSOLVE_END = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.scanDissolveComplete
const DISSOLVE_MS = DISSOLVE_END - DISSOLVE_START

test("loading owns the complete scan, then hands off at the brand reveal", () => {
  assert.equal(getOnboardingBootPreludeElapsedSnapshotMs(1_000, null), 0)
  assert.equal(getOnboardingBootPreludeElapsedSnapshotMs(1_850, 1_000), 850)
  assert.equal(getOnboardingPreludeMountElapsedMs(0), 0)
  assert.equal(getOnboardingPreludeMountElapsedMs(120), 120)
  assert.equal(getOnboardingPreludeMountElapsedMs(DISSOLVE_END + 450), DISSOLVE_END)
  assert.equal(getOnboardingPreludeMountElapsedMs(DISSOLVE_END + 7_000), DISSOLVE_END)

  assert.equal(getOnboardingBootGateRemainingMs(0, false), DISSOLVE_END)
  assert.equal(
    getOnboardingBootGateRemainingMs(DISSOLVE_END - 200, false),
    Math.max(ONBOARDING_BOOT_MIN_DISSOLVE_MS, 200)
  )
  assert.equal(getOnboardingBootGateRemainingMs(0, true), 0)
})

test("the loading surface always dissolves the scan before the prelude mounts", () => {
  // On schedule: the dissolve runs on the shared clock.
  assert.deepEqual(getOnboardingBootDissolvePlan(0), { delayMs: DISSOLVE_START, durationMs: DISSOLVE_MS })
  assert.deepEqual(getOnboardingBootDissolvePlan(DISSOLVE_START - 500), { delayMs: 500, durationMs: DISSOLVE_MS })
  assert.deepEqual(getOnboardingBootDissolvePlan(DISSOLVE_START), { delayMs: 0, durationMs: DISSOLVE_MS })
  // Mid-dissolve handoff keeps the schedule but never shortens it to a cut.
  const midDissolve = DISSOLVE_START + Math.floor((DISSOLVE_MS - ONBOARDING_BOOT_MIN_DISSOLVE_MS) / 2)
  assert.deepEqual(getOnboardingBootDissolvePlan(midDissolve), {
    delayMs: 0,
    durationMs: Math.max(ONBOARDING_BOOT_MIN_DISSOLVE_MS, DISSOLVE_END - midDissolve)
  })
  assert.deepEqual(getOnboardingBootDissolvePlan(DISSOLVE_END - 10), {
    delayMs: 0,
    durationMs: ONBOARDING_BOOT_MIN_DISSOLVE_MS
  })
  // Slow hydration: the characters were still on screen, so play a full dissolve.
  assert.deepEqual(getOnboardingBootDissolvePlan(DISSOLVE_END + 450), { delayMs: 0, durationMs: DISSOLVE_MS })
  assert.deepEqual(getOnboardingBootDissolvePlan(-50), { delayMs: DISSOLVE_START, durationMs: DISSOLVE_MS })

  // The gate opens exactly when the dissolve ends.
  assert.equal(getOnboardingBootGateRemainingMs(DISSOLVE_END - 10, false), ONBOARDING_BOOT_MIN_DISSOLVE_MS)
  assert.equal(getOnboardingBootGateRemainingMs(DISSOLVE_END + 450, false), DISSOLVE_MS)
  assert.equal(getOnboardingBootGateRemainingMs(DISSOLVE_END + 450, true), 0)
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

test("a resumed loading scan continues from the shared clock only right after the boot surface", () => {
  const scan = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS
  // The boot surface is still on screen or just left: resume, skip the image gate.
  assert.deepEqual(
    getOnboardingLoadingScanResume({ nowMs: 5_000, bootSurfaceVisibleUntilMs: null, bootSurfaceVisible: true, bootElapsedMs: 900 }),
    { startElapsedMs: 900, resumesBootScan: true }
  )
  assert.deepEqual(
    getOnboardingLoadingScanResume({ nowMs: 5_000, bootSurfaceVisibleUntilMs: 4_800, bootSurfaceVisible: false, bootElapsedMs: 1_200 }),
    { startElapsedMs: 1_200, resumesBootScan: true }
  )
  // Past the dissolve the resumed scan rests complete, it never replays.
  assert.deepEqual(
    getOnboardingLoadingScanResume({ nowMs: 5_000, bootSurfaceVisibleUntilMs: null, bootSurfaceVisible: true, bootElapsedMs: 2_860 }),
    { startElapsedMs: scan.scanDissolveComplete, resumesBootScan: true }
  )
  // Long after the boot surface (sign-in, account switch): a fresh scan with the image gate.
  assert.deepEqual(
    getOnboardingLoadingScanResume({ nowMs: 9_000, bootSurfaceVisibleUntilMs: 4_800, bootSurfaceVisible: false, bootElapsedMs: 2_860 }),
    { startElapsedMs: 0, resumesBootScan: false }
  )
  assert.deepEqual(
    getOnboardingLoadingScanResume({ nowMs: 9_000, bootSurfaceVisibleUntilMs: null, bootSurfaceVisible: false, bootElapsedMs: 0 }),
    { startElapsedMs: 0, resumesBootScan: false }
  )
})
