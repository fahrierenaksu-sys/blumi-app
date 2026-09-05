import type { OnboardingIntroPhase } from "./onboardingIntroModel"

export type OnboardingArrivalRole = "female" | "male"

export const ONBOARDING_ARRIVAL_FRAME_COUNT = 30
export const ONBOARDING_ARRIVAL_DURATION_MS = 920
export const ONBOARDING_ARRIVAL_PREROLL_MS = 0

export const ONBOARDING_ARRIVAL_BEATS = Object.freeze({
  impact: 0,
  launchStretch: 0.12,
  tuck: 0.28,
  inverted: 0.46,
  open: 0.64,
  landingPrep: 0.78,
  landingSquash: 0.9,
  runReady: 1
})

// Keep the greeting pose upright until contact. The authored reaction begins
// on the same clock tick as the globe impact, then crossfades immediately.
export const ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS = Object.freeze({
  start: 0.88,
  complete: 0.91
})

export const ONBOARDING_ARRIVAL_IMPACT_START_FRAME_INDEX = Object.freeze({
  female: 3,
  male: 3
} satisfies Record<OnboardingArrivalRole, number>)

export const ONBOARDING_ARRIVAL_FRAME_VISIBILITY_START_PROGRESS =
  ONBOARDING_ARRIVAL_BEATS.launchStretch

const ARRIVAL_PROGRESS = Object.values(ONBOARDING_ARRIVAL_BEATS)

const ARRIVAL_FRAME_PHASES: ReadonlySet<OnboardingIntroPhase> = new Set([
  "impact",
  "airborne",
  "landing"
])

const UNIFIED_ACTOR_PHASES: ReadonlySet<OnboardingIntroPhase> = new Set([
  "globe-launching",
  "impact",
  "airborne",
  "landing",
  "population-counting",
  "chasing",
  "catching",
  "world-ready",
  "handoff"
])

const RUNNER_CROWN_MASK_PHASES: ReadonlySet<OnboardingIntroPhase> = new Set([
  "population-counting",
  "chasing",
  "catching",
  "world-ready",
  "handoff"
])

export interface OnboardingArrivalPose {
  translateX: number
  translateY: number
  scale: number
  rotateDeg: number
}

const POSES: Readonly<Record<OnboardingArrivalRole, readonly OnboardingArrivalPose[]>> = {
  female: [
    { translateX: 0, translateY: 0, scale: 0.96, rotateDeg: -2 },
    { translateX: 12, translateY: -58, scale: 1.02, rotateDeg: 1 },
    { translateX: 30, translateY: -172, scale: 0.95, rotateDeg: 2 },
    { translateX: 44, translateY: -238, scale: 0.93, rotateDeg: -2 },
    { translateX: 34, translateY: -186, scale: 0.96, rotateDeg: -1 },
    { translateX: 18, translateY: -82, scale: 0.99, rotateDeg: 1 },
    { translateX: 8, translateY: 5, scale: 0.96, rotateDeg: 1 },
    { translateX: 0, translateY: 0, scale: 1, rotateDeg: 0 }
  ],
  male: [
    { translateX: 0, translateY: 0, scale: 0.95, rotateDeg: 2 },
    { translateX: -10, translateY: -52, scale: 1.03, rotateDeg: -1 },
    { translateX: -28, translateY: -162, scale: 0.95, rotateDeg: -2 },
    { translateX: -40, translateY: -226, scale: 0.92, rotateDeg: 2 },
    { translateX: -31, translateY: -174, scale: 0.96, rotateDeg: 1 },
    { translateX: -16, translateY: -76, scale: 0.99, rotateDeg: -1 },
    { translateX: -7, translateY: 5, scale: 0.95, rotateDeg: -1 },
    { translateX: 0, translateY: 0, scale: 1, rotateDeg: 0 }
  ]
}

export function shouldUseOnboardingArrivalFrames(
  phase: OnboardingIntroPhase
): boolean {
  return ARRIVAL_FRAME_PHASES.has(phase)
}

export function shouldShowOnboardingUnifiedActors(
  phase: OnboardingIntroPhase
): boolean {
  return UNIFIED_ACTOR_PHASES.has(phase)
}

export function shouldShowOnboardingRunnerCrownMask(
  phase: OnboardingIntroPhase
): boolean {
  return RUNNER_CROWN_MASK_PHASES.has(phase)
}

export function getOnboardingRunHandoffFrameIndex(
  role: OnboardingArrivalRole
): number {
  // The female runtime clock has twelve ticks per 720 ms cycle, so authored
  // frame 4 maps to tick 6. The fluid male cycle starts on its matching
  // right-foot contact pose at tick 0 and advances on the same 60 ms render
  // cadence as the female master.
  return role === "female" ? 6 : 0
}

export function getOnboardingArrivalImpactStartProgress(
  role: OnboardingArrivalRole
): number {
  return (
    ONBOARDING_ARRIVAL_IMPACT_START_FRAME_INDEX[role] /
    ONBOARDING_ARRIVAL_FRAME_COUNT
  )
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.max(0, Math.min(1, progress))
}

export function getOnboardingArrivalFrameIndex(progress: number): number {
  const clamped = clampProgress(progress)
  return Math.min(
    ONBOARDING_ARRIVAL_FRAME_COUNT - 1,
    Math.floor(clamped * ONBOARDING_ARRIVAL_FRAME_COUNT)
  )
}

export function getOnboardingArrivalPose(
  role: OnboardingArrivalRole,
  progress: number
): OnboardingArrivalPose {
  const clamped = clampProgress(progress)
  const endIndex = ARRIVAL_PROGRESS.findIndex((beat) => clamped <= beat)
  if (endIndex <= 0) return { ...POSES[role][0] }
  if (endIndex === -1) return { ...POSES[role][POSES[role].length - 1] }

  const startIndex = endIndex - 1
  const startProgress = ARRIVAL_PROGRESS[startIndex]
  const endProgress = ARRIVAL_PROGRESS[endIndex]
  const localProgress = (clamped - startProgress) / (endProgress - startProgress)
  const start = POSES[role][startIndex]
  const end = POSES[role][endIndex]
  const interpolate = (from: number, to: number) => from + (to - from) * localProgress

  return {
    translateX: interpolate(start.translateX, end.translateX),
    translateY: interpolate(start.translateY, end.translateY),
    scale: interpolate(start.scale, end.scale),
    rotateDeg: interpolate(start.rotateDeg, end.rotateDeg)
  }
}

export function getOnboardingArrivalTrack(role: OnboardingArrivalRole) {
  return {
    inputRange: [...ARRIVAL_PROGRESS],
    translateX: POSES[role].map((pose) => pose.translateX),
    translateY: POSES[role].map((pose) => pose.translateY),
    scale: POSES[role].map((pose) => pose.scale),
    rotate: POSES[role].map((pose) => `${pose.rotateDeg}deg`)
  }
}
