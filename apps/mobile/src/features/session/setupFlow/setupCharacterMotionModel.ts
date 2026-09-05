export type SetupCharacterMotionVariant = "guide" | "styling"

export interface SetupCharacterMotionPlan {
  readonly entranceDelayMs: number
  readonly entranceDurationMs: number
  readonly cueIntervalMs: number
  readonly spriteCueDurationMs: number
  readonly spriteCueState: "walk_front"
  readonly spriteTravel: number
  readonly breathDurationMs: number
  readonly breathOffset: number
  readonly breathScale: number
}

const MOTION_PLANS: Record<
  SetupCharacterMotionVariant,
  SetupCharacterMotionPlan
> = {
  guide: {
    entranceDelayMs: 80,
    entranceDurationMs: 520,
    cueIntervalMs: 4600,
    spriteCueDurationMs: 860,
    spriteCueState: "walk_front",
    spriteTravel: 8,
    breathDurationMs: 2800,
    breathOffset: 3,
    breathScale: 1.012
  },
  styling: {
    entranceDelayMs: 0,
    entranceDurationMs: 420,
    cueIntervalMs: 6200,
    spriteCueDurationMs: 720,
    spriteCueState: "walk_front",
    spriteTravel: 5,
    breathDurationMs: 3200,
    breathOffset: 2,
    breathScale: 1.008
  }
}

export function getSetupCharacterMotionPlan(
  variant: SetupCharacterMotionVariant
): SetupCharacterMotionPlan {
  return { ...MOTION_PLANS[variant] }
}
