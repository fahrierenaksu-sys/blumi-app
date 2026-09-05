import type {
  FurnitureItem,
  RoomAnchor,
  RoomBounds,
  RoomPlacementLane,
  RoomPlacementSurface
} from "./roomV2.types"
import type {
  RoomV3UniversalCoreStaticRuntimeEvidenceManifest,
  UniversalCoreStaticRuntimeEvidenceRow
} from "./roomV3UniversalCoreStaticRuntimeEvidence"

export const ROOM_V3_UNIVERSAL_CORE_PLACEMENT_DEPTH_EVIDENCE_SCHEMA_VERSION =
  "room-v3-universal-core-placement-depth-evidence-v1" as const

export const ROOM_V3_UNIVERSAL_CORE_LOCKED_SHELL_ID =
  "room_v2_shell_blumi_world_v1" as const

export interface UniversalCorePlacementDepthLockedShell {
  id: typeof ROOM_V3_UNIVERSAL_CORE_LOCKED_SHELL_ID
  sourceAssetPath: string
  sourceAssetKey: string
  canvasSize: { width: number; height: number }
  placeableArea: RoomBounds
  walkablePolygon: readonly RoomAnchor[]
  placementLanes: readonly RoomPlacementLane[]
  surfacePlacementAreas: Partial<Record<RoomPlacementSurface, RoomBounds>>
  surfacePlacementExclusions: Partial<Record<RoomPlacementSurface, readonly RoomBounds[]>>
}

export interface UniversalCorePlacementDepthPosition {
  x: number
  y: number
  depthY: number
  rotation: "front"
  anchor: RoomAnchor
}

export interface UniversalCorePlacementDepthLane {
  id: string
  label: string
  y: number
  kind: "floor_lane" | "surface_region" | "tabletop_support"
  source: "locked_room_v2_shell" | "locked_room_v2_table_support"
}

export interface UniversalCorePlacementDepthValidation {
  status: "metadata_only_pass" | "metadata_only_blocked"
  issueIds: readonly string[]
  crossSkuCollisionChecked: false
  simulatorVerified: false
}

export interface UniversalCorePlacementDepthRow {
  candidateId: string
  categoryId: string
  placementSurface: RoomPlacementSurface
  surfacePlacementPolicy?: FurnitureItem["surfacePlacementPolicy"]
  interactionType: string
  runtimeAssetPath: string
  runtimeRenderBox: { width: number; height: number }
  placement: UniversalCorePlacementDepthPosition
  depthLane: UniversalCorePlacementDepthLane
  support?: {
    candidateId: string
    placement: UniversalCorePlacementDepthPosition
    localBounds: RoomBounds
    runtimeSurfaceContract: "tabletop_support"
  }
  evidence: {
    simulatorEvidenceId: null
    persistenceEvidenceId: null
    independentReviewId: null
  }
  validation: UniversalCorePlacementDepthValidation
}

export interface RoomV3UniversalCorePlacementDepthEvidenceManifest {
  schemaVersion: typeof ROOM_V3_UNIVERSAL_CORE_PLACEMENT_DEPTH_EVIDENCE_SCHEMA_VERSION
  status: "evidence_only"
  promotionEligible: false
  simulatorEvidenceIncluded: false
  persistenceEvidenceIncluded: false
  independentReviewIncluded: false
  lockedShell: UniversalCorePlacementDepthLockedShell
  sourceStaticRuntimeManifest: string
  products: readonly UniversalCorePlacementDepthRow[]
  summary: {
    productCount: 45
    floorLaneCount: number
    wallRegionCount: number
    ceilingRegionCount: number
    tabletopSupportCount: number
    metadataOnlyPassCount: number
    metadataOnlyBlockedCount: number
  }
  gaps: readonly string[]
}

type RuntimeFurnitureModule = typeof import("./roomV3UniversalCoreRuntimeFurniture")
type RoomMockModule = typeof import("./roomV2.mock")
type ArtifactRegistryModule = typeof import("./roomV3UniversalCoreArtifactRegistry")

const SOURCE_ASSET_PATH =
  "apps/mobile/src/features/roomV2/assets/runtime/room_shell_blumi_world_v1.webp"

export function createRoomV3UniversalCorePlacementDepthEvidenceManifest(
  staticRuntimeManifest: RoomV3UniversalCoreStaticRuntimeEvidenceManifest
): RoomV3UniversalCorePlacementDepthEvidenceManifest {
  if (staticRuntimeManifest.status !== "evidence_only") {
    throw new Error("static_runtime_manifest_not_evidence_only")
  }
  if (staticRuntimeManifest.products.length !== 45) {
    throw new Error("static_runtime_manifest_incomplete")
  }

  // The runtime and mock shell import binary assets. Callers install the same
  // deterministic PNG/WEBP module hooks used by the runtime tests first.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const runtimeModule = require("./roomV3UniversalCoreRuntimeFurniture") as RuntimeFurnitureModule
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const artifactRegistryModule = require("./roomV3UniversalCoreArtifactRegistry") as ArtifactRegistryModule
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const roomMockModule = require("./roomV2.mock") as RoomMockModule
  const shell = roomMockModule.ROOM_V2_SHELL_CATALOG.find(
    (candidate) => candidate.id === ROOM_V3_UNIVERSAL_CORE_LOCKED_SHELL_ID
  )
  if (!shell || !shell.placeableArea || !shell.walkablePolygon || !shell.placementLanes) {
    throw new Error("locked_shell_missing_geometry")
  }
  if (!shell.surfacePlacementAreas?.wall || !shell.surfacePlacementAreas.ceiling) {
    throw new Error("locked_shell_missing_surface_regions")
  }

  const artifactRegistry = createTrustedRegistryFromStaticManifest(
    staticRuntimeManifest,
    runtimeModule,
    artifactRegistryModule
  )
  const runtimeItems = runtimeModule.createRoomV3UniversalCoreRuntimeFurniture(artifactRegistry)
  if (runtimeItems.length !== 45) throw new Error("runtime_furniture_incomplete")
  const runtimeById = new Map(runtimeItems.map((item) => [item.id, item]))
  const supportItem = roomMockModule.ROOM_V2_FURNITURE_CATALOG.find(
    (item) => item.id === "room_v2_table_round"
  )
  if (!supportItem?.surfaceSupports?.[0]) throw new Error("tabletop_support_missing")

  const lockedShell = cloneLockedShell(shell)
  const products = [...staticRuntimeManifest.products].map((staticRow) => {
    const runtimeItem = runtimeById.get(staticRow.candidateId)
    if (!runtimeItem) throw new Error(`runtime_item_missing:${staticRow.candidateId}`)
    return createPlacementRow({
      staticRow,
      runtimeItem,
      supportItem,
      shell: lockedShell
    })
  })
  const metadataOnlyBlockedCount = products.filter(
    (row) => row.validation.status === "metadata_only_blocked"
  ).length
  const gaps = [
    "simulator_evidence_not_collected",
    "persistence_evidence_not_collected",
    "independent_review_not_collected",
    "cross_sku_collision_not_checked",
    ...products
      .filter((row) => row.validation.status === "metadata_only_blocked")
      .flatMap((row) => row.validation.issueIds.map((issueId) => `${row.candidateId}:${issueId}`))
  ]

  return {
    schemaVersion: ROOM_V3_UNIVERSAL_CORE_PLACEMENT_DEPTH_EVIDENCE_SCHEMA_VERSION,
    status: "evidence_only",
    promotionEligible: false,
    simulatorEvidenceIncluded: false,
    persistenceEvidenceIncluded: false,
    independentReviewIncluded: false,
    lockedShell,
    sourceStaticRuntimeManifest:
      "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_static_runtime_evidence_manifest.json",
    products,
    summary: {
      productCount: 45,
      floorLaneCount: products.filter((row) => row.depthLane.kind === "floor_lane").length,
      wallRegionCount: products.filter((row) => row.depthLane.id === "surface_wall").length,
      ceilingRegionCount: products.filter((row) => row.depthLane.id === "surface_ceiling").length,
      tabletopSupportCount: products.filter((row) => row.depthLane.kind === "tabletop_support").length,
      metadataOnlyPassCount: products.filter((row) => row.validation.status === "metadata_only_pass").length,
      metadataOnlyBlockedCount
    },
    gaps
  }
}

function createTrustedRegistryFromStaticManifest(
  manifest: RoomV3UniversalCoreStaticRuntimeEvidenceManifest,
  runtimeModule: RuntimeFurnitureModule,
  artifactRegistryModule: ArtifactRegistryModule
) {
  const products = new Map(manifest.products.map((row) => [row.candidateId, row]))
  const ids = [...runtimeModule.ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS]
  return {
    verifierId: runtimeModule.ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
    artifactManifestId: artifactRegistryModule.ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    verifiedCandidateIds: ids,
    verifiedAssetHashesByCandidateId: Object.fromEntries(
      ids.map((id) => [
        id,
        Object.fromEntries(
          products.get(id)!.artifact.directions.map((asset) => [asset.direction, asset.sha256])
        )
      ])
    )
  }
}

function createPlacementRow(input: {
  staticRow: UniversalCoreStaticRuntimeEvidenceRow
  runtimeItem: FurnitureItem
  supportItem: FurnitureItem
  shell: UniversalCorePlacementDepthLockedShell
}): UniversalCorePlacementDepthRow {
  const { staticRow, runtimeItem, supportItem, shell } = input
  const placementSurface = staticRow.placementSurface
  const runtimeAssetPath = staticRow.artifact.directions.find(
    (asset) => asset.direction === "front"
  )?.path
  if (!runtimeAssetPath) throw new Error(`front_asset_missing:${staticRow.candidateId}`)

  if (placementSurface === "floor") {
    const lane = chooseFloorLane(staticRow.categoryId, runtimeItem, shell.placementLanes)
    const placement = chooseFloorPlacement(staticRow.candidateId, runtimeItem, lane, shell)
    return {
      candidateId: staticRow.candidateId,
      categoryId: staticRow.categoryId,
      placementSurface,
      surfacePlacementPolicy: runtimeItem.surfacePlacementPolicy,
      interactionType: staticRow.interactionType,
      runtimeAssetPath,
      runtimeRenderBox: { width: runtimeItem.width, height: runtimeItem.height },
      placement,
      depthLane: {
        id: lane.id,
        label: lane.label ?? lane.id,
        y: lane.y,
        kind: "floor_lane",
        source: "locked_room_v2_shell"
      },
      evidence: {
        simulatorEvidenceId: null,
        persistenceEvidenceId: null,
        independentReviewId: null
      },
      validation: validateFloorPlacement(placement, runtimeItem, lane, shell)
    }
  }

  if (placementSurface === "wall" || placementSurface === "ceiling") {
    const region = shell.surfacePlacementAreas[placementSurface]
    if (!region) throw new Error(`surface_region_missing:${placementSurface}`)
    const placement = chooseSurfacePlacement(
      staticRow.candidateId,
      runtimeItem,
      region,
      shell.surfacePlacementExclusions[placementSurface] ?? []
    )
    return {
      candidateId: staticRow.candidateId,
      categoryId: staticRow.categoryId,
      placementSurface,
      surfacePlacementPolicy: runtimeItem.surfacePlacementPolicy,
      interactionType: staticRow.interactionType,
      runtimeAssetPath,
      runtimeRenderBox: { width: runtimeItem.width, height: runtimeItem.height },
      placement,
      depthLane: {
        id: `surface_${placementSurface}`,
        label: `${placementSurface} region`,
        y: placement.depthY,
        kind: "surface_region",
        source: "locked_room_v2_shell"
      },
      evidence: {
        simulatorEvidenceId: null,
        persistenceEvidenceId: null,
        independentReviewId: null
      },
      validation: validateSurfacePlacement(
        placement,
        runtimeItem,
        region,
        shell.surfacePlacementExclusions[placementSurface] ?? []
      )
    }
  }

  if (placementSurface !== "tabletop") throw new Error(`unsupported_surface:${placementSurface}`)
  const support = chooseTabletopPlacement(runtimeItem, supportItem, shell)
  return {
    candidateId: staticRow.candidateId,
    categoryId: staticRow.categoryId,
    placementSurface,
    surfacePlacementPolicy: runtimeItem.surfacePlacementPolicy,
    interactionType: staticRow.interactionType,
    runtimeAssetPath,
    runtimeRenderBox: { width: runtimeItem.width, height: runtimeItem.height },
    placement: support.candidatePlacement,
    depthLane: {
      id: "tabletop_support_room_v2_table_round",
      label: "Canonical tabletop support",
      y: support.candidatePlacement.depthY,
      kind: "tabletop_support",
      source: "locked_room_v2_table_support"
    },
    support: {
      candidateId: supportItem.id,
      placement: support.supportPlacement,
      localBounds: support.localBounds,
      runtimeSurfaceContract: "tabletop_support"
    },
    evidence: {
      simulatorEvidenceId: null,
      persistenceEvidenceId: null,
      independentReviewId: null
    },
    validation: validateTabletopPlacement(support)
  }
}

function chooseFloorLane(
  categoryId: string,
  item: FurnitureItem,
  lanes: readonly RoomPlacementLane[]
) {
  const byId = new Map(lanes.map((lane) => [lane.id, lane]))
  const laneId = categoryId === "rug"
    ? "room_v2_world_lane_social"
    : item.height >= 0.34
      ? "room_v2_world_lane_mid"
      : item.seatSpec || item.width >= 0.28
        ? "room_v2_world_lane_front"
        : "room_v2_world_lane_mid"
  const lane = byId.get(laneId)
  if (!lane) throw new Error(`floor_lane_missing:${laneId}`)
  return lane
}

function chooseFloorPlacement(
  candidateId: string,
  item: FurnitureItem,
  lane: RoomPlacementLane,
  shell: UniversalCorePlacementDepthLockedShell
): UniversalCorePlacementDepthPosition {
  const anchor = item.anchor ?? { x: 0.5, y: 1 }
  const minX = Math.max(
    lane.minX ?? shell.placeableArea.minX,
    shell.placeableArea.minX
  ) + item.width * anchor.x
  const maxX = Math.min(
    lane.maxX ?? shell.placeableArea.maxX,
    shell.placeableArea.maxX
  ) - item.width * (1 - anchor.x)
  const x = seededRange(candidateId, minX, maxX)
  return { x, y: lane.y, depthY: lane.y, rotation: "front", anchor: { ...anchor } }
}

function chooseSurfacePlacement(
  candidateId: string,
  item: FurnitureItem,
  region: RoomBounds,
  exclusions: readonly RoomBounds[]
): UniversalCorePlacementDepthPosition {
  const anchor = item.anchor ?? { x: 0.5, y: 0.5 }
  if (item.surfacePlacementPolicy === "opening" && exclusions.length > 0) {
    const opening = exclusions[0]
    return {
      x: (opening.minX + opening.maxX) / 2,
      y: (opening.minY + opening.maxY) / 2,
      depthY: (opening.minY + opening.maxY) / 2,
      rotation: "front",
      anchor: { ...anchor }
    }
  }
  const minX = region.minX + item.width * anchor.x
  const maxX = region.maxX - item.width * (1 - anchor.x)
  const minY = region.minY + item.height * anchor.y
  const maxY = region.maxY - item.height * (1 - anchor.y)
  const safeIntervals = getSafeSurfaceIntervals(minX, maxX, item, exclusions)
  const x = chooseSeededInterval(
    `${candidateId}:x`,
    item.surfacePlacementPolicy === "avoid_openings" ? safeIntervals.slice(0, 1) : safeIntervals,
    minX
  )
  const y = seededRange(`${candidateId}:y`, minY, maxY)
  return { x, y, depthY: y, rotation: "front", anchor: { ...anchor } }
}

function getSafeSurfaceIntervals(
  minX: number,
  maxX: number,
  item: FurnitureItem,
  exclusions: readonly RoomBounds[]
): { min: number; max: number }[] {
  if (item.surfacePlacementPolicy === "opening" || exclusions.length === 0) {
    return [{ min: minX, max: maxX }]
  }
  let intervals = [{ min: minX, max: maxX }]
  const halfLeft = item.width * (item.anchor?.x ?? 0.5)
  const halfRight = item.width * (1 - (item.anchor?.x ?? 0.5))
  for (const exclusion of exclusions) {
    const blockedMin = exclusion.minX - halfRight
    const blockedMax = exclusion.maxX + halfLeft
    intervals = intervals.flatMap((interval) => [
      ...(interval.min < blockedMin ? [{ min: interval.min, max: Math.min(interval.max, blockedMin) }] : []),
      ...(interval.max > blockedMax ? [{ min: Math.max(interval.min, blockedMax), max: interval.max }] : [])
    ]).filter((interval) => interval.max >= interval.min)
  }
  return intervals.length > 0 ? intervals : [{ min: minX, max: maxX }]
}

function chooseSeededInterval(
  seed: string,
  intervals: { min: number; max: number }[],
  fallback: number
): number {
  const totalLength = intervals.reduce((sum, interval) => sum + (interval.max - interval.min), 0)
  if (totalLength <= 0) return fallback
  let remaining = seededRange(seed, 0, totalLength)
  for (const interval of intervals) {
    const length = interval.max - interval.min
    if (remaining <= length) return interval.min + remaining
    remaining -= length
  }
  return intervals.at(-1)?.max ?? fallback
}

function chooseTabletopPlacement(
  item: FurnitureItem,
  supportItem: FurnitureItem,
  shell: UniversalCorePlacementDepthLockedShell
) {
  const supportPlacement: UniversalCorePlacementDepthPosition = {
    x: 0.52,
    y: 0.74,
    depthY: 0.74,
    rotation: "front",
    anchor: { ...(supportItem.anchor ?? { x: 0.5, y: 1 }) }
  }
  const support = supportItem.surfaceSupports?.find((candidate) => candidate.surface === "tabletop")
  if (!support) throw new Error("tabletop_support_contract_missing")
  const supportTopLeft = {
    x: supportPlacement.x - supportItem.width * supportPlacement.anchor.x,
    y: supportPlacement.y - supportItem.height * supportPlacement.anchor.y
  }
  const supportBounds = {
    minX: supportTopLeft.x + support.localBounds.minX * supportItem.width,
    maxX: supportTopLeft.x + support.localBounds.maxX * supportItem.width,
    minY: supportTopLeft.y + support.localBounds.minY * supportItem.height,
    maxY: supportTopLeft.y + support.localBounds.maxY * supportItem.height
  }
  const footprint = item.footprint ?? {
    width: item.width * 0.7,
    height: Math.max(item.height * 0.12, 0.004)
  }
  const x = (supportBounds.minX + supportBounds.maxX) / 2
  const y = supportBounds.maxY
  return {
    supportPlacement,
    candidatePlacement: {
      x,
      y,
      depthY: supportPlacement.depthY + 0.001,
      rotation: "front" as const,
      anchor: { ...(item.anchor ?? { x: 0.5, y: 1 }) }
    },
    localBounds: { ...support.localBounds },
    candidateFootprint: { ...footprint },
    supportBounds,
    shell
  }
}

function validateFloorPlacement(
  placement: UniversalCorePlacementDepthPosition,
  item: FurnitureItem,
  lane: RoomPlacementLane,
  shell: UniversalCorePlacementDepthLockedShell
): UniversalCorePlacementDepthValidation {
  const footprint = item.footprint ?? { width: item.width, height: item.height }
  const bounds = blockerBounds(placement, footprint)
  const points = [
    { x: placement.x, y: placement.y },
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY }
  ]
  const issueIds: string[] = []
  if (placement.x < (lane.minX ?? 0) || placement.x > (lane.maxX ?? 1)) issueIds.push("anchor_outside_lane")
  if (!points.every((point) => isPointInsidePolygon(point, shell.walkablePolygon))) {
    issueIds.push("outside_walkable_polygon")
  }
  return validation(issueIds)
}

function validateSurfacePlacement(
  placement: UniversalCorePlacementDepthPosition,
  item: FurnitureItem,
  region: RoomBounds,
  exclusions: readonly RoomBounds[]
): UniversalCorePlacementDepthValidation {
  const topLeft = {
    x: placement.x - item.width * placement.anchor.x,
    y: placement.y - item.height * placement.anchor.y
  }
  const issueIds: string[] = []
  if (
    topLeft.x < region.minX ||
    topLeft.x + item.width > region.maxX ||
    topLeft.y < region.minY ||
    topLeft.y + item.height > region.maxY
  ) issueIds.push("image_outside_surface_region")
  const overlapsOpening = exclusions.some((exclusion) =>
    topLeft.x < exclusion.maxX &&
    topLeft.x + item.width > exclusion.minX &&
    topLeft.y < exclusion.maxY &&
    topLeft.y + item.height > exclusion.minY
  )
  if (item.surfacePlacementPolicy === "opening") {
    if (!(exclusions.length > 0 && overlapsOpening)) issueIds.push("opening_region_missing")
  } else if (overlapsOpening) {
    issueIds.push("baked_opening_overlap")
  }
  return validation(issueIds)
}

function validateTabletopPlacement(
  placement: ReturnType<typeof chooseTabletopPlacement>
): UniversalCorePlacementDepthValidation {
  const { candidatePlacement, candidateFootprint, supportBounds } = placement
  const candidateBounds = {
    minX: candidatePlacement.x - candidateFootprint.width / 2,
    maxX: candidatePlacement.x + candidateFootprint.width / 2,
    minY: candidatePlacement.y - candidateFootprint.height,
    maxY: candidatePlacement.y
  }
  const issueIds: string[] = []
  if (
    candidateBounds.minX < supportBounds.minX ||
    candidateBounds.maxX > supportBounds.maxX ||
    candidateBounds.minY < supportBounds.minY ||
    candidateBounds.maxY > supportBounds.maxY
  ) issueIds.push("contact_outside_tabletop_support")
  return validation(issueIds)
}

function validation(issueIds: readonly string[]): UniversalCorePlacementDepthValidation {
  return {
    status: issueIds.length === 0 ? "metadata_only_pass" : "metadata_only_blocked",
    issueIds: [...issueIds],
    crossSkuCollisionChecked: false,
    simulatorVerified: false
  }
}

function blockerBounds(placement: UniversalCorePlacementDepthPosition, footprint: { width: number; height: number }) {
  return {
    minX: placement.x - footprint.width * placement.anchor.x,
    maxX: placement.x - footprint.width * placement.anchor.x + footprint.width,
    minY: placement.y - footprint.height * placement.anchor.y,
    maxY: placement.y - footprint.height * placement.anchor.y + footprint.height
  }
}

function isPointInsidePolygon(point: RoomAnchor, polygon: readonly RoomAnchor[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
        (previousPoint.y - currentPoint.y) + currentPoint.x
    if (intersects) inside = !inside
  }
  return inside
}

function seededRange(seed: string, min: number, max: number) {
  if (max <= min) return min
  let hash = 2166136261
  for (const character of seed) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  const ratio = (hash >>> 0) / 4294967295
  return min + (max - min) * ratio
}

function cloneLockedShell(shell: NonNullable<ReturnType<RoomMockModule["ROOM_V2_SHELL_CATALOG"]["find"]>>): UniversalCorePlacementDepthLockedShell {
  return {
    id: ROOM_V3_UNIVERSAL_CORE_LOCKED_SHELL_ID,
    sourceAssetPath: SOURCE_ASSET_PATH,
    sourceAssetKey: shell.asset.key,
    canvasSize: { ...shell.canvasSize },
    placeableArea: { ...shell.placeableArea! },
    walkablePolygon: shell.walkablePolygon!.map((point) => ({ x: point.x, y: point.y })),
    placementLanes: shell.placementLanes!.map((lane) => ({ ...lane })),
    surfacePlacementAreas: Object.fromEntries(
      Object.entries(shell.surfacePlacementAreas ?? {}).map(([surface, bounds]) => [surface, bounds ? { ...bounds } : bounds])
    ),
    surfacePlacementExclusions: Object.fromEntries(
      Object.entries(shell.surfacePlacementExclusions ?? {}).map(([surface, bounds]) => [
        surface,
        bounds?.map((bound) => ({ ...bound }))
      ])
    )
  }
}
