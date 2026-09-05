import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "./roomV2.mock"
import {
  getRoomV2DraftPlacementCandidates
} from "./roomV2DraftPlacementCandidates"
import {
  getRoomV2FurniturePlacementSurface
} from "./roomV2PlacementSurface"
import {
  resolvePlacedFurnitureRenderItem,
  resolveRoomV2Scene,
  validateRoomV2FurniturePlacement,
  type RoomV2PlacementIssueId
} from "./roomV2Selectors"
import type {
  FurnitureItem,
  PlacedRoomItem,
  ResolvedRoomV2Scene,
  RoomFurnitureRotation,
  RoomPlacementSurface
} from "./roomV2.types"

export const ROOM_V3_UNIVERSAL_CORE_QA_RUNTIME_EVIDENCE_SCHEMA_VERSION =
  "room-v3-universal-core-qa-runtime-evidence-v1" as const

export type RoomV3UniversalCoreQaRuntimeEvidenceStatus =
  | "metadata_only_valid"
  | "metadata_only_blocked"

export interface RoomV3UniversalCoreQaRuntimeResolution {
  scene: ResolvedRoomV2Scene
  isValid: boolean
  issueIds: RoomV2PlacementIssueId[]
  blockingRenderIds: string[]
  selectedPlacement: Pick<PlacedRoomItem, "x" | "y" | "rotation">
  validationSource: "validateRoomV2FurniturePlacement"
}

export interface RoomV3UniversalCoreQaRuntimeRotationEvidence {
  rotation: RoomFurnitureRotation
  status: RoomV3UniversalCoreQaRuntimeEvidenceStatus
  issueIds: readonly RoomV2PlacementIssueId[]
  blockingRenderIds: readonly string[]
  placement: Pick<PlacedRoomItem, "x" | "y" | "rotation">
}

export interface RoomV3UniversalCoreQaRuntimeEvidenceRow {
  candidateId: string
  name: string
  placementSurface: RoomPlacementSurface
  runtimeMetadata: {
    width: number
    height: number
    blocksMovement: boolean
    interactionType: FurnitureItem["interactionType"]
    surfacePlacementPolicy?: FurnitureItem["surfacePlacementPolicy"]
  }
  placement: {
    status: RoomV3UniversalCoreQaRuntimeEvidenceStatus
    validator: "validateRoomV2FurniturePlacement"
    rotations: readonly RoomV3UniversalCoreQaRuntimeRotationEvidence[]
  }
  collision: {
    status: "metadata_only" | "blocked" | "not_required"
    crossSkuChecked: false
    blockingRenderIds: readonly string[]
  }
  seating: {
    status: "metadata_only" | "not_applicable"
    capacity: number | null
    seatPointIds: readonly string[]
    liveResult: null
  }
  simulator: {
    status: "not_collected"
    evidenceId: null
    screenshotPaths: readonly string[]
  }
  persistence: {
    status: "not_collected"
    evidenceId: null
  }
  status: RoomV3UniversalCoreQaRuntimeEvidenceStatus
}

export interface RoomV3UniversalCoreQaRuntimeEvidenceManifest {
  schemaVersion: typeof ROOM_V3_UNIVERSAL_CORE_QA_RUNTIME_EVIDENCE_SCHEMA_VERSION
  status: "evidence_only"
  promotionEligible: false
  validatorSource: "MyRoomEditorScreen"
  validator: "validateRoomV2FurniturePlacement"
  simulatorEvidenceIncluded: false
  persistenceEvidenceIncluded: false
  independentReviewIncluded: false
  products: readonly RoomV3UniversalCoreQaRuntimeEvidenceRow[]
  summary: {
    productCount: 45
    placementValidCount: number
    placementBlockedCount: number
    collisionMetadataCount: number
    collisionBlockedCount: number
    collisionNotRequiredCount: number
    seatingMetadataCount: number
    seatingNotApplicableCount: number
  }
  gaps: readonly string[]
}

const REQUIRED_ROTATIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "back",
  "left",
  "right"
]

export function getRoomV3UniversalCoreQaSupportedRotations(
  item: FurnitureItem
): readonly RoomFurnitureRotation[] {
  if (item.rotationPolicy !== "directional_assets_required") return ["front"]
  const rotations = REQUIRED_ROTATIONS.filter((rotation) => item.assetsByRotation?.[rotation])
  return rotations.length > 0 ? rotations : ["front"]
}

/**
 * Shared by the current My Room editor QA flow and evidence generation.
 * The evidence ledger must not reimplement a separate placement policy.
 */
export function resolveRoomV3UniversalCoreQaRuntimeScene(input: {
  item: FurnitureItem
  rotation: RoomFurnitureRotation
  qaFurnitureCatalog: readonly FurnitureItem[]
}): RoomV3UniversalCoreQaRuntimeResolution {
  const { item, rotation, qaFurnitureCatalog } = input
  const surface = getRoomV2FurniturePlacementSurface(item)
  const support: PlacedRoomItem | undefined = surface === "tabletop"
    ? {
      instanceId: "qa_gallery_support_table",
      itemId: "room_v2_table_round",
      x: 0.42,
      y: 0.74,
      rotation: "front"
    }
    : undefined
  const furnitureCatalog = [...ROOM_V2_FURNITURE_CATALOG, ...qaFurnitureCatalog]
  const baseScene = resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog,
    decor: {
      roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
      placedItems: support ? [support] : []
    },
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  })
  const candidates = getRoomV2DraftPlacementCandidates(item, baseScene)
  let fallback: {
    placedItem: PlacedRoomItem
    issueIds: RoomV2PlacementIssueId[]
    blockingRenderIds: string[]
  } | undefined

  for (const candidate of candidates) {
    const placedItem: PlacedRoomItem = {
      instanceId: `qa_gallery_${item.id}`,
      itemId: item.id,
      x: candidate.x,
      y: candidate.y,
      rotation
    }
    const renderItem = resolvePlacedFurnitureRenderItem(placedItem, item)
    if (!renderItem) continue
    const validation = validateRoomV2FurniturePlacement({
      scene: baseScene,
      candidate: renderItem
    })
    fallback ??= {
      placedItem,
      issueIds: validation.issueIds,
      blockingRenderIds: validation.blockingRenderIds
    }
    if (!validation.isValid) continue
    return {
      scene: resolveRoomV2Scene({
        roomShellCatalog: ROOM_V2_SHELL_CATALOG,
        furnitureCatalog,
        decor: {
          roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
          placedItems: support ? [support, placedItem] : [placedItem]
        },
        defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
      }),
      isValid: true,
      issueIds: [],
      blockingRenderIds: [],
      selectedPlacement: placedItem,
      validationSource: "validateRoomV2FurniturePlacement"
    }
  }

  const fallbackPlacedItem = fallback?.placedItem ?? {
    instanceId: `qa_gallery_${item.id}`,
    itemId: item.id,
    x: 0.5,
    y: 0.72,
    rotation
  }
  return {
    scene: resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      furnitureCatalog,
      decor: {
        roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
        placedItems: support ? [support, fallbackPlacedItem] : [fallbackPlacedItem]
      },
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    }),
    isValid: false,
    issueIds: fallback?.issueIds ?? ["invalid_placement_surface"],
    blockingRenderIds: fallback?.blockingRenderIds ?? [],
    selectedPlacement: fallbackPlacedItem,
    validationSource: "validateRoomV2FurniturePlacement"
  }
}

export function createRoomV3UniversalCoreQaRuntimeEvidenceManifest(
  qaFurnitureCatalog: readonly FurnitureItem[]
): RoomV3UniversalCoreQaRuntimeEvidenceManifest {
  if (qaFurnitureCatalog.length !== 45) {
    throw new Error(`qa_catalog_incomplete:${qaFurnitureCatalog.length}/45`)
  }

  const products: RoomV3UniversalCoreQaRuntimeEvidenceRow[] = qaFurnitureCatalog.map((item) => {
    const rotations = getRoomV3UniversalCoreQaSupportedRotations(item).map((rotation) => {
      const resolution = resolveRoomV3UniversalCoreQaRuntimeScene({
        item,
        rotation,
        qaFurnitureCatalog
      })
      return {
        rotation,
        status: resolution.isValid ? "metadata_only_valid" : "metadata_only_blocked",
        issueIds: [...resolution.issueIds],
        blockingRenderIds: [...resolution.blockingRenderIds],
        placement: {
          x: resolution.selectedPlacement.x,
          y: resolution.selectedPlacement.y,
          rotation: resolution.selectedPlacement.rotation
        }
      } satisfies RoomV3UniversalCoreQaRuntimeRotationEvidence
    })
    const placementValid = rotations.every((rotation) => rotation.status === "metadata_only_valid")
    const blockingRenderIds = [...new Set(rotations.flatMap((rotation) => rotation.blockingRenderIds))]
    const hasCollisionBlock = blockingRenderIds.length > 0
    const hasSeatMetadata = Boolean(item.seatSpec?.seatPoints.length)
    return {
      candidateId: item.id,
      name: item.name,
      placementSurface: getRoomV2FurniturePlacementSurface(item),
      runtimeMetadata: {
        width: item.width,
        height: item.height,
        blocksMovement: item.blocksMovement ?? false,
        interactionType: item.interactionType,
        surfacePlacementPolicy: item.surfacePlacementPolicy
      },
      placement: {
        status: placementValid ? "metadata_only_valid" : "metadata_only_blocked",
        validator: "validateRoomV2FurniturePlacement",
        rotations
      },
      collision: {
        status: hasCollisionBlock
          ? "blocked"
          : item.blocksMovement
            ? "metadata_only"
            : "not_required",
        crossSkuChecked: false,
        blockingRenderIds
      },
      seating: {
        status: hasSeatMetadata ? "metadata_only" : "not_applicable",
        capacity: item.seatSpec?.capacity ?? null,
        seatPointIds: item.seatSpec?.seatPoints.map((seat) => seat.id) ?? [],
        liveResult: null
      },
      simulator: {
        status: "not_collected",
        evidenceId: null,
        screenshotPaths: []
      },
      persistence: {
        status: "not_collected",
        evidenceId: null
      },
      status: placementValid ? "metadata_only_valid" : "metadata_only_blocked"
    }
  })

  const placementBlocked = products.filter((row) => row.placement.status === "metadata_only_blocked")
  const gaps = [
    "simulator_evidence_not_collected",
    "persistence_evidence_not_collected",
    "independent_review_not_collected",
    "cross_sku_collision_not_checked",
    ...placementBlocked.flatMap((row) =>
      row.placement.rotations.flatMap((rotation) =>
        rotation.issueIds.map((issueId) => `${row.candidateId}:${issueId}`)
      )
    )
  ]

  return {
    schemaVersion: ROOM_V3_UNIVERSAL_CORE_QA_RUNTIME_EVIDENCE_SCHEMA_VERSION,
    status: "evidence_only",
    promotionEligible: false,
    validatorSource: "MyRoomEditorScreen",
    validator: "validateRoomV2FurniturePlacement",
    simulatorEvidenceIncluded: false,
    persistenceEvidenceIncluded: false,
    independentReviewIncluded: false,
    products,
    summary: {
      productCount: 45,
      placementValidCount: products.length - placementBlocked.length,
      placementBlockedCount: placementBlocked.length,
      collisionMetadataCount: products.filter((row) => row.collision.status === "metadata_only").length,
      collisionBlockedCount: products.filter((row) => row.collision.status === "blocked").length,
      collisionNotRequiredCount: products.filter((row) => row.collision.status === "not_required").length,
      seatingMetadataCount: products.filter((row) => row.seating.status === "metadata_only").length,
      seatingNotApplicableCount: products.filter((row) => row.seating.status === "not_applicable").length
    },
    gaps
  }
}
