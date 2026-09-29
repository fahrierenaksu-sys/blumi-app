import {
  BLUMI_BUILD_PROFILE,
  BLUMI_PROFILE_CHARACTER_REACTION_QA_FLAG,
  BLUMI_PROFILE_CHARACTER_REACTION_REVIEW_APPROVED_FLAG,
  BLUMI_PROFILE_CHARACTER_REACTION_USER_APPROVED_FLAG,
  IS_BLUMI_DEVELOPMENT_RUNTIME
} from "../../config/env"
import { ONBOARDING_ASSET_PRODUCTION_PROMOTION } from "./onboardingAssetPromotion"

export type ProfileCharacterReactionAssetMode =
  | "fallback"
  | "candidate"
  | "approved"

export interface ProfileCharacterReactionAssetGateInput {
  buildProfile: string
  isDevelopmentRuntime: boolean
  rawQaFlag: string | undefined
  independentReviewApproved: boolean
  finalUserApproval: boolean
  productionApproved?: boolean
}

export function shouldUseProfileCharacterReactionAssets(
  mode: ProfileCharacterReactionAssetMode
): boolean {
  return mode === "candidate" || mode === "approved"
}

export function resolveProfileCharacterReactionAssetMode(
  input: ProfileCharacterReactionAssetGateInput
): ProfileCharacterReactionAssetMode {
  if (input.productionApproved) return "approved"
  const qaRequested = input.rawQaFlag?.trim() === "1"
  const qaBuildAllowed =
    input.buildProfile === "native-ui-test" ||
    (input.isDevelopmentRuntime && input.buildProfile === "development")
  if (!qaRequested || !qaBuildAllowed) return "fallback"
  return input.independentReviewApproved && input.finalUserApproval
    ? "approved"
    : "candidate"
}

export const PROFILE_CHARACTER_REACTION_ASSET_MODE =
  resolveProfileCharacterReactionAssetMode({
    isDevelopmentRuntime: IS_BLUMI_DEVELOPMENT_RUNTIME,
    buildProfile: BLUMI_BUILD_PROFILE,
    rawQaFlag: BLUMI_PROFILE_CHARACTER_REACTION_QA_FLAG,
    independentReviewApproved:
      BLUMI_PROFILE_CHARACTER_REACTION_REVIEW_APPROVED_FLAG?.trim() === "1",
    finalUserApproval:
      BLUMI_PROFILE_CHARACTER_REACTION_USER_APPROVED_FLAG?.trim() === "1",
    productionApproved:
      ONBOARDING_ASSET_PRODUCTION_PROMOTION.profileCharacterReaction
  })
