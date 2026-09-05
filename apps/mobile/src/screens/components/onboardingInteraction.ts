export const ONBOARDING_MIN_TOUCH_TARGET = 44
export const ONBOARDING_PRIMARY_ACTION_HEIGHT = 56
export const ONBOARDING_DYNAMIC_TYPE_MULTIPLIER = 1.25

const ROOM_PRESET_STACK_BREAKPOINT = 380

export function shouldStackRoomPresetChoices({
  width,
  fontScale
}: {
  width: number
  fontScale: number
}): boolean {
  return width < ROOM_PRESET_STACK_BREAKPOINT ||
    fontScale >= ONBOARDING_DYNAMIC_TYPE_MULTIPLIER
}
