import type {
  FurnitureItem,
  RoomFurnitureDirectionalVisual,
  RoomFurnitureRotation,
  RoomFurnitureVisualContract,
  RoomPoint2D,
  RoomV2AssetRef
} from "./roomV2.types"

export const ROOM_VNEXT_DIRECTIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "right",
  "back",
  "left"
] as const

export type RoomVNextContractIssueId =
  | "invalid_schema_version"
  | "invalid_identity"
  | "invalid_profile"
  | "invalid_dimensions"
  | "invalid_directional_visual"
  | "missing_directional_visual"
  | "invalid_floor_pivot"
  | "invalid_footprint"

export interface RoomVNextContractValidation {
  readonly isValid: boolean
  readonly issueIds: readonly RoomVNextContractIssueId[]
}

/**
 * Validates a world-kit manifest before it is adapted into legacy catalog
 * fields. This is deliberately strict: a missing direction must never fall
 * back to a mirrored or unrelated image in the VNext path.
 */
export function validateRoomFurnitureVisualContract(
  contract: RoomFurnitureVisualContract
): RoomVNextContractValidation {
  const issues = new Set<RoomVNextContractIssueId>()

  if (contract.schemaVersion !== "room-furniture-visual-vnext-1") {
    issues.add("invalid_schema_version")
  }
  if (
    !nonEmpty(contract.skuId) ||
    !nonEmpty(contract.assetSetId) ||
    !Number.isInteger(contract.assetVersion) ||
    contract.assetVersion < 1
  ) {
    issues.add("invalid_identity")
  }
  if (
    contract.perspectiveProfile !== "my-room-locked-2.5d-v1" ||
    contract.viewportProfile !== "ROOM_V2_APPROVED_MY_ROOM_CAMERA" ||
    !nonEmpty(contract.assetCameraRigId) ||
    !nonEmpty(contract.cameraRigVersion) ||
    !nonEmpty(contract.lightRigVersion) ||
    !nonEmpty(contract.materialLibraryVersion)
  ) {
    issues.add("invalid_profile")
  }
  if (
    !positive(contract.physicalSizeCm?.width) ||
    !positive(contract.physicalSizeCm?.depth) ||
    !positive(contract.physicalSizeCm?.height)
  ) {
    issues.add("invalid_dimensions")
  }

  for (const direction of ROOM_VNEXT_DIRECTIONS) {
    const visual = contract.directions?.[direction]
    if (!visual) {
      issues.add("missing_directional_visual")
      continue
    }
    if (!isAssetRef(visual.bodyAsset)) {
      issues.add("invalid_directional_visual")
    }
    if (
      visual.contactShadowAsset !== undefined &&
      !isAssetRef(visual.contactShadowAsset)
    ) {
      issues.add("invalid_directional_visual")
    }
    if (
      visual.foregroundOcclusionAsset !== undefined &&
      !isAssetRef(visual.foregroundOcclusionAsset)
    ) {
      issues.add("invalid_directional_visual")
    }
    if (
      visual.thumbnailAsset !== undefined &&
      !isAssetRef(visual.thumbnailAsset)
    ) {
      issues.add("invalid_directional_visual")
    }
    if (
      !positive(visual.normalizedRenderSize?.width) ||
      !positive(visual.normalizedRenderSize?.height)
    ) {
      issues.add("invalid_directional_visual")
    }
    if (!isNormalizedAnchor(visual.normalizedFloorPivot)) {
      issues.add("invalid_floor_pivot")
    }
  }

  if (!isPolygon(contract.footprintLocalCm)) {
    issues.add("invalid_footprint")
  }
  if (
    contract.placementClearanceLocalCm !== undefined &&
    !isPolygon(contract.placementClearanceLocalCm)
  ) {
    issues.add("invalid_footprint")
  }
  if (
    contract.supportSurfaceLocalCm !== undefined &&
    !isPolygon(contract.supportSurfaceLocalCm)
  ) {
    issues.add("invalid_footprint")
  }

  return {
    isValid: issues.size === 0,
    issueIds: [...issues]
  }
}

export function getRoomVNextDirectionalVisual(
  contract: RoomFurnitureVisualContract,
  direction: RoomFurnitureRotation
): RoomFurnitureDirectionalVisual | undefined {
  return contract.directions?.[direction]
}

/**
 * Adds a validated VNext world-kit contract to a legacy FurnitureItem. The
 * returned value is a deep copy of mutable metadata; the catalog source is
 * never changed in place. Existing footprints, seat points and ownership
 * fields are intentionally preserved until the renderer/placement adapter is
 * promoted in a later gated phase.
 */
export function adaptFurnitureItemToRoomVNext(
  item: FurnitureItem,
  contract: RoomFurnitureVisualContract
): FurnitureItem {
  const validation = validateRoomFurnitureVisualContract(contract)
  if (!validation.isValid) {
    throw new Error(
      `Invalid Room VNext visual contract for ${contract.skuId || item.id}: ${validation.issueIds.join(",")}`
    )
  }

  const directions = Object.fromEntries(
    ROOM_VNEXT_DIRECTIONS.map((direction) => {
      const visual = contract.directions[direction]
      return [direction, visual.bodyAsset]
    })
  ) as Record<RoomFurnitureRotation, RoomV2AssetRef>

  const renderSizeByRotation = Object.fromEntries(
    ROOM_VNEXT_DIRECTIONS.map((direction) => [
      direction,
      { ...contract.directions[direction].normalizedRenderSize }
    ])
  ) as FurnitureItem["renderSizeByRotation"]

  const anchorByRotation = Object.fromEntries(
    ROOM_VNEXT_DIRECTIONS.map((direction) => [
      direction,
      { ...contract.directions[direction].normalizedFloorPivot }
    ])
  ) as FurnitureItem["anchorByRotation"]

  return {
    ...item,
    asset: contract.directions.front.bodyAsset,
    assetsByRotation: directions,
    rotationPolicy: "directional_assets_required",
    sceneProjection: contract.renderClass,
    placementSurface: contract.placementSurface,
    width: contract.directions.front.normalizedRenderSize.width,
    height: contract.directions.front.normalizedRenderSize.height,
    renderSizeByRotation,
    anchorByRotation,
    blocksMovement: contract.blocksMovement,
    interactionType:
      item.interactionType ?? (contract.supportsAvatarSeat ? "seat" : "decor"),
    visualContract: cloneVisualContract(contract)
  }
}

export function getRoomVNextDirectionalLayerAssets(
  contract: RoomFurnitureVisualContract,
  direction: RoomFurnitureRotation
): {
  bodyAsset: RoomV2AssetRef
  contactShadowAsset?: RoomV2AssetRef
  foregroundOcclusionAsset?: RoomV2AssetRef
} | undefined {
  const visual = getRoomVNextDirectionalVisual(contract, direction)
  if (!visual) return undefined
  return {
    bodyAsset: visual.bodyAsset,
    ...(visual.contactShadowAsset
      ? { contactShadowAsset: visual.contactShadowAsset }
      : {}),
    ...(visual.foregroundOcclusionAsset
      ? { foregroundOcclusionAsset: visual.foregroundOcclusionAsset }
      : {})
  }
}

function cloneVisualContract(
  contract: RoomFurnitureVisualContract
): RoomFurnitureVisualContract {
  const clonePolygon = (polygon?: readonly RoomPoint2D[]) =>
    polygon?.map((point) => ({ ...point }))

  return {
    ...contract,
    physicalSizeCm: { ...contract.physicalSizeCm },
    directions: Object.fromEntries(
      ROOM_VNEXT_DIRECTIONS.map((direction) => {
        const visual = contract.directions[direction]
        return [direction, {
          ...visual,
          bodyAsset: { ...visual.bodyAsset },
          ...(visual.contactShadowAsset
            ? { contactShadowAsset: { ...visual.contactShadowAsset } }
            : {}),
          ...(visual.foregroundOcclusionAsset
            ? { foregroundOcclusionAsset: { ...visual.foregroundOcclusionAsset } }
            : {}),
          ...(visual.thumbnailAsset
            ? { thumbnailAsset: { ...visual.thumbnailAsset } }
            : {}),
          normalizedRenderSize: { ...visual.normalizedRenderSize },
          normalizedFloorPivot: { ...visual.normalizedFloorPivot }
        }]
      })
    ) as RoomFurnitureVisualContract["directions"],
    footprintLocalCm: clonePolygon(contract.footprintLocalCm)!,
    ...(contract.placementClearanceLocalCm
      ? { placementClearanceLocalCm: clonePolygon(contract.placementClearanceLocalCm) }
      : {}),
    ...(contract.supportSurfaceLocalCm
      ? { supportSurfaceLocalCm: clonePolygon(contract.supportSurfaceLocalCm) }
      : {})
  }
}

function isAssetRef(value: unknown): value is RoomV2AssetRef {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as RoomV2AssetRef).key === "string" &&
      (value as RoomV2AssetRef).key.trim().length > 0 &&
      "source" in value
  )
}

function isPolygon(value: unknown): value is RoomPoint2D[] {
  return Array.isArray(value) && value.length >= 3 && value.every(
    (point) =>
      point &&
      Number.isFinite((point as RoomPoint2D).x) &&
      Number.isFinite((point as RoomPoint2D).y)
  )
}

function isNormalizedAnchor(value: unknown): boolean {
  return Boolean(
    value &&
      Number.isFinite((value as { x: number }).x) &&
      Number.isFinite((value as { y: number }).y) &&
      (value as { x: number }).x >= 0 &&
      (value as { x: number }).x <= 1 &&
      (value as { y: number }).y >= 0 &&
      (value as { y: number }).y <= 1
  )
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}
