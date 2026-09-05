export type OnboardingIntroPhase =
  | "greeting"
  | "character-greeting"
  | "globe-launching"
  | "impact"
  | "airborne"
  | "landing"
  | "population-counting"
  | "chasing"
  | "catching"
  | "world-ready"
  | "handoff"

export type OnboardingIntroPrimaryAction =
  | "open-greeting"
  | "reveal-world"
  | "start-registration"

export type OnboardingIntroAppState =
  | "active"
  | "background"
  | "inactive"
  | "unknown"
  | "extension"

export const ONBOARDING_GLOBE_LOOP_DURATION_MS = 14_000
export const ONBOARDING_RUNNER_ORBIT_DURATION_MS = 4_200
// Surface the CTA two seconds into the world story, after landing but before
// the population beat finishes. The remaining animation continues behind it.
export const ONBOARDING_WHOAA_REVEAL_LEAD_MS = 3_560
export const ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS = 0.42
export const ONBOARDING_RUNNER_CATCH_X_OFFSETS = Object.freeze({
  leader: -2,
  chaser: -6
})

export const ONBOARDING_SCENE_HANDOFF_MS = Object.freeze({
  // Answer the CTA, then overlap the outgoing greeting with the rising world.
  actionResponse: 100,
  preludeExit: 180,
  worldReveal: 150
})

export const ONBOARDING_INTRO_TIMELINE_MS = Object.freeze({
  // The globe rises first, then the pair overlaps the impact beat. These are
  // absolute beats from the reveal tap, not independent page durations.
  impact: 260,
  globeLaunchComplete: 500,
  airborneComplete: 1_060,
  landingComplete: 1_180,
  // Give the landing reaction a readable beat, then hand the pair to the run
  // loop 200ms sooner so the globe does not feel like it pauses after touch.
  populationComplete: 2_400,
  chaseComplete: 5_000,
  catchComplete: 5_560,
  handoffDuration: 200
})

export const ONBOARDING_IMPACT_REACTION_MAX_LATENCY_MS = 34

export interface OnboardingImpactVisualProgress {
  globeRise: number
  globeImpact: number
  avatarFlight: number
  landingReaction: number
  contactShadow: number
}

export function shouldInitializeOnboardingImpactSettled(
  motionPreferenceResolved: boolean,
  reduceMotion: boolean
): boolean {
  return motionPreferenceResolved && reduceMotion
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function interpolateProgress(
  elapsedMs: number,
  startMs: number,
  endMs: number
): number {
  if (endMs <= startMs) return elapsedMs >= endMs ? 1 : 0
  return clampUnit((elapsedMs - startMs) / (endMs - startMs))
}

/**
 * Canonical visual clock for the reference-video impact beat. State changes
 * may still be dispatched on JS, but they never own these pixels.
 */
export function getOnboardingImpactVisualProgressAtElapsed(
  elapsedMs: number
): OnboardingImpactVisualProgress {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0)
  const globeLinear = interpolateProgress(
    elapsed,
    0,
    ONBOARDING_INTRO_TIMELINE_MS.globeLaunchComplete
  )
  const globeRise = 1 - Math.pow(1 - globeLinear, 3)
  const globeImpact = interpolateProgress(
    elapsed,
    ONBOARDING_INTRO_TIMELINE_MS.impact,
    ONBOARDING_INTRO_TIMELINE_MS.globeLaunchComplete
  )
  const avatarFlight = interpolateProgress(
    elapsed,
    ONBOARDING_INTRO_TIMELINE_MS.impact,
    ONBOARDING_INTRO_TIMELINE_MS.landingComplete
  )
  const landingReaction = interpolateProgress(
    elapsed,
    ONBOARDING_INTRO_TIMELINE_MS.airborneComplete,
    ONBOARDING_INTRO_TIMELINE_MS.landingComplete
  )
  const shadowFadeStart = ONBOARDING_INTRO_TIMELINE_MS.impact - 120
  const contactShadow = 1 - interpolateProgress(
    elapsed,
    shadowFadeStart,
    ONBOARDING_INTRO_TIMELINE_MS.impact
  )

  return {
    globeRise,
    globeImpact,
    avatarFlight,
    landingReaction,
    contactShadow
  }
}

export interface OnboardingIntroState {
  phase: OnboardingIntroPhase
  isPaused: boolean
}

export type OnboardingIntroEvent =
  | { type: "open-greeting" }
  | { type: "reveal-world"; reduceMotion: boolean }
  | { type: "globe-impact" }
  | { type: "launch-finished" }
  | { type: "landing-started" }
  | { type: "landing-finished" }
  | { type: "population-finished" }
  | { type: "chase-finished" }
  | { type: "catch-finished" }
  | { type: "handoff-started" }
  | { type: "handoff-cancelled" }
  | { type: "motion-reduced" }
  | { type: "intro-completed" }
  | { type: "pause" }
  | { type: "resume" }

export interface OnboardingIntroAnimationProgress {
  globeRise: number
  impact: number
  flight: number
  landing: number
  population: number
  chase: number
}

export type OnboardingRunnerRole = "leader" | "chaser"
export type OnboardingRunnerSceneState =
  | "hidden"
  | "chasing"
  | "reacting"
  | "orbit-chase"

export interface OnboardingRunnerMotionTrack {
  inputRange: readonly [number, number, number, number]
  translateX: readonly [number, number, number, number]
  translateY: readonly [number, number, number, number]
  scale: readonly [number, number, number, number]
  rotate: readonly [number, number, number, number]
}

export interface OnboardingRunnerOrbitTrack {
  inputRange: readonly [number, number, number, number, number]
  translateX: readonly [number, number, number, number, number]
  translateY: readonly [number, number, number, number, number]
  scale: readonly [number, number, number, number, number]
  rotate: readonly [number, number, number, number, number]
}

export interface OnboardingRunnerPose {
  animationState: "running" | "reacting" | "orbit-chase" | "settled"
  showGroundShadow: boolean
}

const CINEMATIC_PHASES: ReadonlySet<OnboardingIntroPhase> = new Set([
  "globe-launching",
  "impact",
  "airborne",
  "landing",
  "population-counting",
  "chasing",
  "catching"
])

const CONTINUOUS_MOTION_PHASES: ReadonlySet<OnboardingIntroPhase> = new Set([
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

const RUNNER_INPUT_RANGE = [0, 0.34, 0.68, 1] as const

const RUNNER_TRACKS: Readonly<Record<OnboardingRunnerRole, OnboardingRunnerMotionTrack>> = {
  leader: {
    inputRange: RUNNER_INPUT_RANGE,
    // Start from a neutral handoff frame. The later convergence keeps the
    // approach energetic without a sideways slide or a first-frame pop.
    translateX: [18, 10, 2, -14],
    translateY: [0, 3, -3, -4],
    scale: [1, 0.97, 0.99, 1],
    rotate: [0, 2, 1, 0]
  },
  chaser: {
    inputRange: RUNNER_INPUT_RANGE,
    translateX: [-88, -88, -88, -88],
    translateY: [0, 0, 0, 0],
    scale: [1, 1, 1, 1],
    rotate: [0, 0, 0, 0]
  }
}

const ORBIT_INPUT_RANGE = [0, 0.25, 0.5, 0.75, 1] as const

const RUNNER_ORBIT_TRACKS: Readonly<Record<OnboardingRunnerRole, OnboardingRunnerOrbitTrack>> = {
  leader: {
    inputRange: ORBIT_INPUT_RANGE,
    translateX: [0, 2, 0, 2, 0],
    translateY: [0, 3, 7, 3, 0],
    scale: [1, 0.99, 0.965, 0.99, 1],
    rotate: [0, 1, 1.8, 1, 0]
  },
  chaser: {
    inputRange: ORBIT_INPUT_RANGE,
    // Begin and end at the chase anchor. Applying a non-zero first orbit
    // offset when world-ready mounted visibly teleported the chaser backward.
    translateX: [0, 3, 4, 3, 0],
    translateY: [0, 6, 12, 6, 0],
    scale: [1, 1.008, 1.015, 1.008, 1],
    rotate: [0, -1, -1.9, -1, 0]
  }
}

export function getOnboardingRunnerMotionTrack(
  role: OnboardingRunnerRole
): OnboardingRunnerMotionTrack {
  return RUNNER_TRACKS[role]
}

export function getOnboardingRunnerOrbitTrack(
  role: OnboardingRunnerRole
): OnboardingRunnerOrbitTrack {
  return RUNNER_ORBIT_TRACKS[role]
}

export function getOnboardingRunnerState(
  phase: OnboardingIntroPhase
): OnboardingRunnerSceneState {
  if (phase === "chasing") return "chasing"
  if (phase === "catching") return "reacting"
  if (phase === "world-ready" || phase === "handoff") return "orbit-chase"
  return "hidden"
}

export function getOnboardingRunnerPose(
  role: OnboardingRunnerRole,
  phase: OnboardingIntroPhase
): OnboardingRunnerPose {
  return {
    animationState: phase === "population-counting" ||
      phase === "chasing"
      ? "running"
      : phase === "catching"
        ? role === "chaser" ? "running" : "reacting"
        : phase === "world-ready" || phase === "handoff"
          ? "orbit-chase"
          : "settled",
    showGroundShadow:
      phase === "population-counting" ||
      phase === "chasing" ||
      phase === "catching" ||
      phase === "world-ready" ||
      phase === "handoff"
  }
}

export function createOnboardingIntroState(
  _hasSeenIntro: boolean,
  _reduceMotion: boolean
): OnboardingIntroState {
  return {
    phase: "greeting",
    isPaused: false
  }
}

export function reduceOnboardingIntro(
  state: OnboardingIntroState,
  event: OnboardingIntroEvent
): OnboardingIntroState {
  if (event.type === "intro-completed") {
    return { phase: "greeting", isPaused: false }
  }
  if (event.type === "motion-reduced") {
    return CINEMATIC_PHASES.has(state.phase)
      ? { phase: "world-ready", isPaused: false }
      : state
  }
  if (event.type === "pause") {
    return state.isPaused ? state : { ...state, isPaused: true }
  }
  if (event.type === "resume") {
    return state.isPaused ? { ...state, isPaused: false } : state
  }
  if (state.isPaused) return state

  if (event.type === "open-greeting" && state.phase === "greeting") {
    return { ...state, phase: "character-greeting" }
  }
  if (event.type === "reveal-world" && state.phase === "character-greeting") {
    return {
      phase: event.reduceMotion ? "world-ready" : "globe-launching",
      isPaused: false
    }
  }
  if (event.type === "globe-impact" && state.phase === "globe-launching") {
    return { ...state, phase: "impact" }
  }
  if (event.type === "launch-finished" && state.phase === "impact") {
    return { ...state, phase: "airborne" }
  }
  if (event.type === "landing-started" && state.phase === "airborne") {
    return { ...state, phase: "landing" }
  }
  if (event.type === "landing-finished" && state.phase === "landing") {
    return { ...state, phase: "population-counting" }
  }
  if (event.type === "population-finished" && state.phase === "population-counting") {
    return { ...state, phase: "chasing" }
  }
  if (event.type === "chase-finished" && state.phase === "chasing") {
    return { ...state, phase: "catching" }
  }
  if (event.type === "catch-finished" && state.phase === "catching") {
    return { ...state, phase: "world-ready" }
  }
  if (event.type === "handoff-started" && state.phase === "world-ready") {
    return { ...state, phase: "handoff" }
  }
  if (event.type === "handoff-cancelled" && state.phase === "handoff") {
    return { ...state, phase: "world-ready" }
  }
  return state
}

export function getOnboardingIntroPrimaryAction(
  phase: OnboardingIntroPhase
): OnboardingIntroPrimaryAction {
  if (phase === "greeting") return "open-greeting"
  if (phase === "character-greeting") return "reveal-world"
  if (phase === "world-ready") return "start-registration"
  return "reveal-world"
}

export function isOnboardingIntroPrimaryActionEnabled(
  phase: OnboardingIntroPhase
): boolean {
  return phase === "greeting" ||
    phase === "character-greeting" ||
    phase === "world-ready"
}

export function shouldRunOnboardingIntroMotion(input: {
  phase: OnboardingIntroPhase
  isPaused: boolean
  reduceMotion: boolean
  isFocused: boolean
  appState: OnboardingIntroAppState
}): boolean {
  return (
    CONTINUOUS_MOTION_PHASES.has(input.phase) &&
    !input.isPaused &&
    !input.reduceMotion &&
    input.isFocused &&
    input.appState === "active"
  )
}

export function shouldRunOnboardingRunnerOrbit(input: {
  phase: OnboardingIntroPhase
  isPaused: boolean
  reduceMotion: boolean
  isFocused: boolean
  appState: OnboardingIntroAppState
}): boolean {
  return (
    (input.phase === "world-ready" || input.phase === "handoff") &&
    !input.isPaused &&
    !input.reduceMotion &&
    input.isFocused &&
    input.appState === "active"
  )
}

export function shouldShowOnboardingPopulationCard(
  phase: OnboardingIntroPhase
): boolean {
  return phase === "population-counting" ||
    phase === "chasing" ||
    phase === "catching" ||
    phase === "world-ready" ||
    phase === "handoff"
}

export function shouldShowOnboardingRunners(
  phase: OnboardingIntroPhase
): boolean {
  return phase === "population-counting" ||
    phase === "chasing" ||
    phase === "catching" ||
    phase === "world-ready" ||
    phase === "handoff"
}

export function getOnboardingIntroAnimationProgress(
  phase: OnboardingIntroPhase,
  reduceMotion: boolean
): OnboardingIntroAnimationProgress {
  if (reduceMotion && phase !== "greeting" && phase !== "character-greeting") {
    return {
      globeRise: 1,
      impact: 1,
      flight: 1,
      landing: 1,
      population: 1,
      chase: 1
    }
  }
  switch (phase) {
    case "impact":
      return { globeRise: 1, impact: 0, flight: 0, landing: 0, population: 0, chase: 0 }
    case "airborne":
      return { globeRise: 1, impact: 1, flight: 0, landing: 0, population: 0, chase: 0 }
    case "landing":
      return { globeRise: 1, impact: 1, flight: 1, landing: 0, population: 0, chase: 0 }
    case "population-counting":
      return { globeRise: 1, impact: 1, flight: 1, landing: 1, population: 0, chase: 0 }
    case "chasing":
      return { globeRise: 1, impact: 1, flight: 1, landing: 1, population: 1, chase: 0 }
    case "world-ready":
    case "catching":
    case "handoff":
      return { globeRise: 1, impact: 1, flight: 1, landing: 1, population: 1, chase: 1 }
    default:
      return { globeRise: 0, impact: 0, flight: 0, landing: 0, population: 0, chase: 0 }
  }
}
