import { STARTER_ROOM_BED_ITEM_ID } from "./roomStarterModel"

export interface RoomV2QaOwnedItemIdsInput {
  isDevelopmentRuntime: boolean
  isQaRuntimeAuthorized?: boolean
  storageNamespace: "production" | "qa"
  candidateIds: readonly string[] | null | undefined
}

/**
 * Keeps temporary QA ownership out of production inventory. The provider uses
 * this only for its separately namespaced development preview state.
 */
export function resolveRoomV2QaOwnedItemIds(
  input: RoomV2QaOwnedItemIdsInput
): string[] {
  if (
    (!input.isDevelopmentRuntime && !input.isQaRuntimeAuthorized) ||
    input.storageNamespace !== "qa" ||
    !Array.isArray(input.candidateIds)
  ) {
    return []
  }
  // The starter bed may be persisted only in the isolated QA namespace;
  // production ownership still comes from inventory. Retired candidate IDs
  // (universal_*, room_vnext_*) are never granted.
  const canonicalCandidateIds = new Set<string>([STARTER_ROOM_BED_ITEM_ID])
  return [...new Set(
    input.candidateIds
      .filter((candidateId): candidateId is string => typeof candidateId === "string")
      .map((candidateId) => candidateId.trim())
      .filter((candidateId) => canonicalCandidateIds.has(candidateId))
  )]
}
