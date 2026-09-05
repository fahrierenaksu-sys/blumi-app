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
