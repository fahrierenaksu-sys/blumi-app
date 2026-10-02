export const BOTTOM_NAV_PRESSED_SCALE = 0.97
export const BOTTOM_NAV_SELECTION_DURATION_MS = 150

export function getBottomNavMotionDuration(reduceMotion: boolean): number {
  return reduceMotion ? 0 : BOTTOM_NAV_SELECTION_DURATION_MS
}
