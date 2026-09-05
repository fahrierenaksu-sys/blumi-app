export type OnboardingWelcomeHomeAssetMode = "fallback" | "approved"

export interface OnboardingWelcomeHomeAssetGateInput {
  buildProfile: string
  isDevelopmentRuntime: boolean
  rawQaFlag: string | undefined
  independentReviewApproved: boolean
  finalUserApproval: boolean
  productionApproved?: boolean
}

export function resolveOnboardingWelcomeHomeAssetMode(
  input: OnboardingWelcomeHomeAssetGateInput
): OnboardingWelcomeHomeAssetMode {
  if (input.productionApproved) {
    return "approved"
  }
  const isAllowedBuild =
    input.buildProfile === "native-ui-test" ||
    (input.buildProfile === "development" && input.isDevelopmentRuntime)
  const hasExplicitQaAccess = input.rawQaFlag?.trim() === "1"
  const isApproved =
    input.independentReviewApproved && input.finalUserApproval
  return isAllowedBuild && hasExplicitQaAccess && isApproved
    ? "approved"
    : "fallback"
}
