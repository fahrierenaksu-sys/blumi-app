/**
 * Motion numbers for the own profile page. Every function here is a worklet
 * so the scroll-driven styles run on the UI thread; Reduce Motion returns the
 * resting pose, so nothing moves.
 */

/** The avatar rig's frame is 256 × 384. */
export const PROFILE_CHIBI_ASPECT = 384 / 256
export const PROFILE_CHIBI_BOB_PT = 4
export const PROFILE_CHIBI_BOB_MS = 1700
export const PROFILE_CHIBI_HOP_PT = 22

/** The chibi trails the scroll, so the page slides over it like a stage. */
export const PROFILE_HERO_PARALLAX = 0.42
export const PROFILE_HERO_FADE_DISTANCE = 320

export function getProfileHeroParallax(
  scrollY: number,
  reduceMotion: boolean
): { translateY: number; opacity: number } {
  "worklet"
  if (reduceMotion || !(scrollY > 0)) return { translateY: 0, opacity: 1 }
  const progress = Math.min(1, scrollY / PROFILE_HERO_FADE_DISTANCE)
  return {
    translateY: scrollY * PROFILE_HERO_PARALLAX,
    opacity: 1 - progress * 0.5
  }
}
