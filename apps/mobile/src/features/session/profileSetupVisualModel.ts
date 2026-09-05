import { SETUP_FLOW_STAGE_HEIGHT } from "./setupFlow/setupFlowShellModel"

export const PROFILE_SETUP_VISUAL = Object.freeze({
  ageFieldWidth: 104,
  formGap: 18,
  // Gives the liquid surface enough vertical presence to meet the shared CTA
  // rhythm without adding a second decorative section or pushing the form off-screen.
  formMinHeight: 260,
  genderIconSize: 24,
  // Keep both choices visible above the keyboard while preserving a generous
  // touch target and the two-line icon/label composition.
  genderOptionMinHeight: 72,
  selectedIndicatorSize: 22
})

export type ProfileSetupGender = "woman" | "man"

/**
 * Keep the profile preview useful on first render. The onboarding starts with
 * the canonical woman avatar unless a persisted draft explicitly chose man.
 * Unknown/legacy values are intentionally fail-safe and resolve to woman.
 */
export function getProfileSetupInitialGender(
  gender: string | undefined
): ProfileSetupGender {
  return gender === "man" ? "man" : "woman"
}

export interface ProfileCharacterReactionGeometry {
  badgeHeight: number
  badgeOverlap: number
  characterHeight: number
  characterLift: number
  characterTop: number
  stageHeight: number
}

const PROFILE_CHARACTER_BADGE_HEIGHT = 40
const PROFILE_CHARACTER_TOP_INSET = 8

/**
 * Calculates the shared stage anchor for both canonical and generated
 * character renderers. The longest atlas cell is used as the contract so a
 * candidate reaction can never push the name badge over the feet.
 */
export function getProfileCharacterReactionGeometry(
  compact: boolean
): ProfileCharacterReactionGeometry {
  const stageHeight = compact
    ? SETUP_FLOW_STAGE_HEIGHT.compact
    : SETUP_FLOW_STAGE_HEIGHT.regular
  const characterHeight = compact ? 192 : 228
  const centeredCharacterTop = (stageHeight - characterHeight) / 2
  const centeredCharacterBottom = (stageHeight + characterHeight) / 2
  const badgeTop = stageHeight - PROFILE_CHARACTER_BADGE_HEIGHT
  const characterLift = PROFILE_CHARACTER_TOP_INSET - centeredCharacterTop
  const characterTop = centeredCharacterTop + characterLift

  return {
    badgeHeight: PROFILE_CHARACTER_BADGE_HEIGHT,
    badgeOverlap: Math.max(0, centeredCharacterBottom + characterLift - badgeTop),
    characterHeight,
    characterLift,
    characterTop,
    stageHeight
  }
}
