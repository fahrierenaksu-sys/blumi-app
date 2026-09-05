export const ONBOARDING_GREETING_WAVE_SEQUENCE = [
  0,
  1,
  2,
  3,
  4,
  3,
  2,
  1,
  5
] as const

export function getOnboardingWaveAssetFrameAtElapsed(input: {
  elapsedMs: number
  frameDurationMs: number
  startOffsetMs?: number
  sequence?: readonly number[]
}): number {
  const sequence = input.sequence ?? ONBOARDING_GREETING_WAVE_SEQUENCE
  if (sequence.length === 0) return 0
  const startOffsetMs = input.startOffsetMs ?? 0
  if (input.elapsedMs <= startOffsetMs) return sequence[0]!
  const sequencePosition = Math.floor(
    (input.elapsedMs - startOffsetMs) / input.frameDurationMs
  )
  return sequence[Math.min(sequence.length - 1, Math.max(0, sequencePosition))]!
}

export function getOnboardingWaveFrameTimestampMs(input: {
  frameIndex: number
  frameDurationMs: number
  startOffsetMs?: number
}): number {
  return (input.startOffsetMs ?? 0) + (input.frameIndex * input.frameDurationMs)
}

export function getOnboardingWaveFrameAtElapsed(input: {
  elapsedMs: number
  frameCount: number
  frameDurationMs: number
  startOffsetMs?: number
}): number {
  if (input.frameCount <= 1) return 0
  const startOffsetMs = input.startOffsetMs ?? 0
  if (input.elapsedMs <= startOffsetMs) return 0
  const authoredFrameIndex = Math.floor(
    (input.elapsedMs - startOffsetMs) / input.frameDurationMs
  )
  return Math.max(0, Math.min(input.frameCount - 1, authoredFrameIndex))
}
