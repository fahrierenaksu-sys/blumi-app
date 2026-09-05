export type OnboardingWelcomeHomeScene =
  | "home-reveal"
  | "character-entrance"
  | "settle"
  | "ambient-idle"

export const ONBOARDING_WELCOME_HOME_TIMELINE_MS = Object.freeze({
  houseRevealStart: 0,
  houseRevealComplete: 460,
  doorLightStart: 110,
  doorLightComplete: 620,
  characterEntranceStart: 260,
  characterEntranceComplete: 980,
  settleStart: 940,
  settleComplete: 1_320,
  settled: 1_520
})

export interface OnboardingWelcomeHomeProgress {
  house: number
  doorLight: number
  entranceGroup: number
  settle: number
}

function progressBetween(elapsedMs: number, startMs: number, endMs: number): number {
  if (elapsedMs <= startMs) return 0
  if (elapsedMs >= endMs) return 1
  return (elapsedMs - startMs) / (endMs - startMs)
}

export function getOnboardingWelcomeHomeSceneAtElapsed(
  elapsedMs: number
): OnboardingWelcomeHomeScene {
  const timeline = ONBOARDING_WELCOME_HOME_TIMELINE_MS
  if (elapsedMs < timeline.characterEntranceStart) return "home-reveal"
  if (elapsedMs < timeline.settleStart) return "character-entrance"
  if (elapsedMs < timeline.settled) return "settle"
  return "ambient-idle"
}

export function getOnboardingWelcomeHomeProgressAtElapsed(
  elapsedMs: number,
  reduceMotion = false
): OnboardingWelcomeHomeProgress {
  if (reduceMotion) {
    return {
      house: 1,
      doorLight: 1,
      entranceGroup: 1,
      settle: 1
    }
  }

  const timeline = ONBOARDING_WELCOME_HOME_TIMELINE_MS
  return {
    house: progressBetween(
      elapsedMs,
      timeline.houseRevealStart,
      timeline.houseRevealComplete
    ),
    doorLight: progressBetween(
      elapsedMs,
      timeline.doorLightStart,
      timeline.doorLightComplete
    ),
    entranceGroup: progressBetween(
      elapsedMs,
      timeline.characterEntranceStart,
      timeline.characterEntranceComplete
    ),
    settle: progressBetween(
      elapsedMs,
      timeline.settleStart,
      timeline.settleComplete
    )
  }
}
