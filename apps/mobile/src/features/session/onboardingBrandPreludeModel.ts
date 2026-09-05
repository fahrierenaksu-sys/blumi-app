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

export function getOnboardingBootGateRemainingMs(
  elapsedMs: number,
  reduceMotion: boolean,
  motionPreferenceResolved = true
): number | null {
  if (!motionPreferenceResolved) return null
  if (reduceMotion) return 0
  return Math.max(
    0,
    ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.scanDissolveComplete -
      Math.max(0, elapsedMs)
  )
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
