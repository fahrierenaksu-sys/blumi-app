export type OnboardingBrandPreludeBeat =
  | "scanning"
  | "brand-reveal"
  | "character-entrance"
  | "idle-ready"
  | "exiting-to-world"

export interface OnboardingBrandPreludeState {
  beat: OnboardingBrandPreludeBeat
  reduceMotion: boolean
}

export type OnboardingBrandPreludeEvent =
  | { type: "scan-finished" }
  | { type: "logo-revealed" }
  | { type: "composition-finished" }
  | { type: "wave-finished" }

export const ONBOARDING_BRAND_PRELUDE_TIMELINE_MS = Object.freeze({
  scanRowsComplete: 800,
  scanSweepStart: 250,
  scanSweepComplete: 1_750,
  scanDissolveStart: 1_700,
  scanDissolveComplete: 1_950,
  brandRevealStart: 1_950,
  brandRevealComplete: 2_250,
  characterEntranceStart: 2_250,
  characterEntranceComplete: 2_850,
  idleStart: 2_850,
  secondaryCtaStart: 0,
  secondaryCtaComplete: 220,
  primaryCtaStart: 2_580,
  primaryCtaComplete: 2_780,
  interactive: 2_860,
  exitToWorld: 240,
  scanDuration: 1_750,
  logoRevealDuration: 300,
  logoHoldDuration: 0,
  communityRevealDuration: 1_500,
  communityHoldDuration: 0,
  waveFrameDuration: 135,
  maleWaveOffset: 90,
  ctaSettleDelay: 0
})

let onboardingBootStartedAtMs: number | null = null

export function hydrateOnboardingBootPreludeStart(
  nativeStartedAtMs: number | null,
  nowMs = Date.now()
): number {
  if (
    nativeStartedAtMs !== null &&
    Number.isFinite(nativeStartedAtMs) &&
    nativeStartedAtMs > 0 &&
    nativeStartedAtMs <= nowMs
  ) {
    onboardingBootStartedAtMs = onboardingBootStartedAtMs === null
      ? nativeStartedAtMs
      : Math.min(onboardingBootStartedAtMs, nativeStartedAtMs)
  }
  return beginOnboardingBootPrelude(nowMs)
}

function timelineProgress(elapsedMs: number, startMs: number, endMs: number): number {
  if (elapsedMs <= startMs) return 0
  if (elapsedMs >= endMs) return 1
  return (elapsedMs - startMs) / (endMs - startMs)
}

export interface OnboardingBrandPreludeProgress {
  scanRows: number
  scanSweep: number
  scanOpacity: number
  brand: number
  characters: number
}

export function getOnboardingPreludeMountElapsedMs(bootElapsedMs: number): number {
  // The loading surface owns the scan. The mounted onboarding scene resumes
  // exactly at the brand reveal, but never consumes the branded entrance while
  // storage hydration is still finishing in the background.
  return Math.min(
    Math.max(0, bootElapsedMs),
    ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.scanDissolveComplete
  )
}

export function shouldReduceOnboardingBootMotion(
  motionPreferenceResolved: boolean,
  reduceMotion: boolean
): boolean {
  return motionPreferenceResolved && reduceMotion
}

/** Shortest scan dissolve the loading surface plays before the prelude mounts. */
export const ONBOARDING_BOOT_MIN_DISSOLVE_MS = 180

export interface OnboardingBootDissolvePlan {
  delayMs: number
  durationMs: number
}

/**
 * The loading surface dissolves its own scan before it hands off to the
 * prelude. The prelude draws the scan lifted above the action rail, so a
 * handoff while the characters are still visible would move the whole grid;
 * dissolving on the loading surface keeps the six characters in place.
 * A late handoff (slow hydration) still plays a full dissolve, never a cut.
 */
export function getOnboardingBootDissolvePlan(
  elapsedMs: number
): OnboardingBootDissolvePlan {
  const { scanDissolveStart, scanDissolveComplete } =
    ONBOARDING_BRAND_PRELUDE_TIMELINE_MS
  const elapsed = Math.max(0, elapsedMs)
  if (elapsed <= scanDissolveStart) {
    return {
      delayMs: scanDissolveStart - elapsed,
      durationMs: scanDissolveComplete - scanDissolveStart
    }
  }
  if (elapsed < scanDissolveComplete) {
    return {
      delayMs: 0,
      durationMs: Math.max(
        ONBOARDING_BOOT_MIN_DISSOLVE_MS,
        scanDissolveComplete - elapsed
      )
    }
  }
  return {
    delayMs: 0,
    durationMs: scanDissolveComplete - scanDissolveStart
  }
}

export function getOnboardingBootGateRemainingMs(
  elapsedMs: number,
  reduceMotion: boolean,
  motionPreferenceResolved = true
): number | null {
  if (!motionPreferenceResolved) return null
  if (reduceMotion) return 0
  const plan = getOnboardingBootDissolvePlan(elapsedMs)
  return plan.delayMs + plan.durationMs
}

/** How long after the boot surface leaves a loading scan may still resume it. */
export const ONBOARDING_BOOT_RESUME_WINDOW_MS = 1_000

let mountedBootSurfaces = 0
let bootSurfaceVisibleUntilMs: number | null = null

/** Called by the boot loading surface while it is on screen; returns its release. */
export function markOnboardingBootSurfaceVisible(): () => void {
  mountedBootSurfaces += 1
  let released = false
  return () => {
    if (released) return
    released = true
    mountedBootSurfaces = Math.max(0, mountedBootSurfaces - 1)
    bootSurfaceVisibleUntilMs = Date.now()
  }
}

export function readOnboardingBootSurfaceHandoff(): {
  bootSurfaceVisible: boolean
  bootSurfaceVisibleUntilMs: number | null
} {
  return {
    bootSurfaceVisible: mountedBootSurfaces > 0,
    bootSurfaceVisibleUntilMs
  }
}

/**
 * A loading scan that takes over directly from the boot surface (cold start
 * into Discover) continues the same clock and skips its image gate, because
 * the same images are on screen. Later scans (sign-in) start fresh.
 */
export function getOnboardingLoadingScanResume(input: {
  nowMs: number
  bootSurfaceVisible: boolean
  bootSurfaceVisibleUntilMs: number | null
  bootElapsedMs: number
}): { startElapsedMs: number; resumesBootScan: boolean } {
  const handsOver = input.bootSurfaceVisible || (
    input.bootSurfaceVisibleUntilMs !== null &&
    input.nowMs - input.bootSurfaceVisibleUntilMs <= ONBOARDING_BOOT_RESUME_WINDOW_MS
  )
  if (!handsOver) return { startElapsedMs: 0, resumesBootScan: false }
  return {
    startElapsedMs: Math.min(
      Math.max(0, input.bootElapsedMs),
      ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.scanDissolveComplete
    ),
    resumesBootScan: true
  }
}

export function beginOnboardingBootPrelude(nowMs = Date.now()): number {
  if (onboardingBootStartedAtMs === null) {
    onboardingBootStartedAtMs = nowMs
  }
  return onboardingBootStartedAtMs
}

export function getOnboardingBootPreludeElapsedMs(nowMs = Date.now()): number {
  const startedAtMs = beginOnboardingBootPrelude(nowMs)
  return getOnboardingBootPreludeElapsedSnapshotMs(nowMs, startedAtMs)
}

export function getOnboardingBootPreludeElapsedSnapshotMs(
  nowMs = Date.now(),
  startedAtMs = onboardingBootStartedAtMs
): number {
  if (startedAtMs === null) return 0
  return Math.max(
    0,
    Math.min(
      ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.interactive,
      nowMs - startedAtMs
    )
  )
}

export function getOnboardingBrandPreludeProgressAtElapsed(
  elapsedMs: number
): OnboardingBrandPreludeProgress {
  const timeline = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS
  return {
    scanRows: timelineProgress(elapsedMs, 0, timeline.scanRowsComplete),
    scanSweep: timelineProgress(elapsedMs, timeline.scanSweepStart, timeline.scanSweepComplete),
    scanOpacity: 1 - timelineProgress(
      elapsedMs,
      timeline.scanDissolveStart,
      timeline.scanDissolveComplete
    ),
    brand: timelineProgress(elapsedMs, timeline.brandRevealStart, timeline.brandRevealComplete),
    characters: timelineProgress(
      elapsedMs,
      timeline.characterEntranceStart,
      timeline.characterEntranceComplete
    )
  }
}

export function getOnboardingBrandPreludeBeatAtElapsed(
  elapsedMs: number
): OnboardingBrandPreludeBeat {
  if (elapsedMs < ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.brandRevealStart) {
    return "scanning"
  }
  if (elapsedMs < ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.characterEntranceStart) {
    return "brand-reveal"
  }
  if (elapsedMs < ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.idleStart) {
    return "character-entrance"
  }
  return "idle-ready"
}

export function getRemainingPreludeDuration(
  totalDuration: number,
  progress: number
): number {
  const remainingProgress = 1 - Math.max(0, Math.min(1, progress))
  return Math.max(1, Math.round(totalDuration * remainingProgress))
}

export function getRemainingPreludeBeatDelay({
  elapsedMs,
  revealDurationMs,
  holdDurationMs
}: {
  elapsedMs: number
  revealDurationMs: number
  holdDurationMs: number
}): number {
  const elapsedHoldMs = Math.max(0, elapsedMs - revealDurationMs)
  return Math.max(1, Math.round(holdDurationMs - elapsedHoldMs))
}

export function createOnboardingBrandPreludeState(
  reduceMotion: boolean
): OnboardingBrandPreludeState {
  return {
    beat: reduceMotion ? "idle-ready" : "scanning",
    reduceMotion
  }
}

export function reduceOnboardingBrandPrelude(
  state: OnboardingBrandPreludeState,
  event: OnboardingBrandPreludeEvent
): OnboardingBrandPreludeState {
  if (event.type === "scan-finished" && state.beat === "scanning") {
    return { ...state, beat: "brand-reveal" }
  }
  if (event.type === "logo-revealed" && state.beat === "brand-reveal") {
    return { ...state, beat: "character-entrance" }
  }
  if (event.type === "composition-finished" && state.beat === "character-entrance") {
    return { ...state, beat: "idle-ready" }
  }
  if (event.type === "wave-finished" && state.beat === "idle-ready") {
    return state
  }
  return state
}

export function isOnboardingBrandPreludeInteractive(
  state: OnboardingBrandPreludeState
): boolean {
  return state.beat === "idle-ready"
}
