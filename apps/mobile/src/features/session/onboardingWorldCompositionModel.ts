import type { OnboardingRunnerRole } from "./onboardingIntroModel"

export const ONBOARDING_WORLD_GLOBE_SIZE = 304
export const ONBOARDING_WORLD_GLOBE_SIZE_COMPACT = 260
export const ONBOARDING_WORLD_TEXTURE_WIDTH = ONBOARDING_WORLD_GLOBE_SIZE * 2
export const ONBOARDING_WORLD_GLOBE_ENTRY_OFFSET_MULTIPLIER = 0.62
// Keep the first crown pixels present underneath the outgoing greeting. A
// fully transparent first globe frame reads as input latency on device.
export const ONBOARDING_WORLD_GLOBE_INITIAL_OPACITY = 0.14
// The greeting pair and the impact pair share this exact visual anchor. The
// world stage starts 74pt below the scene centre; its hero then resolves back
// to centre while the globe crown finishes 6pt behind the characters' feet.
export const ONBOARDING_SHARED_CHARACTER_WIDTH = 108
export const ONBOARDING_SHARED_CHARACTER_HEIGHT = 178
export const ONBOARDING_SHARED_CHARACTER_STAGE_OFFSET = 74
// Apply one viewport-level lift to the complete cinematic scene. Keeping this
// separate from the stage offset preserves the character/globe collision path.
export const ONBOARDING_WORLD_SCENE_LIFT = Object.freeze({
  compact: -28,
  regular: -32
})
export const ONBOARDING_WORLD_STAGE_HEIGHT = ONBOARDING_WORLD_GLOBE_SIZE + 116
export const ONBOARDING_WORLD_HERO_BOTTOM_IN_STAGE =
  306
export const ONBOARDING_SHARED_CHARACTER_BASELINE_FROM_SCENE_CENTER =
  ONBOARDING_SHARED_CHARACTER_STAGE_OFFSET +
  ONBOARDING_WORLD_STAGE_HEIGHT -
  ONBOARDING_WORLD_HERO_BOTTOM_IN_STAGE
// Both prelude compositions are bottom-aligned inside their fixed stages.
// These values resolve their feet to the world scene's approved baseline.
export const ONBOARDING_GREETING_PAIR_LAYER_BOTTOM_IN_STAGE = 9
export const ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y = 27
export const ONBOARDING_WORLD_GLOBE_TOP_IN_STAGE =
  ONBOARDING_WORLD_STAGE_HEIGHT - 18 - ONBOARDING_WORLD_GLOBE_SIZE
export const ONBOARDING_WORLD_COMPOSITION_LIFT = Object.freeze({
  inputRange: [0, 0.12, 0.46, 0.78, 1] as const,
  translateY: [0, -16, -72, -116, -144] as const
})
export const ONBOARDING_RUNNER_SURFACE_EMBED = 8
export const ONBOARDING_WORLD_RUNNER_PROGRESS = [0, 0.34, 0.72, 1] as const

export const ONBOARDING_WORLD_FLIGHT = Object.freeze({
  inputRange: [0, 0.18, 0.32, 0.74, 1] as const,
  male: {
    translateX: [0, -18, -42, -20, -5] as const,
    translateY: [0, -72, -236, -154, -10] as const,
    scale: [1, 0.96, 0.95, 0.98, 1] as const,
    rotate: ["0deg", "22deg", "-122deg", "-248deg", "-360deg"] as const
  },
  female: {
    translateX: [0, 18, 44, 21, 5] as const,
    translateY: [0, -80, -252, -164, -12] as const,
    scale: [1, 0.95, 0.94, 0.98, 1] as const,
    rotate: ["0deg", "-24deg", "-126deg", "-252deg", "-360deg"] as const
  }
})

export interface OnboardingWorldLayoutInput {
  width: number
  height: number
  compact: boolean
}

export interface OnboardingWorldLayout {
  statSurface: "editorial"
  statTop: number
  statBottom: number
  worldTop: number
  worldBottom: number
  globeSize: number
  ctaTop: number
}

export function getOnboardingWorldLayout({
  height,
  compact
}: OnboardingWorldLayoutInput): OnboardingWorldLayout {
  const globeSize = compact
    ? ONBOARDING_WORLD_GLOBE_SIZE_COMPACT
    : ONBOARDING_WORLD_GLOBE_SIZE
  const statTop = compact ? 62 : 88
  const statBottom = statTop + (compact ? 72 : 82)
  const worldTop = statBottom + (compact ? 42 : 48)
  const worldBottom = worldTop + globeSize + (compact ? 92 : 104)
  const ctaTop = Math.max(worldBottom + 64, height - (compact ? 100 : 104))

  return {
    statSurface: "editorial",
    statTop,
    statBottom,
    worldTop,
    worldBottom,
    globeSize,
    ctaTop
  }
}

export interface OnboardingWorldRunnerPlacement {
  footX: number
  footY: number
  surfaceY: number
}

export function getOnboardingWorldSurfaceY(x: number): number {
  const radius = ONBOARDING_WORLD_GLOBE_SIZE / 2
  const safeX = Math.max(-radius, Math.min(radius, x))
  return radius - Math.sqrt(radius * radius - safeX * safeX) + 1
}

export function getOnboardingWorldRunnerPlacement(
  role: OnboardingRunnerRole,
  progress: number
): OnboardingWorldRunnerPlacement {
  const clamped = Math.max(0, Math.min(1, progress))
  const startX = role === "leader" ? 66 : -74
  // The chaser advances only 12pt while the leader advances 22pt. He remains
  // visibly behind and reads as trying to catch up without reaching her.
  const readyX = role === "leader" ? 44 : -62
  const footX = startX + (readyX - startX) * clamped
  const surfaceY = getOnboardingWorldSurfaceY(footX)

  return { footX, footY: surfaceY, surfaceY }
}
