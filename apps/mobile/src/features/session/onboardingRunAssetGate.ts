import {
  BLUMI_BUILD_PROFILE,
  BLUMI_ONBOARDING_RUN_V3_QA_FLAG,
  BLUMI_ONBOARDING_RUN_V3_REVIEW_APPROVED_FLAG,
  BLUMI_ONBOARDING_RUN_V3_USER_APPROVED_FLAG,
  IS_BLUMI_DEVELOPMENT_RUNTIME
} from "../../config/env"
import { ONBOARDING_ASSET_PRODUCTION_PROMOTION } from "./onboardingAssetPromotion"

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

export const ONBOARDING_RUN_ASSET_MODE = resolveOnboardingRunAssetMode({
  isDevelopmentRuntime: IS_BLUMI_DEVELOPMENT_RUNTIME,
  buildProfile: BLUMI_BUILD_PROFILE,
  rawQaFlag: BLUMI_ONBOARDING_RUN_V3_QA_FLAG,
  independentReviewApproved:
    BLUMI_ONBOARDING_RUN_V3_REVIEW_APPROVED_FLAG?.trim() === "1",
  finalUserApproval:
    BLUMI_ONBOARDING_RUN_V3_USER_APPROVED_FLAG?.trim() === "1",
  productionApproved: ONBOARDING_ASSET_PRODUCTION_PROMOTION.run
})
