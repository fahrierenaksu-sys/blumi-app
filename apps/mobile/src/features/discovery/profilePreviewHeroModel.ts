/**
 * The profile preview's hero background stretches when the page is pulled
 * past its top (DSC-15): it stays pinned to the top edge and grows with the
 * pull, like an iOS stretchy header. The chibi itself is never scaled.
 * Runs on the UI thread inside the scroll handler's animated style.
 */
export const PROFILE_HERO_STRETCH_PER_PT = 1 / 360
export const PROFILE_HERO_MAX_STRETCH = 1.35

export function getProfileHeroStretch(scrollY: number, reduceMotion: boolean): { translateY: number; scale: number } {
  "worklet"
  if (reduceMotion || !(scrollY < 0)) return { translateY: 0, scale: 1 }
  const pull = -scrollY
  return {
    translateY: -pull,
    scale: Math.min(PROFILE_HERO_MAX_STRETCH, 1 + pull * PROFILE_HERO_STRETCH_PER_PT)
  }
}
