export const ONBOARDING_PRIMARY_ACTION_LAYOUT = Object.freeze({
  height: 58,
  bottomInset: 26,
  horizontalInset: Object.freeze({
    compact: 16,
    regular: 20
  })
})

export function getOnboardingPrimaryActionMetrics(width: number): {
  height: 58
  bottomInset: 26
  horizontalInset: 16 | 20
} {
  const compactWidth = Number.isFinite(width) && width < 390
  return {
    height: ONBOARDING_PRIMARY_ACTION_LAYOUT.height,
    bottomInset: ONBOARDING_PRIMARY_ACTION_LAYOUT.bottomInset,
    horizontalInset: compactWidth
      ? ONBOARDING_PRIMARY_ACTION_LAYOUT.horizontalInset.compact
      : ONBOARDING_PRIMARY_ACTION_LAYOUT.horizontalInset.regular
  }
}

/** Label line height of the onboarding primary action (`font.bodyBold`). */
const ACTION_LABEL_LINE_HEIGHT = 24
/** Vertical room around the label inside the action at the default text size. */
const ACTION_LABEL_VERTICAL_ROOM = ONBOARDING_PRIMARY_ACTION_LAYOUT.height - ACTION_LABEL_LINE_HEIGHT
/** From this text size the label is expected to wrap onto a second line. */
const ACTION_LABEL_WRAP_FONT_SCALE = 1.6

/**
 * Height to reserve for the onboarding primary action. The action has no text
 * size cap and wraps instead of shrinking, so larger text needs a taller action.
 */
export function getOnboardingPrimaryActionHeight(fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1
  const lines = scale >= ACTION_LABEL_WRAP_FONT_SCALE ? 2 : 1
  const needed = Math.ceil(ACTION_LABEL_LINE_HEIGHT * scale * lines + ACTION_LABEL_VERTICAL_ROOM)
  return Math.max(ONBOARDING_PRIMARY_ACTION_LAYOUT.height, needed)
}
