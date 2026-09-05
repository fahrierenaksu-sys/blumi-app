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
