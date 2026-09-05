import type {
  FurnitureItem,
  RoomFurnitureRotation,
  RoomFootprint,
  RoomSeatSpec
} from "./roomV2.types"
import {
  ROOM_V3_FURNITURE_CATEGORIES,
  type RoomV3FurnitureCategoryPlan
} from "./roomV3ProductionPlan"
import {
  ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
} from "./roomV3UniversalCoreInventory"
import { ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID } from "./roomV3UniversalCoreArtifactRegistry"

/**
 * This manifest is deliberately a static runtime board. It records deterministic
 * metadata already present in the runtime factories and trusted artifact registry;
 * it is not a Simulator run and cannot be used as promotion evidence.
 */
export const ROOM_V3_UNIVERSAL_CORE_STATIC_RUNTIME_EVIDENCE_SCHEMA_VERSION =
  "room-v3-universal-core-static-runtime-evidence-v1" as const

export const ROOM_V3_UNIVERSAL_CORE_STATIC_RUNTIME_EVIDENCE_STATUS =
  "evidence_only" as const

export const ROOM_V3_UNIVERSAL_CORE_STATIC_ARTIFACT_REGISTRY_PATH =
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_artifact_registry.json" as const

export const ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_VERSION =
  "room-v3-universal-core-artifact-verifier-v1" as const

export type UniversalCoreStaticRotation = RoomFurnitureRotation

export interface UniversalCoreArtifactAssetRecord {
  direction: UniversalCoreStaticRotation
  path: string
  sha256: string
  canvasSize: { width: number; height: number }
  alphaBounds: {
    minX: number
    minY: number
    maxXInclusive: number
    maxYInclusive: number
  }
}

export interface UniversalCoreArtifactProductRecord {
  id: string
  requiredDirections?: readonly UniversalCoreStaticRotation[]
  issueIds?: readonly string[]
  assets: readonly UniversalCoreArtifactAssetRecord[]
}

export interface UniversalCoreArtifactRegistryInput {
  verifierVersion: string
  isTrusted: boolean
  productCount: number
  issueIds: readonly string[]
  products: readonly UniversalCoreArtifactProductRecord[]
}

export interface UniversalCoreStaticRuntimeEvidenceArtifact {
  verifierVersion: string
  registryPath: typeof ROOM_V3_UNIVERSAL_CORE_STATIC_ARTIFACT_REGISTRY_PATH
  candidateId: string
  directions: readonly UniversalCoreArtifactAssetRecord[]
}

export interface UniversalCoreStaticRuntimeRotationCoverage {
  required: readonly UniversalCoreStaticRotation[]
  available: readonly UniversalCoreStaticRotation[]
  policy: string
  status: "complete" | "front_only_expected" | "blocked_missing_rotation"
}

export interface UniversalCoreStaticRuntimeCollisionFootprint {
  status: "reported" | "not_required" | "missing_runtime_metadata"
  blocksMovement: boolean
  byRotation: Readonly<Partial<Record<UniversalCoreStaticRotation, RoomFootprint>>>
  source: "runtime_factory_static_metadata" | "none"
}

export interface UniversalCoreStaticRuntimeSeatRoute {
  status: "metadata_only"
  source: "runtime_factory_static_metadata"
  capacity: number
  seatPoints: RoomSeatSpec["seatPoints"]
}

export interface UniversalCoreStaticRuntimeEvidenceRow {
  candidateId: string
  categoryId: string
  placementSurface: RoomV3FurnitureCategoryPlan["placementSurface"]
  interactionType: RoomV3FurnitureCategoryPlan["interactionType"]
  placementRule: RoomV3FurnitureCategoryPlan["placementRule"]
  artifact: UniversalCoreStaticRuntimeEvidenceArtifact
  rotationCoverage: UniversalCoreStaticRuntimeRotationCoverage
  collisionFootprint: UniversalCoreStaticRuntimeCollisionFootprint
  /** Runtime seat route, even when the production plan does not classify the SKU as seatable. */
  runtimeSeatRoute: UniversalCoreStaticRuntimeSeatRoute | null
  seatRoute: UniversalCoreStaticRuntimeSeatRoute | null
  runtimeMetadata: {
    width: number
    height: number
    layer: FurnitureItem["layer"]
    blocksMovement: boolean
  }
  evidence: {
    mode: typeof ROOM_V3_UNIVERSAL_CORE_STATIC_RUNTIME_EVIDENCE_STATUS
    collision: "metadata_only" | "not_required" | "missing_runtime_metadata"
    seating: "metadata_only" | "not_applicable" | "missing_runtime_metadata"
    persistence: "not_collected"
    simulator: "not_collected"
    independentReview: "not_collected"
    simulatorEvidenceId: null
    persistenceEvidenceId: null
    independentReviewId: null
  }
}

export interface RoomV3UniversalCoreStaticRuntimeEvidenceManifest {
  schemaVersion: typeof ROOM_V3_UNIVERSAL_CORE_STATIC_RUNTIME_EVIDENCE_SCHEMA_VERSION
  status: typeof ROOM_V3_UNIVERSAL_CORE_STATIC_RUNTIME_EVIDENCE_STATUS
  promotionEligible: false
  simulatorEvidenceIncluded: false
  persistenceEvidenceIncluded: false
  independentReviewIncluded: false
  artifactRegistry: {
    path: typeof ROOM_V3_UNIVERSAL_CORE_STATIC_ARTIFACT_REGISTRY_PATH
    verifierVersion: string
    isTrusted: true
    productCount: 45
  }
  products: readonly UniversalCoreStaticRuntimeEvidenceRow[]
  summary: {
    productCount: 45
    directionalRotationCount: number
    frontOnlyRotationCount: number
    collisionFootprintReportedCount: number
    collisionFootprintMissingCount: number
    plannedSeatRouteCount: number
    plannedSeatRouteMetadataCount: number
    runtimeSeatRouteNotPlannedCount: number
  }
  gaps: readonly string[]
}

const REQUIRED_ROTATIONS: readonly UniversalCoreStaticRotation[] = [
  "front",
  "back",
  "left",
  "right"
]

type RuntimeFurnitureModule = typeof import("./roomV3UniversalCoreRuntimeFurniture")

/** Build the trusted runtime registry consumed by the runtime factories. */
export function createTrustedUniversalCoreArtifactRegistry(
  registry: UniversalCoreArtifactRegistryInput,
  runtimeModule: RuntimeFurnitureModule
) {
  const ids = [...runtimeModule.ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS]
  const products = indexArtifactProducts(registry, ids)
  return {
    verifierId: runtimeModule.ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
    artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    verifiedCandidateIds: ids,
    verifiedAssetHashesByCandidateId: Object.fromEntries(
      ids.map((id) => [
        id,
        Object.fromEntries(products.get(id)!.assets.map((asset) => [asset.direction, asset.sha256]))
      ])
    )
  }
}

export function createRoomV3UniversalCoreStaticRuntimeEvidenceManifest(
  registry: UniversalCoreArtifactRegistryInput
): RoomV3UniversalCoreStaticRuntimeEvidenceManifest {
  assertTrustedArtifactRegistry(registry)

  // Runtime furniture imports PNGs. Keeping this require dynamic lets callers
  // install the same deterministic PNG module hook used by runtime tests first.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const runtimeModule = require("./roomV3UniversalCoreRuntimeFurniture") as RuntimeFurnitureModule
  const ids = [...runtimeModule.ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS]
  const artifactProducts = indexArtifactProducts(registry, ids)
  const trustedRegistry = createTrustedUniversalCoreArtifactRegistry(registry, runtimeModule)
  const runtimeItems = runtimeModule.createRoomV3UniversalCoreRuntimeFurniture(trustedRegistry)
  if (runtimeItems.length !== ids.length) {
    throw new Error(`runtime_factory_incomplete:${runtimeItems.length}/${ids.length}`)
  }

  const categories = new Map(ROOM_V3_FURNITURE_CATEGORIES.map((category) => [category.id, category]))
  const rows = ids.map((candidateId) => {
    const item = runtimeItems.find((runtimeItem) => runtimeItem.id === candidateId)
    if (!item) throw new Error(`runtime_item_missing:${candidateId}`)
    const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[candidateId]
    const category = categoryId ? categories.get(categoryId) : undefined
    if (!category) throw new Error(`production_category_missing:${candidateId}`)
    const artifactProduct = artifactProducts.get(candidateId)!
    return createEvidenceRow(candidateId, category, item, artifactProduct)
  })

  const collisionFootprintReportedCount = rows.filter(
    (row) => row.collisionFootprint.status === "reported"
  ).length
  const collisionFootprintMissingCount = rows.filter(
    (row) => row.collisionFootprint.status === "missing_runtime_metadata"
  ).length
  const plannedSeatRouteCount = rows.filter((row) => row.interactionType === "seat").length
  const plannedSeatRouteMetadataCount = rows.filter((row) => row.seatRoute !== null).length
  const runtimeSeatRouteNotPlannedCount = rows.filter(
    (row) => row.interactionType !== "seat" && hasRuntimeSeatRoute(row.candidateId, runtimeItems)
  ).length

  const gaps = [
    "simulator_evidence_not_collected",
    "persistence_evidence_not_collected",
    "independent_review_not_collected",
    ...rows
      .filter((row) => row.collisionFootprint.status === "missing_runtime_metadata")
      .map((row) => `collision_footprint_missing:${row.candidateId}`),
    ...rows
      .filter((row) => row.interactionType === "seat" && row.seatRoute === null)
      .map((row) => `seat_route_missing:${row.candidateId}`),
    ...rows
      .filter((row) => row.interactionType !== "seat" && hasRuntimeSeatRoute(row.candidateId, runtimeItems))
      .map((row) => `runtime_seat_route_not_planned:${row.candidateId}`)
  ]

  return {
    schemaVersion: ROOM_V3_UNIVERSAL_CORE_STATIC_RUNTIME_EVIDENCE_SCHEMA_VERSION,
    status: ROOM_V3_UNIVERSAL_CORE_STATIC_RUNTIME_EVIDENCE_STATUS,
    promotionEligible: false,
    simulatorEvidenceIncluded: false,
    persistenceEvidenceIncluded: false,
    independentReviewIncluded: false,
    artifactRegistry: {
      path: ROOM_V3_UNIVERSAL_CORE_STATIC_ARTIFACT_REGISTRY_PATH,
      verifierVersion: registry.verifierVersion,
      isTrusted: true,
      productCount: 45
    },
    products: rows,
    summary: {
      productCount: 45,
      directionalRotationCount: rows.filter((row) => row.rotationCoverage.status === "complete").length,
      frontOnlyRotationCount: rows.filter((row) => row.rotationCoverage.status === "front_only_expected").length,
      collisionFootprintReportedCount,
      collisionFootprintMissingCount,
      plannedSeatRouteCount,
      plannedSeatRouteMetadataCount,
      runtimeSeatRouteNotPlannedCount
    },
    gaps
  }
}

export function assertTrustedArtifactRegistry(
  registry: UniversalCoreArtifactRegistryInput
): asserts registry is UniversalCoreArtifactRegistryInput {
  if (!registry || registry.isTrusted !== true) throw new Error("artifact_registry_not_trusted")
  if (registry.productCount !== 45 || registry.products.length !== 45) {
    throw new Error("artifact_registry_incomplete")
  }
  if (
    registry.verifierVersion !== ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_VERSION ||
    registry.issueIds.length > 0
  ) {
    throw new Error("artifact_registry_has_issues")
  }
}

function createEvidenceRow(
  candidateId: string,
  category: RoomV3FurnitureCategoryPlan,
  item: FurnitureItem,
  artifactProduct: UniversalCoreArtifactProductRecord
): UniversalCoreStaticRuntimeEvidenceRow {
  const required: readonly UniversalCoreStaticRotation[] = category.requiresDirectionalAssets
    ? REQUIRED_ROTATIONS
    : ["front"]
  const available: readonly UniversalCoreStaticRotation[] = item.assetsByRotation
    ? REQUIRED_ROTATIONS.filter((rotation) => Boolean(item.assetsByRotation?.[rotation]))
    : ["front"]
  const coverageStatus = required.every((rotation) => available.includes(rotation))
    ? required.length === 1
      ? "front_only_expected"
      : "complete"
    : "blocked_missing_rotation"
  const footprintByRotation = cloneFootprints(item)
  const isCollisionRequired = Boolean(item.blocksMovement)
  const collisionStatus = Object.keys(footprintByRotation).length > 0
    ? "reported"
    : isCollisionRequired
      ? "missing_runtime_metadata"
      : "not_required"
  const runtimeSeatRoute = item.seatSpec ? cloneSeatRoute(item.seatSpec) : null
  const seatRoute = category.interactionType === "seat" ? runtimeSeatRoute : null
  const artifact: UniversalCoreStaticRuntimeEvidenceArtifact = {
    verifierVersion: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_VERSION,
    registryPath: ROOM_V3_UNIVERSAL_CORE_STATIC_ARTIFACT_REGISTRY_PATH,
    candidateId,
    directions: [...artifactProduct.assets]
  }

  return {
    candidateId,
    categoryId: category.id,
    placementSurface: category.placementSurface,
    interactionType: category.interactionType,
    placementRule: category.placementRule,
    artifact,
    rotationCoverage: {
      required,
      available,
      policy: item.rotationPolicy ?? "front_only",
      status: coverageStatus
    },
    collisionFootprint: {
      status: collisionStatus,
      blocksMovement: Boolean(item.blocksMovement),
      byRotation: footprintByRotation,
      source: Object.keys(footprintByRotation).length > 0
        ? "runtime_factory_static_metadata"
        : "none"
    },
    runtimeSeatRoute,
    seatRoute,
    runtimeMetadata: {
      width: item.width,
      height: item.height,
      layer: item.layer,
      blocksMovement: Boolean(item.blocksMovement)
    },
    evidence: {
      mode: ROOM_V3_UNIVERSAL_CORE_STATIC_RUNTIME_EVIDENCE_STATUS,
      collision: collisionStatus === "reported"
        ? "metadata_only"
        : collisionStatus === "not_required"
          ? "not_required"
          : "missing_runtime_metadata",
      seating: category.interactionType === "seat"
        ? seatRoute
          ? "metadata_only"
          : "missing_runtime_metadata"
        : "not_applicable",
      persistence: "not_collected",
      simulator: "not_collected",
      independentReview: "not_collected",
      simulatorEvidenceId: null,
      persistenceEvidenceId: null,
      independentReviewId: null
    }
  }
}

function indexArtifactProducts(
  registry: UniversalCoreArtifactRegistryInput,
  ids: readonly string[]
): Map<string, UniversalCoreArtifactProductRecord> {
  const byId = new Map(registry.products.map((product) => [product.id, product]))
  for (const id of ids) {
    const product = byId.get(id)
    if (!product || product.issueIds?.length || !product.assets.length) {
      throw new Error(`artifact_product_invalid:${id}`)
    }
  }
  return byId
}

function cloneFootprints(item: FurnitureItem): Readonly<Partial<Record<RoomFurnitureRotation, RoomFootprint>>> {
  const source = item.footprintByRotation ?? (item.footprint ? { front: item.footprint } : {})
  return Object.fromEntries(
    REQUIRED_ROTATIONS
      .filter((rotation) => Boolean(source[rotation]))
      .map((rotation) => [rotation, { ...source[rotation]! }])
  ) as Partial<Record<RoomFurnitureRotation, RoomFootprint>>
}

function cloneSeatRoute(seatSpec: RoomSeatSpec): UniversalCoreStaticRuntimeSeatRoute {
  return {
    status: "metadata_only",
    source: "runtime_factory_static_metadata",
    capacity: seatSpec.capacity,
    seatPoints: seatSpec.seatPoints.map((seatPoint) => ({
      ...seatPoint,
      approachPoint: seatPoint.approachPoint ? { ...seatPoint.approachPoint } : undefined,
      exitPoint: seatPoint.exitPoint ? { ...seatPoint.exitPoint } : undefined
    }))
  }
}

function hasRuntimeSeatRoute(candidateId: string, runtimeItems: readonly FurnitureItem[]) {
  return Boolean(runtimeItems.find((item) => item.id === candidateId)?.seatSpec)
}
