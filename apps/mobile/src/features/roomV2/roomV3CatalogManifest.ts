import {
  ROOM_V3_FURNITURE_CATEGORIES,
  ROOM_V3_HOME_COLLECTIONS,
  createRoomV3CatalogManifestPlan as createRoomV3CatalogManifestPlanFromProduction,
  createRoomV3UniversalCoreManifestPlan as createRoomV3UniversalCoreManifestPlanFromProduction,
  type RoomV3CatalogManifestPlanEntry,
  type RoomV3UniversalCoreManifestPlanEntry
, RoomV3PlacementRule } from "./roomV3ProductionPlan"
import type { RoomFurnitureRotation, RoomPlacementSurface } from "./roomV2.types"

/**
 * Catalog metadata is intentionally separate from runtime furniture assets.
 * A planned entry can describe a future SKU, but it can never make an asset
 * available to Room V2 without an independent artifact/evidence promotion.
 */
export const ROOM_V3_CATALOG_MANIFEST_VERSION = "room-v3-catalog-manifest-v1" as const
export const ROOM_V3_CATALOG_MANIFEST_BLOCKED_REASON = "asset_evidence_pending" as const

export type RoomV3CatalogPromotionStatus = "blocked"
export type RoomV3CatalogAssetStatus = "unpromoted"

export interface RoomV3CatalogPlacementMetadata {
  surface: RoomPlacementSurface
  rule: RoomV3PlacementRule
}

export interface RoomV3CatalogManifestEntry extends RoomV3CatalogManifestPlanEntry {
  directions: RoomFurnitureRotation[]
  requiredMaterialFamilies: string[]
  placement: RoomV3CatalogPlacementMetadata
  assetStatus: RoomV3CatalogAssetStatus
  promotionStatus: RoomV3CatalogPromotionStatus
  blockedReason: typeof ROOM_V3_CATALOG_MANIFEST_BLOCKED_REASON
  runtimeEligible: false
}

export interface RoomV3UniversalCoreManifestEntry
  extends RoomV3UniversalCoreManifestPlanEntry {
  directions: RoomFurnitureRotation[]
  compatibleHomeIds: string[]
  compatibleOptionalRoomDirectionIds: string[]
  requiredMaterialFamilies: string[]
  placement: RoomV3CatalogPlacementMetadata
  assetStatus: RoomV3CatalogAssetStatus
  promotionStatus: RoomV3CatalogPromotionStatus
  blockedReason: typeof ROOM_V3_CATALOG_MANIFEST_BLOCKED_REASON
  runtimeEligible: false
}

export type RoomV3CatalogManifestAnyEntry =
  | RoomV3CatalogManifestEntry
  | RoomV3UniversalCoreManifestEntry

export interface RoomV3CatalogManifestCounts {
  homeCollectionCount: number
  categoryCount: number
  themedProductCount: number
  universalCoreProductCount: number
  totalManifestEntryCount: number
  themedDirectionalProductCount: number
  themedSingleViewProductCount: number
  universalCoreCategoryCount: number
}

export const ROOM_V3_CATALOG_MANIFEST_COUNTS: RoomV3CatalogManifestCounts = {
  homeCollectionCount: ROOM_V3_HOME_COLLECTIONS.length,
  categoryCount: ROOM_V3_FURNITURE_CATEGORIES.length,
  themedProductCount: ROOM_V3_HOME_COLLECTIONS.length *
    ROOM_V3_FURNITURE_CATEGORIES.length *
    2,
  universalCoreProductCount: ROOM_V3_FURNITURE_CATEGORIES.length,
  totalManifestEntryCount:
    ROOM_V3_HOME_COLLECTIONS.length * ROOM_V3_FURNITURE_CATEGORIES.length * 2 +
    ROOM_V3_FURNITURE_CATEGORIES.length,
  themedDirectionalProductCount: ROOM_V3_HOME_COLLECTIONS.length *
    ROOM_V3_FURNITURE_CATEGORIES.filter((category) => category.requiresDirectionalAssets)
      .length *
    2,
  themedSingleViewProductCount: ROOM_V3_HOME_COLLECTIONS.length *
    ROOM_V3_FURNITURE_CATEGORIES.filter((category) => !category.requiresDirectionalAssets)
      .length *
    2,
  universalCoreCategoryCount: ROOM_V3_FURNITURE_CATEGORIES.length
}

export function createRoomV3CatalogManifest(): RoomV3CatalogManifestEntry[] {
  return createRoomV3CatalogManifestPlanFromProduction().map(toCatalogManifestEntry)
}

export function createRoomV3UniversalCoreManifest(): RoomV3UniversalCoreManifestEntry[] {
  return createRoomV3UniversalCoreManifestPlanFromProduction().map(toUniversalCoreManifestEntry)
}

/**
 * Compatibility aliases for callers that use the production-plan naming.
 * The returned entries still carry this module's fail-closed promotion fields.
 */
export const createRoomV3CatalogManifestPlan = createRoomV3CatalogManifest
export const createRoomV3UniversalCoreManifestPlan = createRoomV3UniversalCoreManifest

/**
 * Snapshots are convenience exports only. Runtime code must use a promotion
 * registry; these snapshots remain blocked and contain no asset references.
 */
export const ROOM_V3_CATALOG_MANIFEST: readonly RoomV3CatalogManifestEntry[] =
  createRoomV3CatalogManifest()
export const ROOM_V3_UNIVERSAL_CORE_MANIFEST: readonly RoomV3UniversalCoreManifestEntry[] =
  createRoomV3UniversalCoreManifest()

export function getRoomV3RuntimeCatalogManifest(
  entries: readonly RoomV3CatalogManifestAnyEntry[] = [
    ...createRoomV3CatalogManifest(),
    ...createRoomV3UniversalCoreManifest()
  ]
): RoomV3CatalogManifestAnyEntry[] {
  // The metadata-only manifest is not an approval registry. Validate first so
  // malformed or accidentally promoted entries fail closed rather than leak
  // into the runtime catalog.
  if (!validateRoomV3CatalogManifest(entries).isValid) return []

  return entries
    .filter((entry) => entry.runtimeEligible)
    .map(cloneManifestEntry)
}

export interface RoomV3CatalogManifestValidation {
  isValid: boolean
  issueIds: string[]
}

export function validateRoomV3CatalogManifest(
  entries: readonly RoomV3CatalogManifestAnyEntry[]
): RoomV3CatalogManifestValidation {
  const issueIds = new Set<string>()
  const ids = new Set<string>()

  if (entries.length === 0) issueIds.add("empty_manifest")

  for (const entry of entries) {
    if (ids.has(entry.id)) issueIds.add("duplicate_id")
    ids.add(entry.id)

    if (entry.placement.surface !== entry.placementSurface) {
      issueIds.add("placement_surface_mismatch")
    }
    if (entry.placement.rule !== entry.placementRule) {
      issueIds.add("placement_rule_mismatch")
    }
    if (entry.assetStatus !== "unpromoted") issueIds.add("asset_not_unpromoted")
    if (entry.promotionStatus !== "blocked") issueIds.add("promotion_not_blocked")
    if (entry.blockedReason !== ROOM_V3_CATALOG_MANIFEST_BLOCKED_REASON) {
      issueIds.add("missing_asset_evidence_block")
    }
    if (entry.runtimeEligible !== false) issueIds.add("runtime_not_fail_closed")
    if (entry.directions.length !== 1 && entry.directions.length !== 4) {
      issueIds.add("invalid_directional_metadata")
    }
  }

  return { isValid: issueIds.size === 0, issueIds: [...issueIds] }
}

function toCatalogManifestEntry(
  entry: RoomV3CatalogManifestPlanEntry
): RoomV3CatalogManifestEntry {
  return {
    ...entry,
    placement: {
      surface: entry.placementSurface,
      rule: entry.placementRule
    },
    directions: [...entry.directions] as RoomFurnitureRotation[],
    requiredMaterialFamilies: [...entry.requiredMaterialFamilies],
    assetStatus: "unpromoted",
    promotionStatus: "blocked",
    blockedReason: ROOM_V3_CATALOG_MANIFEST_BLOCKED_REASON,
    runtimeEligible: false
  }
}

function toUniversalCoreManifestEntry(
  entry: RoomV3UniversalCoreManifestPlanEntry
): RoomV3UniversalCoreManifestEntry {
  return {
    ...entry,
    placement: {
      surface: entry.placementSurface,
      rule: entry.placementRule
    },
    directions: [...entry.directions] as RoomFurnitureRotation[],
    compatibleHomeIds: [...entry.compatibleHomeIds],
    compatibleOptionalRoomDirectionIds: [...entry.compatibleOptionalRoomDirectionIds],
    requiredMaterialFamilies: [...entry.requiredMaterialFamilies],
    assetStatus: "unpromoted",
    promotionStatus: "blocked",
    blockedReason: ROOM_V3_CATALOG_MANIFEST_BLOCKED_REASON,
    runtimeEligible: false
  }
}

function cloneManifestEntry(entry: RoomV3CatalogManifestAnyEntry): RoomV3CatalogManifestAnyEntry {
  if ("compatibleHomeIds" in entry) {
    return toUniversalCoreManifestEntry(entry)
  }
  return toCatalogManifestEntry(entry)
}
