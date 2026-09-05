import type { AccountRecoveryLocale } from "../../features/session/accountRecoveryCopy"

export const BOTTOM_NAV_PRESSED_SCALE = 0.97
export const BOTTOM_NAV_PRESS_DURATION_MS = 100
export const BOTTOM_NAV_SELECTION_DURATION_MS = 200

export function getBottomNavMotionDuration(reduceMotion: boolean): number {
  return reduceMotion ? 0 : BOTTOM_NAV_SELECTION_DURATION_MS
}

export function getBottomNavAccessibilityLabel(
  locale: AccountRecoveryLocale,
  label: string,
  isCurrent = false
): string {
  if (locale === "tr") {
    return isCurrent ? `${label} sekmesi` : `${label} sekmesini aç`
  }
  return isCurrent ? `${label} tab` : `Open ${label} tab`
}
