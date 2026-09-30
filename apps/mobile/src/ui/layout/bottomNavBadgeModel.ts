// Motion rules for the bottom navigation unread badge. The badge stays
// mounted; these plans drive its scale and opacity on the UI thread.

export interface BottomNavBadgeSpring {
  damping: number
  stiffness: number
  mass: number
}

export type BottomNavBadgeTransition = "appear" | "bump" | "exit" | "none"

export interface BottomNavBadgeAppearMotion {
  fromScale: number
  spring: BottomNavBadgeSpring | null
  opacityDurationMs: number
}

export interface BottomNavBadgeBumpMotion {
  peakScale: number
  peakDurationMs: number
  spring: BottomNavBadgeSpring
}

export interface BottomNavBadgeExitMotion {
  toScale: number
  durationMs: number
}

const BADGE_MAX_COUNT = 99
const BADGE_APPEAR_FROM_SCALE = 0.6
const BADGE_FADE_DURATION_MS = 120
const BADGE_BUMP_PEAK_SCALE = 1.12
const BADGE_BUMP_PEAK_DURATION_MS = 90

// Mirrors uiTheme.animation.springBouncy; kept here so the model stays pure.
export const BOTTOM_NAV_BADGE_SPRING: BottomNavBadgeSpring = Object.freeze({
  damping: 12,
  stiffness: 200,
  mass: 0.8,
})

export function isBottomNavBadgeVisible(count: number): boolean {
  return count > 0
}

export function shouldBumpBadge(previousCount: number, nextCount: number): boolean {
  return isBottomNavBadgeVisible(previousCount) && nextCount > previousCount
}

export function resolveBottomNavBadgeTransition(
  previousCount: number,
  nextCount: number
): BottomNavBadgeTransition {
  const wasVisible = isBottomNavBadgeVisible(previousCount)
  const isVisible = isBottomNavBadgeVisible(nextCount)
  if (!wasVisible && isVisible) return "appear"
  if (wasVisible && !isVisible) return "exit"
  return shouldBumpBadge(previousCount, nextCount) ? "bump" : "none"
}

export function getBadgeAppearMotion(reduceMotion: boolean): BottomNavBadgeAppearMotion {
  return reduceMotion
    ? { fromScale: 1, spring: null, opacityDurationMs: 0 }
    : {
        fromScale: BADGE_APPEAR_FROM_SCALE,
        spring: BOTTOM_NAV_BADGE_SPRING,
        opacityDurationMs: BADGE_FADE_DURATION_MS,
      }
}

export function getBadgeBumpMotion(reduceMotion: boolean): BottomNavBadgeBumpMotion | null {
  return reduceMotion
    ? null
    : {
        peakScale: BADGE_BUMP_PEAK_SCALE,
        peakDurationMs: BADGE_BUMP_PEAK_DURATION_MS,
        spring: BOTTOM_NAV_BADGE_SPRING,
      }
}

export function getBadgeExitMotion(reduceMotion: boolean): BottomNavBadgeExitMotion {
  return reduceMotion
    ? { toScale: 0, durationMs: 0 }
    : { toScale: BADGE_APPEAR_FROM_SCALE, durationMs: BADGE_FADE_DURATION_MS }
}

export function formatBottomNavBadgeCount(count: number): string {
  return count > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : String(count)
}

// While the badge fades out at 0 it keeps showing the last unread count.
export function resolveBottomNavBadgeLabelCount(shownCount: number, nextCount: number): number {
  return isBottomNavBadgeVisible(nextCount) ? nextCount : shownCount
}
