/**
 * The motion tokens as plain data (no React Native or Reanimated imports), so
 * pure models can share them. Product code reads them through `./motion`
 * (`useMotion()` resolves them for Reduce Motion).
 */

export interface MotionSpringToken {
  readonly duration: number
  readonly dampingRatio: number
}

export const MOTION_SPRINGS = Object.freeze({
  /** Press in/out and toggles. */
  press: Object.freeze({ duration: 220, dampingRatio: 0.9 }),
  /** Selection, pills, badges, card promotion (SwiftUI .snappy). */
  snappy: Object.freeze({ duration: 350, dampingRatio: 0.85 }),
  /** Sheets, panels, page and overlay settle (SwiftUI .smooth). */
  smooth: Object.freeze({ duration: 450, dampingRatio: 1 }),
  /** Celebrations only: match, unlock, purchase landing (SwiftUI .bouncy). */
  bouncy: Object.freeze({ duration: 550, dampingRatio: 0.7 })
}) satisfies Record<string, MotionSpringToken>

export type MotionSpringName = keyof typeof MOTION_SPRINGS

export const MOTION_DURATIONS = Object.freeze({
  /** Opacity in. */
  fadeIn: 180,
  /** Opacity out (exits run about 0.7× the entrance). */
  fadeOut: 140,
  /** Skeleton → content, and the Reduce Motion substitute for movement. */
  crossfade: 200
})

export type MotionFadeName = keyof typeof MOTION_DURATIONS

export const MOTION_STAGGER = Object.freeze({ stepMs: 30, maxItems: 6 })

/** Scale of a pressed control. */
export const MOTION_PRESS_SCALE = 0.965

/** Opacity of a pressed control when Reduce Motion replaces the scale. */
export const MOTION_REDUCED_PRESS_OPACITY = 0.82

/** Delay before list item `index` first appears (items past the sixth share the last slot). */
export function staggerDelayMs(index: number): number {
  const slot = Math.max(0, Math.min(Math.floor(index), MOTION_STAGGER.maxItems - 1))
  return slot * MOTION_STAGGER.stepMs
}

