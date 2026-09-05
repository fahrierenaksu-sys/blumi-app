import {
  getRoomV2MigrationMarkerKey,
  getRoomV2StorageKey,
  type RoomV2StorageNamespace
} from "./roomV2Persistence"
import { resolveRoomV2QaOwnedItemIds } from "./roomV2QaOwnership"
import { STARTER_ROOM_BED_ITEM_ID } from "./roomStarterModel"

export interface RoomV2ProviderRuntimeConfigInput {
  storageScopeId: string | undefined
  storageNamespace: RoomV2StorageNamespace
  isDevelopmentRuntime: boolean
  isQaRuntimeAuthorized?: boolean
  isVNextRuntimeProof?: boolean
  allowStarterOnboardingEdits?: boolean
  excludedRoomItemIds?: readonly string[]
  inventoryIsReady: boolean
  inventoryOwnedItemIds: readonly string[]
  qaOnlyOwnedRoomItemIds: readonly string[] | null | undefined
}

export interface RoomV2ProviderRuntimeConfig {
  storageKey: string | null
  migrationMarkerKey: string | null
  ownedRoomItemIds: string[]
  inventoryReadyForRoomEdits: boolean
}

/**
 * Pure runtime contract consumed by RoomV2Provider. It keeps QA storage and
 * temporary ownership decisions testable without mounting native storage.
 */
export function resolveRoomV2ProviderRuntimeConfig(
  input: RoomV2ProviderRuntimeConfigInput
): RoomV2ProviderRuntimeConfig {
  const storageKey = getRoomV2StorageKey(
    input.storageScopeId,
    input.storageNamespace
  )
  const migrationMarkerKey = input.storageScopeId?.trim()
    ? getRoomV2MigrationMarkerKey(
      input.storageScopeId,
      input.storageNamespace
    )
    : null
  const isVNextRuntimeProof = input.isVNextRuntimeProof === true
  const excludedRoomItemIds = new Set(input.excludedRoomItemIds ?? [])
  const qaOwnedRoomItemIds = resolveRoomV2QaOwnedItemIds({
    isDevelopmentRuntime: input.isDevelopmentRuntime,
    isQaRuntimeAuthorized:
      input.isQaRuntimeAuthorized === true || isVNextRuntimeProof,
    storageNamespace: input.storageNamespace,
    candidateIds: [
      ...(isVNextRuntimeProof ? [STARTER_ROOM_BED_ITEM_ID] : []),
      ...(input.qaOnlyOwnedRoomItemIds ?? [])
    ]
  })

  const ownedRoomItemIds = [
    ...new Set([
      ...input.inventoryOwnedItemIds,
      ...(input.allowStarterOnboardingEdits === true
        ? [STARTER_ROOM_BED_ITEM_ID]
        : []),
      ...qaOwnedRoomItemIds
    ])
  ].filter((itemId) => !excludedRoomItemIds.has(itemId))

  return {
    storageKey,
    migrationMarkerKey,
    ownedRoomItemIds,
    inventoryReadyForRoomEdits:
      input.inventoryIsReady ||
      input.allowStarterOnboardingEdits === true ||
      ((input.isDevelopmentRuntime ||
        input.isQaRuntimeAuthorized === true ||
        isVNextRuntimeProof) &&
        input.storageNamespace === "qa" &&
        qaOwnedRoomItemIds.length > 0)
  }
}
