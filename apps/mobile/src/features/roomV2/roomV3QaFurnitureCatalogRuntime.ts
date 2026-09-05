import type { FurnitureItem } from "./roomV2.types"
import {
  resolveRoomV3Focus12QaCatalog,
  type RoomV3Focus12QaArtifactRegistry
} from "./roomV3Focus12QaCatalog"
import {
  resolveRoomV3UniversalCoreQaInteractionCatalog,
  type RoomV3UniversalCoreQaInteractionCatalogResult
} from "./roomV3UniversalCoreQaCatalog"
import type { RoomV3UniversalCoreTrustedArtifactRegistry } from "./roomV3UniversalCoreRuntimeFurniture"
import { isExplicitRoomV3QaRuntime } from "./roomV3QaRuntimeGate"

export interface RoomV3QaFurnitureCatalogRuntimeInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawUniversalCoreQaFlag: string | undefined
  rawFocus12QaFlag: string | undefined
  universalCoreArtifactRegistry: RoomV3UniversalCoreTrustedArtifactRegistry | null | undefined
  focus12ArtifactRegistry: RoomV3Focus12QaArtifactRegistry | null | undefined
}

export type RoomV3QaFurnitureCatalogRuntimeReason =
  | "disabled"
  | "untrusted_registry"
  | "ready"

export type RoomV3QaFurnitureCatalogRuntimeMode =
  | "disabled"
  | "universal_core"
  | "focus12_plus_universal_core"

export interface RoomV3QaFurnitureCatalogRuntimeResult {
  enabled: boolean
  reason: RoomV3QaFurnitureCatalogRuntimeReason
  mode: RoomV3QaFurnitureCatalogRuntimeMode
  catalog: FurnitureItem[]
  ownedItemIds: string[]
}

/**
 * Resolves the development-only room-furniture QA catalog without touching
 * the production catalog, economy, or provider ownership. Focus12 is an
 * additive QA mode: it composes all trusted Universal Core items with its
 * three candidate items and deduplicates by canonical item ID.
 */
export function resolveRoomV3QaFurnitureCatalogRuntime(
  input: RoomV3QaFurnitureCatalogRuntimeInput
): RoomV3QaFurnitureCatalogRuntimeResult {
  if (!isExplicitDevelopmentQaRuntime(input)) {
    return disabledResult("disabled")
  }

  if (isExplicitQaFlagEnabled(input.rawFocus12QaFlag)) {
    return resolveFocus12PlusUniversalCore(input)
  }

  if (isExplicitQaFlagEnabled(input.rawUniversalCoreQaFlag)) {
    return resolveUniversalCore(input, input.rawUniversalCoreQaFlag)
  }

  return disabledResult("disabled")
}

function resolveFocus12PlusUniversalCore(
  input: RoomV3QaFurnitureCatalogRuntimeInput
): RoomV3QaFurnitureCatalogRuntimeResult {
  const universalCore = resolveUniversalCoreQaCatalog(input, input.rawFocus12QaFlag)
  const focus12 = resolveRoomV3Focus12QaCatalog({
    isDevelopmentRuntime: input.isDevelopmentRuntime,
    buildProfile: input.buildProfile,
    rawFocus12QaFlag: input.rawFocus12QaFlag,
    artifactRegistry: input.focus12ArtifactRegistry
  })

  if (!universalCore.enabled || !focus12.enabled) {
    return disabledResult(
      universalCore.enabled && focus12.reason === "disabled"
        ? "disabled"
        : "untrusted_registry"
    )
  }

  const catalog = uniqueItemsById([
    ...universalCore.catalog,
    ...focus12.catalog
  ])
  const expectedItemCount = universalCore.catalog.length + focus12.catalog.length
  if (catalog.length !== expectedItemCount) {
    return disabledResult("untrusted_registry")
  }

  return readyResult("focus12_plus_universal_core", catalog)
}

function resolveUniversalCore(
  input: RoomV3QaFurnitureCatalogRuntimeInput,
  rawPreviewFlag: string | undefined
): RoomV3QaFurnitureCatalogRuntimeResult {
  const universalCore = resolveUniversalCoreQaCatalog(input, rawPreviewFlag)
  if (!universalCore.enabled) {
    return disabledResult("untrusted_registry")
  }
  return readyResult("universal_core", universalCore.catalog)
}

function resolveUniversalCoreQaCatalog(
  input: RoomV3QaFurnitureCatalogRuntimeInput,
  rawPreviewFlag: string | undefined
): RoomV3UniversalCoreQaInteractionCatalogResult {
  return resolveRoomV3UniversalCoreQaInteractionCatalog({
    isDevelopmentRuntime: input.isDevelopmentRuntime,
    buildProfile: input.buildProfile,
    rawPreviewFlag,
    artifactRegistry: input.universalCoreArtifactRegistry
  })
}

function readyResult(
  mode: Exclude<RoomV3QaFurnitureCatalogRuntimeMode, "disabled">,
  catalog: readonly FurnitureItem[]
): RoomV3QaFurnitureCatalogRuntimeResult {
  const isolatedCatalog = catalog.map((item) => ({ ...item }))
  return {
    enabled: true,
    reason: "ready",
    mode,
    catalog: isolatedCatalog,
    // This is only a QA ownership handoff; consumers must still use the
    // separately namespaced QA provider/store before treating IDs as owned.
    ownedItemIds: isolatedCatalog.map((item) => item.id)
  }
}

function disabledResult(
  reason: Exclude<RoomV3QaFurnitureCatalogRuntimeReason, "ready">
): RoomV3QaFurnitureCatalogRuntimeResult {
  return {
    enabled: false,
    reason,
    mode: "disabled",
    catalog: [],
    ownedItemIds: []
  }
}

function isExplicitDevelopmentQaRuntime(
  input: RoomV3QaFurnitureCatalogRuntimeInput
): boolean {
  return isExplicitRoomV3QaRuntime(input)
}

function isExplicitQaFlagEnabled(rawFlag: string | undefined): boolean {
  return rawFlag?.trim() === "1"
}

function uniqueItemsById(items: readonly FurnitureItem[]): FurnitureItem[] {
  const itemsById = new Map<string, FurnitureItem>()
  for (const item of items) {
    if (!itemsById.has(item.id)) {
      itemsById.set(item.id, item)
    }
  }
  return [...itemsById.values()]
}
