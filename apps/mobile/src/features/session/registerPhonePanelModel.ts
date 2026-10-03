export const REGISTER_PHONE_PANEL_LAYOUT = {
  spacing: {
    headerGap: 12,
    sectionGap: 14,
    fieldControlMinHeight: 56,
    privacyTop: 14,
    footerTop: 12,
    taskCardOffsetY: 16,
    footerBottomTrim: 24,
    termsTargetMinHeight: 52,
    legalTargetMinHeight: 44
  },
  typography: {
    eyebrow: { fontSize: 12, lineHeight: 16, letterSpacing: 0.8 },
    title: { fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
    fieldLabel: { fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
    fieldValue: { fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
    helper: { fontSize: 12, lineHeight: 17, letterSpacing: 0 },
    privacy: { fontSize: 12, lineHeight: 17, letterSpacing: 0 },
    footer: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
    legal: { fontSize: 12, lineHeight: 16, letterSpacing: 0.1 }
  }
} as const

export function hasBalancedRegisterPhoneTypography(): boolean {
  const { spacing, typography } = REGISTER_PHONE_PANEL_LAYOUT

  return (
    typography.title.fontSize > typography.fieldLabel.fontSize &&
    typography.title.fontSize <= 22 &&
    typography.title.lineHeight > typography.title.fontSize &&
    typography.helper.fontSize < typography.fieldValue.fontSize &&
    typography.privacy.fontSize <= typography.fieldLabel.fontSize &&
    spacing.fieldControlMinHeight >= 44 &&
    spacing.termsTargetMinHeight >= 44 &&
    spacing.legalTargetMinHeight >= 44
  )
}

export function resolveRegisterPhoneStageHeight(input: {
  dense: boolean
  veryCompact: boolean
}): number {
  if (!input.dense) return 280
  return input.veryCompact ? 162 : 174
}

export function canRequestRegisterPhoneCode(input: {
  phoneValid: boolean
  termsAccepted: boolean
  isSubmitting: boolean
}): boolean {
  return input.phoneValid && input.termsAccepted && !input.isSubmitting
}

/**
 * How the phone and code steps make room for the keyboard. The terms consent
 * sits in the action dock right above "send code", which rides the keyboard,
 * so its whole text is readable whenever the action is; the code step drops
 * it (the terms were accepted to send the code). The heading stays while
 * typing unless the screen is very short (an SE, large text), where it folds
 * so the field stays above the keyboard; both steps fold it alike, so moving
 * to the code step with the keyboard up never makes it pop in.
 */
export function resolveRegisterKeyboardLayout(
  metrics: { veryCompact: boolean },
  isCodeStep: boolean
): { consentInActionDock: boolean; collapseHeadingOnKeyboard: boolean } {
  return {
    consentInActionDock: !isCodeStep,
    collapseHeadingOnKeyboard: metrics.veryCompact
  }
}
