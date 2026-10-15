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

/** Label size of the onboarding primary action (`font.bodyBold`). */
const ACTION_LABEL_FONT_SIZE = 16
const ACTION_LABEL_LINE_HEIGHT = 24
/** Vertical room around the label inside the action at the default text size. */
const ACTION_LABEL_VERTICAL_ROOM = ONBOARDING_PRIMARY_ACTION_LAYOUT.height - ACTION_LABEL_LINE_HEIGHT
/** Horizontal padding inside the action on each side (`spacing.lg`). */
const ACTION_LABEL_SIDE_PADDING = 20
/**
 * Average advance of an Inter Bold glyph as a share of the font size, rounded
 * up so the estimate errs towards one line too many rather than a clipped one.
 */
const ACTION_LABEL_GLYPH_WIDTH_EM = 0.6
/** Used when the caller does not know the label: the longest setup action label. */
const FALLBACK_ACTION_LABEL = "Karakterimi hazırlayalım"

/**
 * Lines the label wraps to when every word moves to the next line whole, as
 * React Native wraps it; a word wider than the line breaks across lines.
 */
export function estimateOnboardingActionLabelLines(label: string, fontScale: number, viewportWidth: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1
  const lineWidth = Math.max(1, viewportWidth
    - 2 * getOnboardingPrimaryActionMetrics(viewportWidth).horizontalInset
    - 2 * ACTION_LABEL_SIDE_PADDING)
  const glyphWidth = ACTION_LABEL_FONT_SIZE * scale * ACTION_LABEL_GLYPH_WIDTH_EM
  const words = label.trim().split(/\s+/).filter(Boolean)
  const totals = words.reduce((state, word) => {
    const wordWidth = word.length * glyphWidth
    const needed = state.used === 0 ? wordWidth : state.used + glyphWidth + wordWidth
    if (state.used > 0 && needed <= lineWidth) return { lines: state.lines, used: needed }
    const wordLines = Math.max(1, Math.ceil(wordWidth / lineWidth))
    const lastLineWidth = wordWidth - (wordLines - 1) * lineWidth
    return { lines: state.lines + wordLines, used: lastLineWidth }
  }, { lines: 0, used: 0 })
  return Math.max(1, totals.lines)
}

/**
 * Height to reserve for the onboarding primary action. The action has no text
 * size cap and wraps instead of shrinking, so larger text needs a taller action;
 * the line count comes from the label and the width it has.
 */
export function getOnboardingPrimaryActionHeight(
  fontScale: number,
  options: { label?: string; viewportWidth?: number } = {}
): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1
  const viewportWidth = options.viewportWidth !== undefined && Number.isFinite(options.viewportWidth)
    ? options.viewportWidth
    : 375
  const lines = estimateOnboardingActionLabelLines(options.label ?? FALLBACK_ACTION_LABEL, scale, viewportWidth)
  const needed = Math.ceil(ACTION_LABEL_LINE_HEIGHT * scale * lines + ACTION_LABEL_VERTICAL_ROOM)
  return Math.max(ONBOARDING_PRIMARY_ACTION_LAYOUT.height, needed)
}
