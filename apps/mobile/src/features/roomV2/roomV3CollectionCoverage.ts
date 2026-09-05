import {
  ROOM_V3_CATALOG_MANIFEST,
  ROOM_V3_UNIVERSAL_CORE_MANIFEST,
  type RoomV3CatalogManifestEntry
} from "./roomV3CatalogManifest"
import { ROOM_V3_HOME_COLLECTIONS } from "./roomV3ProductionPlan"

export type RoomV3CollectionCoverageStatus =
  | "planned_no_asset"
  | "candidate_asset_pending_runtime"
  | "renderer_gallery_only"
  | "placement_blocked"

export interface RoomV3CollectionCoverageRow {
  wave: "themed" | "universal_core"
  homeId: string
  collectionId: string
  categoryId: string
  variant: "a" | "b"
  productId: string
  requiresDirectionalAssets: boolean
  directions: string[]
  placementSurface: string
  interactionType: string
  status: RoomV3CollectionCoverageStatus
  assetPath?: string
  evidencePath?: string
}

export interface RoomV3CollectionCoverageSummary {
  homeCount: number
  categoryCount: number
  themedRows: number
  universalCoreRows: number
  totalRows: number
  themedCompleteRows: number
  themedPendingRows: number
  universalCoreRendererRows: number
  universalCorePlacementBlockedRows: number
}

const THEMED_CANDIDATE_EVIDENCE_BY_PRODUCT_ID: Readonly<Record<string, {
  assetPath: string
  evidencePath: string
}>> = {
  room_v3_cocoa_navy_modern_studio_lounge_armchair_b: {
    assetPath:
      "apps/mobile/src/features/roomV2/assets/runtime/candidates/cocoa_navy_lounge_armchair_b/",
    evidencePath:
      "docs/room-v3-qa/2026-07-18-universal-core-wave/cocoa_navy_lounge_armchair_b_pilot.md"
  },
  room_v3_cocoa_navy_modern_studio_dining_table_b: {
    assetPath:
      "apps/mobile/src/features/roomV2/assets/runtime/candidates/cocoa_navy_dining_table_b/",
    evidencePath:
      "docs/room-v3-qa/2026-07-18-universal-core-wave/cocoa_navy_dining_table_b_pilot.md"
  },
  room_v3_cocoa_navy_modern_studio_dining_chair_a: {
    assetPath:
      "apps/mobile/src/features/roomV2/assets/runtime/candidates/cocoa_dining_chair_a/",
    evidencePath:
      "docs/room-v3-qa/2026-07-20-cocoa-pilot-wave/evidence.md"
  },
  room_v3_cocoa_navy_modern_studio_dining_chair_b: {
    assetPath:
      "apps/mobile/src/features/roomV2/assets/runtime/candidates/cocoa_dining_chair_b/",
    evidencePath:
      "docs/room-v3-qa/2026-07-20-cocoa-pilot-wave/evidence.md"
  },
  room_v3_cocoa_navy_modern_studio_dining_table_a: {
    assetPath:
      "apps/mobile/src/features/roomV2/assets/runtime/candidates/cocoa_dining_table_a/",
    evidencePath:
      "docs/room-v3-qa/2026-07-20-cocoa-pilot-wave/evidence.md"
  },
  room_v3_cocoa_navy_modern_studio_lounge_armchair_a: {
    assetPath:
      "apps/mobile/src/features/roomV2/assets/runtime/candidates/cocoa_lounge_armchair_b/",
    evidencePath:
      "docs/room-v3-qa/2026-07-20-cocoa-pilot-wave/evidence.md"
  }
}

/**
 * Product-manager coverage ledger for the full brief. This is intentionally
 * separate from the runtime promotion registry: a matrix row never makes an
 * asset available in Room V2 by itself.
 */
export function createRoomV3CollectionCoverageMatrix(): RoomV3CollectionCoverageRow[] {
  const themedRows = ROOM_V3_CATALOG_MANIFEST.map((entry) =>
    toCoverageRow(entry, "themed")
  )
  const universalRows = ROOM_V3_UNIVERSAL_CORE_MANIFEST.map((entry) => ({
    wave: "universal_core" as const,
    homeId: "universal_core",
    collectionId: entry.collectionId,
    categoryId: entry.categoryId,
    variant: entry.variant,
    productId: entry.id,
    requiresDirectionalAssets: entry.requiresDirectionalAssets,
    directions: [...entry.directions],
    placementSurface: entry.placementSurface,
    interactionType: entry.interactionType,
    status: "renderer_gallery_only" as const,
    evidencePath:
      "docs/room-v3-qa/2026-07-18-universal-core-wave/live-gallery/manifest.json"
  }))

  return [...themedRows, ...universalRows]
}

export function summarizeRoomV3CollectionCoverage(
  rows: readonly RoomV3CollectionCoverageRow[] =
    createRoomV3CollectionCoverageMatrix()
): RoomV3CollectionCoverageSummary {
  const themed = rows.filter((row) => row.wave === "themed")
  const universal = rows.filter((row) => row.wave === "universal_core")
  return {
    homeCount: ROOM_V3_HOME_COLLECTIONS.length,
    categoryCount: new Set(themed.map((row) => row.categoryId)).size,
    themedRows: themed.length,
    universalCoreRows: universal.length,
    totalRows: rows.length,
    themedCompleteRows: themed.filter(
      (row) => row.status === "candidate_asset_pending_runtime"
    ).length,
    themedPendingRows: themed.filter(
      (row) => row.status === "planned_no_asset"
    ).length,
    universalCoreRendererRows: universal.filter(
      (row) => row.status === "renderer_gallery_only"
    ).length,
    universalCorePlacementBlockedRows: universal.filter(
      (row) => row.status === "placement_blocked"
    ).length
  }
}

function toCoverageRow(
  entry: RoomV3CatalogManifestEntry,
  wave: "themed"
): RoomV3CollectionCoverageRow {
  const candidateEvidence = THEMED_CANDIDATE_EVIDENCE_BY_PRODUCT_ID[entry.id]
  return {
    wave,
    homeId: entry.homeTheme,
    collectionId: entry.collectionId,
    categoryId: entry.categoryId,
    variant: entry.variant,
    productId: entry.id,
    requiresDirectionalAssets: entry.requiresDirectionalAssets,
    directions: [...entry.directions],
    placementSurface: entry.placementSurface,
    interactionType: entry.interactionType,
    status: candidateEvidence
      ? "candidate_asset_pending_runtime"
      : "planned_no_asset",
    ...(candidateEvidence
      ? {
          assetPath: candidateEvidence.assetPath,
          evidencePath: candidateEvidence.evidencePath
        }
      : {})
  }
}
