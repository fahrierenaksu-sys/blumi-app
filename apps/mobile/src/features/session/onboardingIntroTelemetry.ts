import {
  createOnboardingIntroPerformanceSession,
  summarizeOnboardingIntroPerformance
} from "./onboardingIntroPerformanceModel"

type IntroBeat = "scan" | "brand" | "characters" | "actions" | "world"

interface IntroTelemetryState {
  readonly startedAtMs: number
  readonly mountedAtMs: number
  readonly emittedBeats: Set<IntroBeat>
  lastFrameAtMs: number | null
  readonly frameGapsMs: number[]
}

interface IntroTelemetryEvent {
  name: "onboarding_step_viewed" | "onboarding_intro_performance"
  properties: Record<string, string | number | boolean>
}

export function createOnboardingIntroTelemetry(
  startedAtMs: number,
  mountedAtMs = Date.now()
): IntroTelemetryState {
  return {
    startedAtMs,
    mountedAtMs,
    emittedBeats: new Set<IntroBeat>(),
    lastFrameAtMs: null,
    frameGapsMs: []
  }
}

export function getOnboardingIntroBeatEvent(
  telemetry: IntroTelemetryState,
  input: {
    beat: IntroBeat
    nowMs: number
    reduceMotion: boolean
    resumed: boolean
  }
): IntroTelemetryEvent | null {
  if (telemetry.emittedBeats.has(input.beat)) return null
  telemetry.emittedBeats.add(input.beat)
  return {
    name: "onboarding_step_viewed",
    properties: {
      step: `intro_${input.beat}`,
      flow: "auth_entry_intro",
      resumed: input.resumed,
      reduce_motion: input.reduceMotion,
      elapsed_ms: Math.max(0, Math.round(input.nowMs - telemetry.startedAtMs))
    }
  }
}

export function recordOnboardingFrameSample(
  telemetry: IntroTelemetryState,
  nowMs: number
): void {
  if (telemetry.lastFrameAtMs !== null) {
    const gap = nowMs - telemetry.lastFrameAtMs
    if (Number.isFinite(gap) && gap > 0 && gap < 1_000) {
      telemetry.frameGapsMs.push(gap)
    }
  }
  telemetry.lastFrameAtMs = nowMs
}

export function getOnboardingIntroPerformanceEvent(
  telemetry: IntroTelemetryState,
  input: {
    nowMs: number
    reduceMotion: boolean
    resumed: boolean
    coldStartMs: number
  }
): IntroTelemetryEvent {
  const performance = summarizeOnboardingIntroPerformance({
    session: createOnboardingIntroPerformanceSession({
      bootStartedAtMs: telemetry.startedAtMs,
      mountedAtMs: telemetry.mountedAtMs,
      reduceMotion: input.reduceMotion
    }),
    interactionReadyAtMs: input.nowMs,
    frameDurationsMs: telemetry.frameGapsMs
  })
  return {
    name: "onboarding_intro_performance",
    properties: {
      step: "intro",
      flow: "auth_entry_intro",
      resumed: input.resumed,
      reduce_motion: input.reduceMotion,
      elapsed_ms: Math.max(0, Math.round(input.nowMs - telemetry.startedAtMs)),
      cold_start_ms: Math.max(0, Math.round(input.coldStartMs)),
      js_mount_ms: performance.js_mount_ms,
      intro_visible_ms: performance.intro_visible_ms,
      intro_frame_samples: performance.frame_samples,
      intro_slow_frames: performance.slow_frames,
      intro_severe_frames: performance.severe_frames,
      intro_worst_frame_ms: performance.worst_frame_ms,
      intro_average_frame_ms: performance.average_frame_ms
    }
  }
}
