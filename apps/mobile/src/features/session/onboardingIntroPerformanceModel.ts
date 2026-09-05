export interface OnboardingIntroFrameHealth {
  frame_samples: number
  slow_frames: number
  severe_frames: number
  worst_frame_ms: number
  average_frame_ms: number
}

export interface OnboardingIntroPerformanceSession {
  bootStartedAtMs: number
  mountedAtMs: number
  reduceMotion: boolean
}

export function createOnboardingIntroPerformanceSession(input: {
  bootStartedAtMs: number
  mountedAtMs: number
  reduceMotion: boolean
}): OnboardingIntroPerformanceSession {
  return { ...input }
}

export function getOnboardingIntroFrameHealth(
  frameDurationsMs: readonly number[]
): OnboardingIntroFrameHealth {
  const samples = frameDurationsMs.filter(
    (duration) => Number.isFinite(duration) && duration > 0 && duration < 1_000
  )
  const total = samples.reduce((sum, duration) => sum + duration, 0)
  return {
    frame_samples: samples.length,
    slow_frames: samples.filter((duration) => duration > 20).length,
    severe_frames: samples.filter((duration) => duration >= 48).length,
    worst_frame_ms: samples.length > 0 ? Math.round(Math.max(...samples)) : 0,
    average_frame_ms: samples.length > 0 ? Math.round(total / samples.length) : 0
  }
}

export function summarizeOnboardingIntroPerformance(input: {
  session: OnboardingIntroPerformanceSession
  interactionReadyAtMs: number
  frameDurationsMs: readonly number[]
}) {
  return {
    reduce_motion: input.session.reduceMotion,
    cold_start_ms: Math.max(0, input.interactionReadyAtMs - input.session.bootStartedAtMs),
    js_mount_ms: Math.max(0, input.session.mountedAtMs - input.session.bootStartedAtMs),
    intro_visible_ms: Math.max(0, input.interactionReadyAtMs - input.session.mountedAtMs),
    ...getOnboardingIntroFrameHealth(input.frameDurationsMs)
  }
}
