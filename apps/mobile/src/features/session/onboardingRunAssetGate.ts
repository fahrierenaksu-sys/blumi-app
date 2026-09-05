export type OnboardingRunAssetMode =
  | "walk-fallback"
  | "candidate"
  | "approved-run"

export interface OnboardingRunAssetGateInput {
  buildProfile: string
  isDevelopmentRuntime: boolean
  rawQaFlag: string | undefined
  independentReviewApproved: boolean
  finalUserApproval: boolean
  productionApproved?: boolean
}

export function shouldUseOnboardingArrivalAssets(
  mode: OnboardingRunAssetMode
): boolean {
  return mode === "candidate" || mode === "approved-run"
}

export function resolveOnboardingRunAssetMode(
  input: OnboardingRunAssetGateInput
): OnboardingRunAssetMode {
  if (input.productionApproved) {
    return "approved-run"
  }
  const qaRequested = input.rawQaFlag?.trim() === "1"
  const qaBuildAllowed =
    input.buildProfile === "native-ui-test" ||
    (input.isDevelopmentRuntime && input.buildProfile === "development")
  if (!qaRequested || !qaBuildAllowed) return "walk-fallback"
  return input.independentReviewApproved && input.finalUserApproval
    ? "approved-run"
    : "candidate"
}
