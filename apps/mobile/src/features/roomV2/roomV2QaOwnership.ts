import { ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS } from "./roomV3UniversalCoreCandidateIds"
import { ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS } from "./roomV3Focus12CandidateIds"
import { STARTER_ROOM_BED_ITEM_ID } from "./roomStarterModel"
import { ROOM_VNEXT_PILOT_FURNITURE_IDS } from "./roomVNextPilotIds"

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
  const canonicalCandidateIds = new Set<string>([
    ...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
    ...ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS,
    // The starter bed may be persisted only in the isolated VNext QA
    // namespace; production ownership still comes from inventory.
    STARTER_ROOM_BED_ITEM_ID,
    ...ROOM_VNEXT_PILOT_FURNITURE_IDS
  ])
  return [...new Set(
    input.candidateIds
      .filter((candidateId): candidateId is string => typeof candidateId === "string")
      .map((candidateId) => candidateId.trim())
      .filter((candidateId) => canonicalCandidateIds.has(candidateId))
  )]
}
