import {
  UNIVERSAL_CORE_ROOM_ITEM_IDS,
  type UniversalCoreRoomItemId
} from "@blumi/domain"
import type {
  FurnitureItem,
  RoomAssetQaStatus,
  RoomAssetSourceStatus,
  RoomFurnitureRotation,
  RoomFurnitureSurfaceSupport,
  RoomFurnitureVisualContract,
  RoomLayer,
  RoomPlacementSurface,
  RoomPoint2D,
  RoomSeatSpec,
  RoomV2AssetRef
} from "./roomV2.types"
import {
  ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS
} from "./roomVNextFullWaveRuntimeAssets"
import {
  ROOM_VNEXT_FULL_WAVE_POLISH_RUNTIME_ASSETS
} from "./roomVNextFullWavePolishRuntimeAssets"
import {
  ROOM_VNEXT_FULL_WAVE_POLISH_FULL45_RUNTIME_ASSETS
} from "./roomVNextFullWavePolishFull45RuntimeAssets"
import {
  ROOM_VNEXT_FULL_WAVE_CUTE_RUNTIME_ASSETS
} from "./roomVNextFullWaveCuteRuntimeAssets"
import {
  getRoomVNextCalibratedRenderSize,
  ROOM_VNEXT_CANONICAL_STAGE_UNITS_PER_CM
} from "./roomVNextScale"
import { validateRoomFurnitureVisualContract } from "./roomVNextContracts"

const fullWaveSpec = require("../../../../../scripts/room-vnext-pilot/full-wave-catalog-spec.json") as RoomVNextFullWaveSpec
const fullWaveManifest = require("../../../../../art/room-vnext/full-wave-v1/materialized-candidate-manifest.json") as RoomVNextFullWaveManifest
const fullWavePolishManifest = require("../../../../../art/room-vnext/full-wave-v2-polish-final3/materialized-candidate-manifest.json") as RoomVNextFullWaveManifest
const fullWavePolishFull45Manifest = require("../../../../../art/room-vnext/full-wave-v2-polish-full45-v2/materialized-candidate-manifest.json") as RoomVNextFullWaveManifest
const fullWaveCuteManifest = require("../../../../../art/room-vnext/full-wave-v3-cute45-final-v3/materialized-candidate-manifest.json") as RoomVNextFullWaveManifest

function calculateCuteCandidateArtifactFingerprint(manifest: RoomVNextFullWaveManifest): string {
  const material = manifest.assets
    .slice()
    .sort((left, right) => left.skuId.localeCompare(right.skuId))
    .flatMap((asset) =>
      REQUIRED_DIRECTIONS.map((direction) => {
        const layers = asset.directions[direction].layers
        return [
          asset.skuId,
          String(asset.assetVersion),
          direction,
          layers.body.sha256 ?? "",
          layers.contactShadow?.sha256 ?? "",
          layers.thumbnail?.sha256 ?? ""
        ].join("|")
      })
    )
    .join("\n")
  let hash = 2166136261
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`
}

const REQUIRED_DIRECTIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "right",
  "back",
  "left"
]

/** Stable build-time binding for the exact cute45 manifest currently reviewed. */
export const ROOM_VNEXT_FULL_WAVE_CUTE_CANDIDATE_ARTIFACT_FINGERPRINT =
  calculateCuteCandidateArtifactFingerprint(fullWaveCuteManifest)

const ROOM_HORIZONTAL_UNITS_PER_CM = 0.3 / 170
const ROOM_FLOOR_DEPTH_UNITS_PER_CM = 0.075 / 100

export const ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS = UNIVERSAL_CORE_ROOM_ITEM_IDS

export type RoomVNextFullWaveCandidateId = UniversalCoreRoomItemId

export interface RoomVNextFullWaveCatalogResolution {
  enabled: boolean
  reason: "disabled" | "invalid_candidate_registry" | "ready"
  catalog: FurnitureItem[]
  ownedItemIds: string[]
}

export interface RoomVNextFullWaveCatalogInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawFullWaveFlag: string | undefined
  rawFullWavePolishFlag?: string | undefined
  rawFullWavePolishFullFlag?: string | undefined
}

interface RoomVNextFullWaveSpec {
  schemaVersion: string
  catalogStatus: string
  count: number
  assets: RoomVNextFullWaveSpecAsset[]
}

interface RoomVNextFullWaveSpecAsset {
  skuId: string
  assetSetId: string
  assetVersion: number
  displayName: string
  worldKitKind: string
  renderClass: "upright" | "floor_plane"
  placementSurface: RoomPlacementSurface
  physicalSizeCm: {
    width: number
    depth: number
    height: number
  }
  footprintLocalCm: readonly [number, number][]
  placementClearanceLocalCm?: readonly [number, number][]
  supportSurfaceLocalCm?: readonly [number, number][]
  supportRequired: boolean
  blocksMovement: boolean
  supportsAvatarSeat: boolean
  supportsChildItems: boolean
  directions: Record<RoomFurnitureRotation, { rootRotationDegrees: number }>
  profiles: {
    perspectiveProfile: RoomFurnitureVisualContract["perspectiveProfile"]
    viewportProfile: RoomFurnitureVisualContract["viewportProfile"]
    assetCameraRigId: string
    assetCameraRigVersion: string
    lightRigVersion: string
    materialLibraryVersion: string
  }
  production: {
    runtimePromotion: string
  }
}

interface RoomVNextFullWaveManifest {
  status: string
  runtimePromotion: string
  assets: RoomVNextFullWaveManifestAsset[]
}

interface RoomVNextFullWaveManifestAsset {
  skuId: string
  assetVersion: number
  sharedCrop: {
    width: number
    height: number
  }
  floorPivot: {
    x: number
    y: number
  }
  directions: Record<
    RoomFurnitureRotation,
    {
      layers: {
        body: {
          path: string
          sha256?: string
          canvas: { width: number; height: number }
          alphaBounds: { width: number; height: number }
        }
        contactShadow?: {
          path: string
          sha256?: string
          canvas: { width: number; height: number }
        }
        thumbnail?: {
          path: string
          sha256?: string
          canvas: { width: number; height: number }
        }
      }
    }
  >
}

type CatalogAssembly = {
  catalog: FurnitureItem[]
  valid: boolean
}

function toPolygon(points?: readonly [number, number][]): RoomPoint2D[] | undefined {
  return points?.map(([x, y]) => ({ x, y }))
}

function toFootprint(polygon?: readonly RoomPoint2D[]) {
  if (!polygon?.length) return undefined
  const bounds = getPolygonBounds(polygon)
  return {
    width: bounds.widthCm * ROOM_HORIZONTAL_UNITS_PER_CM,
    height: bounds.heightCm * ROOM_FLOOR_DEPTH_UNITS_PER_CM
  }
}

function getPolygonBounds(polygon: readonly RoomPoint2D[]) {
  const xs = polygon.map((point) => point.x)
  const ys = polygon.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    widthCm: Math.max(...xs) - Math.min(...xs),
    heightCm: Math.max(...ys) - Math.min(...ys)
  }
}

function deriveLayer(asset: RoomVNextFullWaveSpecAsset): RoomLayer {
  if (asset.renderClass === "floor_plane") return "floor"
  if (asset.placementSurface === "wall" || asset.placementSurface === "ceiling") {
    return "wall"
  }
  return "furniture"
}

function deriveCategory(asset: RoomVNextFullWaveSpecAsset): FurnitureItem["category"] {
  if (asset.worldKitKind === "table" || asset.worldKitKind === "desk" || asset.worldKitKind === "console") {
    return "table"
  }
  if (asset.worldKitKind === "seating" || asset.worldKitKind === "bed") {
    return "seating"
  }
  if (asset.worldKitKind === "plant") return "plant"
  if (asset.worldKitKind === "lamp") return "lighting"
  if (asset.worldKitKind === "rug") return "rug"
  if (
    asset.worldKitKind === "artwork" ||
    asset.worldKitKind === "clock" ||
    asset.worldKitKind === "curtain" ||
    asset.worldKitKind === "mirror"
  ) {
    return "wallDecor"
  }
  return "misc"
}

function deriveSeatSpec(asset: RoomVNextFullWaveSpecAsset): RoomSeatSpec | undefined {
  if (!asset.supportsAvatarSeat) return undefined
  const capacity = asset.physicalSizeCm.width >= 110 ? 2 : 1
  const seatOffsets = capacity === 2
    ? [-asset.physicalSizeCm.width * 0.22, asset.physicalSizeCm.width * 0.22]
    : [0]
  const seatY = -asset.physicalSizeCm.depth * 0.08
  const approachY = asset.physicalSizeCm.depth * 0.58
  const exitY = asset.physicalSizeCm.depth * 0.72
  const seatHeight = asset.physicalSizeCm.height * 0.45 * ROOM_VNEXT_CANONICAL_STAGE_UNITS_PER_CM
  return {
    capacity,
    seatPoints: seatOffsets.map((x, index) => ({
      id: capacity === 2 ? (index === 0 ? "left" : "right") : "center",
      x: 0,
      y: 0,
      localPositionCm: { x, y: seatY },
      approachPointCm: { x, y: approachY },
      exitPointCm: { x, y: exitY },
      seatHeight,
      facing: "front"
    }))
  }
}

function deriveInteractionType(asset: RoomVNextFullWaveSpecAsset): FurnitureItem["interactionType"] {
  return asset.supportsAvatarSeat ? "seat" : "decor"
}

function deriveSurfacePlacementPolicy(
  asset: RoomVNextFullWaveSpecAsset
): FurnitureItem["surfacePlacementPolicy"] | undefined {
  if (asset.placementSurface !== "wall") return undefined
  return asset.worldKitKind === "curtain" ? "opening" : "avoid_openings"
}

function deriveSupportBounds(
  asset: RoomVNextFullWaveSpecAsset
): RoomFurnitureSurfaceSupport[] | undefined {
  if (asset.placementSurface !== "floor" || asset.supportsChildItems !== true) {
    return undefined
  }
  const polygon = toPolygon(asset.supportSurfaceLocalCm)
  if (!polygon?.length) return undefined
  const bounds = getPolygonBounds(polygon)
  const minX = clamp01(0.5 + bounds.minX / asset.physicalSizeCm.width)
  const maxX = clamp01(0.5 + bounds.maxX / asset.physicalSizeCm.width)
  return [{
    surface: "tabletop",
    localBounds: {
      minX,
      maxX,
      minY: 0.1,
      maxY: 0.3
    }
  }]
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function buildVisualContract(
  specAsset: RoomVNextFullWaveSpecAsset,
  manifestAsset: RoomVNextFullWaveManifestAsset,
  bundledAssets: RoomVNextFullWaveRuntimeAssetBundle
): RoomFurnitureVisualContract {
  // V2 wall/ceiling candidates are mounted surfaces. Their generated shadow
  // layers are floor-plane ellipses, so feeding them to the generic furniture
  // shadow pass makes a wall prop read like a floating card. Keep the layer in
  // the append-only manifest for provenance, but omit it from the candidate
  // runtime contract until a wall-contact shadow is authored.
  const suppressWallFloorShadow =
    manifestAsset.assetVersion >= 2 &&
    (specAsset.placementSurface === "wall" || specAsset.placementSurface === "ceiling")
  const renderSizeByDirection = Object.fromEntries(
    REQUIRED_DIRECTIONS.map((direction) => {
      const body = manifestAsset.directions[direction]?.layers.body
      const normalizedRenderSize = getRoomVNextCalibratedRenderSize({
        physicalWidthCm: specAsset.physicalSizeCm.width,
        physicalDepthCm: specAsset.physicalSizeCm.depth,
        physicalHeightCm: specAsset.physicalSizeCm.height,
        renderClass: specAsset.renderClass,
        bodyAlphaWidthRatio: body.alphaBounds.width / body.canvas.width,
        bodyAlphaHeightRatio: body.alphaBounds.height / body.canvas.height
      })
      return [direction, {
        bodyAsset: bundledAssets.body[direction],
        ...(suppressWallFloorShadow
          ? {}
          : { contactShadowAsset: bundledAssets.shadow[direction] }),
        normalizedRenderSize,
        normalizedFloorPivot: {
          x: manifestAsset.floorPivot.x,
          y: manifestAsset.floorPivot.y
        }
      }]
    })
  ) as RoomFurnitureVisualContract["directions"]

  return {
    schemaVersion: "room-furniture-visual-vnext-1",
    skuId: specAsset.skuId,
    assetSetId: specAsset.assetSetId,
    assetVersion: manifestAsset.assetVersion,
    perspectiveProfile: specAsset.profiles.perspectiveProfile,
    viewportProfile: specAsset.profiles.viewportProfile,
    assetCameraRigId: specAsset.profiles.assetCameraRigId,
    cameraRigVersion: specAsset.profiles.assetCameraRigVersion,
    lightRigVersion: specAsset.profiles.lightRigVersion,
    materialLibraryVersion: specAsset.profiles.materialLibraryVersion,
    physicalSizeCm: {
      ...specAsset.physicalSizeCm
    },
    renderClass: specAsset.renderClass,
    placementSurface: specAsset.placementSurface,
    directions: renderSizeByDirection,
    footprintLocalCm: toPolygon(specAsset.footprintLocalCm) ?? [],
    ...(specAsset.placementClearanceLocalCm
      ? {
          placementClearanceLocalCm: toPolygon(specAsset.placementClearanceLocalCm)
        }
      : {}),
    ...(specAsset.supportSurfaceLocalCm
      ? {
          supportSurfaceLocalCm: toPolygon(specAsset.supportSurfaceLocalCm)
        }
      : {}),
    blocksMovement: specAsset.blocksMovement,
    supportsAvatarSeat: specAsset.supportsAvatarSeat,
    supportsChildItems: specAsset.supportsChildItems
  }
}

interface RoomVNextFullWaveRuntimeAssetBundle {
  body: Record<RoomFurnitureRotation, RoomV2AssetRef>
  shadow: Record<RoomFurnitureRotation, RoomV2AssetRef>
  thumbnail: RoomV2AssetRef
}

type FullWaveRuntimeAssetRegistry = Readonly<Record<string, RoomVNextFullWaveRuntimeAssetBundle>>

function isCandidateManifestValid(
  manifest: RoomVNextFullWaveManifest,
  runtimeAssets: FullWaveRuntimeAssetRegistry
): boolean {
  if (
    manifest.status !== "candidate_validated" ||
    manifest.runtimePromotion !== "blocked" ||
    manifest.assets.length !== ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS.length
  ) {
    return false
  }
  const manifestById = new Map(manifest.assets.map((asset) => [asset.skuId, asset]))
  const specById = new Map(fullWaveSpec.assets.map((asset) => [asset.skuId, asset]))
  return ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS.every((candidateId) => {
    const specAsset = specById.get(candidateId)
    const manifestAsset = manifestById.get(candidateId)
    const bundledAssets = runtimeAssets[candidateId]
    if (!specAsset || !manifestAsset || !bundledAssets) return false
    if (specAsset.production.runtimePromotion !== "blocked") return false
    return REQUIRED_DIRECTIONS.every((direction) => {
      const body = manifestAsset.directions[direction]?.layers.body
      const shadow = manifestAsset.directions[direction]?.layers.contactShadow
      const thumbnail = manifestAsset.directions.front?.layers.thumbnail
      return (
        specAsset.directions[direction]?.rootRotationDegrees !== undefined &&
        body?.path?.length > 0 &&
        isValidAlphaEnvelope(body) &&
        (shadow?.path?.length ?? 0) > 0 &&
        bundledAssets.body[direction]?.key?.length > 0 &&
        bundledAssets.shadow[direction]?.key?.length > 0 &&
        bundledAssets.thumbnail?.key?.length > 0 &&
        bundledAssets.body[direction]?.integritySha256 === body.sha256 &&
        bundledAssets.shadow[direction]?.integritySha256 === shadow?.sha256 &&
        bundledAssets.thumbnail?.integritySha256 === thumbnail?.sha256
      )
    })
  })
}

function isFullWaveRegistryValid(usePolish: boolean, useFullPolish: boolean): boolean {
  if (
    fullWaveSpec.schemaVersion !== "blumi-room-vnext-full-wave-catalog-v1" ||
    fullWaveSpec.catalogStatus !== "candidate_only" ||
    fullWaveSpec.count !== 45 ||
    fullWaveSpec.assets.length !== 45
  ) {
    return false
  }
  if (
    usePolish && !useFullPolish &&
    (fullWavePolishManifest.status !== "candidate_validated" ||
      fullWavePolishManifest.runtimePromotion !== "blocked" ||
      fullWavePolishManifest.assets.length !== 21)
  ) {
    return false
  }
  if (
    useFullPolish &&
    (fullWavePolishFull45Manifest.status !== "candidate_validated" ||
      fullWavePolishFull45Manifest.runtimePromotion !== "blocked" ||
      fullWavePolishFull45Manifest.assets.length !== 45)
  ) {
    return false
  }
  if (
    fullWaveManifest.status !== "candidate_validated" ||
    fullWaveManifest.runtimePromotion !== "blocked" ||
    fullWaveManifest.assets.length !== 45
  ) {
    return false
  }
  const manifestById = new Map(fullWaveManifest.assets.map((asset) => [asset.skuId, asset]))
  const specById = new Map(fullWaveSpec.assets.map((asset) => [asset.skuId, asset]))
  return ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS.every((candidateId) => {
    const specAsset = specById.get(candidateId)
    const bundledAssets = useFullPolish
      ? ROOM_VNEXT_FULL_WAVE_POLISH_FULL45_RUNTIME_ASSETS[candidateId]
      : usePolish
      ? ROOM_VNEXT_FULL_WAVE_POLISH_RUNTIME_ASSETS[candidateId] ?? ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS[candidateId]
      : ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS[candidateId]
    const manifestAsset = useFullPolish
      ? fullWavePolishFull45Manifest.assets.find((asset) => asset.skuId === candidateId)
      : usePolish
      ? fullWavePolishManifest.assets.find((asset) => asset.skuId === candidateId) ?? manifestById.get(candidateId)
      : manifestById.get(candidateId)
    if (!specAsset || !manifestAsset || !bundledAssets) return false
    if (specAsset.production.runtimePromotion !== "blocked") return false
    return REQUIRED_DIRECTIONS.every((direction) => {
      const specDirection = specAsset.directions[direction]
      const manifestDirection = manifestAsset.directions[direction]
      const body = manifestDirection?.layers.body
      const shadow = manifestDirection?.layers.contactShadow
      const thumbnail = manifestAsset.directions.front?.layers.thumbnail
      return (
        specDirection?.rootRotationDegrees !== undefined &&
        body?.path?.length > 0 &&
        isValidAlphaEnvelope(body) &&
        (shadow?.path?.length ?? 0) > 0 &&
        (thumbnail?.path?.length ?? 0) > 0 &&
        bundledAssets.body[direction]?.key?.length > 0 &&
        bundledAssets.shadow[direction]?.key?.length > 0 &&
        bundledAssets.thumbnail?.key?.length > 0 &&
        bundledAssets.body[direction]?.integritySha256 === body.sha256 &&
        bundledAssets.shadow[direction]?.integritySha256 === shadow?.sha256 &&
        bundledAssets.thumbnail?.integritySha256 === thumbnail?.sha256
      )
    })
  })
}

function isValidAlphaEnvelope(body: {
  canvas?: { width?: number; height?: number }
  alphaBounds?: { width?: number; height?: number }
} | undefined): boolean {
  const canvasWidth = body?.canvas?.width
  const canvasHeight = body?.canvas?.height
  const alphaWidth = body?.alphaBounds?.width
  const alphaHeight = body?.alphaBounds?.height
  return (
    Number.isFinite(canvasWidth) && canvasWidth! > 0 &&
    Number.isFinite(canvasHeight) && canvasHeight! > 0 &&
    Number.isFinite(alphaWidth) && alphaWidth! > 0 && alphaWidth! <= canvasWidth! &&
    Number.isFinite(alphaHeight) && alphaHeight! > 0 && alphaHeight! <= canvasHeight!
  )
}

function buildCatalogAssembly(
  usePolish = false,
  useFullPolish = false,
  customRuntimeAssets?: FullWaveRuntimeAssetRegistry,
  customManifest?: RoomVNextFullWaveManifest
): CatalogAssembly {
  if (customRuntimeAssets && customManifest) {
    if (!isCandidateManifestValid(customManifest, customRuntimeAssets)) {
      return { valid: false, catalog: [] }
    }
  } else if (!isFullWaveRegistryValid(usePolish, useFullPolish)) {
    return {
      valid: false,
      catalog: []
    }
  }

  const specById = new Map(fullWaveSpec.assets.map((asset) => [asset.skuId, asset]))
  const manifestById = new Map(fullWaveManifest.assets.map((asset) => [asset.skuId, asset]))
  const polishManifestById = new Map(fullWavePolishManifest.assets.map((asset) => [asset.skuId, asset]))
  const polishFull45ManifestById = new Map(fullWavePolishFull45Manifest.assets.map((asset) => [asset.skuId, asset]))
  const selectedManifest = customManifest ?? (
    useFullPolish
      ? fullWavePolishFull45Manifest
      : usePolish
      ? fullWavePolishManifest
      : fullWaveManifest
  )
  const selectedManifestById = new Map(selectedManifest.assets.map((asset) => [asset.skuId, asset]))
  const selectedRuntimeAssets = customRuntimeAssets ?? (
    useFullPolish
      ? ROOM_VNEXT_FULL_WAVE_POLISH_FULL45_RUNTIME_ASSETS
      : usePolish
      ? ROOM_VNEXT_FULL_WAVE_POLISH_RUNTIME_ASSETS
      : ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS
  )

  const catalog = ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS.map((candidateId) => {
    const specAsset = specById.get(candidateId)!
    const manifestAsset = (customManifest
      ? selectedManifestById.get(candidateId)
      : (useFullPolish
        ? polishFull45ManifestById.get(candidateId)
        : usePolish
        ? polishManifestById.get(candidateId) ?? manifestById.get(candidateId)
        : manifestById.get(candidateId)))!
    const bundledAssets = customRuntimeAssets
      ? selectedRuntimeAssets[candidateId]
      : (useFullPolish
      ? ROOM_VNEXT_FULL_WAVE_POLISH_FULL45_RUNTIME_ASSETS[candidateId]
      : usePolish
      ? ROOM_VNEXT_FULL_WAVE_POLISH_RUNTIME_ASSETS[candidateId] ?? ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS[candidateId]
      : ROOM_VNEXT_FULL_WAVE_RUNTIME_ASSETS[candidateId])!
    const visualContract = buildVisualContract(specAsset, manifestAsset, bundledAssets)
    const frontVisual = visualContract.directions.front
    const footprint = toFootprint(visualContract.footprintLocalCm)
    const placementFootprint = toFootprint(visualContract.placementClearanceLocalCm)

    return {
      id: candidateId,
      name: specAsset.displayName,
      asset: frontVisual.bodyAsset,
      assetsByRotation: Object.fromEntries(
        REQUIRED_DIRECTIONS.map((direction) => [
          direction,
          visualContract.directions[direction].bodyAsset
        ])
      ),
      rotationPolicy: "directional_assets_required",
      thumbnail: { ...bundledAssets.thumbnail },
      category: deriveCategory(specAsset),
      sceneProjection: specAsset.renderClass,
      layer: deriveLayer(specAsset),
      placementSurface: specAsset.placementSurface,
      surfacePlacementPolicy: deriveSurfacePlacementPolicy(specAsset),
      surfaceSupports: deriveSupportBounds(specAsset),
      width: frontVisual.normalizedRenderSize.width,
      height: frontVisual.normalizedRenderSize.height,
      renderSizeByRotation: Object.fromEntries(
        REQUIRED_DIRECTIONS.map((direction) => [
          direction,
          { ...visualContract.directions[direction].normalizedRenderSize }
        ])
      ),
      anchor: { ...frontVisual.normalizedFloorPivot },
      anchorByRotation: Object.fromEntries(
        REQUIRED_DIRECTIONS.map((direction) => [
          direction,
          { ...visualContract.directions[direction].normalizedFloorPivot }
        ])
      ),
      footprint,
      placementFootprint,
      blocksMovement: specAsset.blocksMovement,
      interactionType: deriveInteractionType(specAsset),
      seatSpec: deriveSeatSpec(specAsset),
      sourceStatus: "candidate" as RoomAssetSourceStatus,
      qaStatus: "blocked" as RoomAssetQaStatus,
      ownedByDefault: false,
      locked: true,
      visualContract
    } satisfies FurnitureItem
  })

  if (catalog.some((item) => {
    const contract = item.visualContract
    return !contract || !validateRoomFurnitureVisualContract(contract).isValid
  })) {
    return {
      valid: false,
      catalog: []
    }
  }

  return {
    valid: true,
    catalog
  }
}

function cloneCatalogItems(catalog: FurnitureItem[]): FurnitureItem[] {
  return catalog.map((item) => ({
    ...item,
    assetsByRotation: item.assetsByRotation
      ? Object.fromEntries(
          Object.entries(item.assetsByRotation).map(([direction, asset]) => [
            direction,
            { ...asset }
          ])
        )
      : undefined,
    thumbnail: item.thumbnail ? { ...item.thumbnail } : undefined,
    anchor: item.anchor ? { ...item.anchor } : undefined,
    anchorByRotation: item.anchorByRotation
      ? Object.fromEntries(
          Object.entries(item.anchorByRotation).map(([direction, anchor]) => [
            direction,
            anchor ? { ...anchor } : anchor
          ])
        )
      : undefined,
    footprint: item.footprint ? { ...item.footprint } : undefined,
    placementFootprint: item.placementFootprint
      ? { ...item.placementFootprint }
      : undefined,
    seatSpec: item.seatSpec
      ? {
          ...item.seatSpec,
          seatPoints: item.seatSpec.seatPoints.map((seatPoint) => ({
            ...seatPoint,
            ...(seatPoint.localPositionCm
              ? { localPositionCm: { ...seatPoint.localPositionCm } }
              : {}),
            ...(seatPoint.approachPointCm
              ? { approachPointCm: { ...seatPoint.approachPointCm } }
              : {}),
            ...(seatPoint.exitPointCm
              ? { exitPointCm: { ...seatPoint.exitPointCm } }
              : {}),
            ...(seatPoint.approachPoint
              ? { approachPoint: { ...seatPoint.approachPoint } }
              : {}),
            ...(seatPoint.exitPoint
              ? { exitPoint: { ...seatPoint.exitPoint } }
              : {})
          }))
        }
      : undefined,
    surfaceSupports: item.surfaceSupports?.map((support) => ({
      ...support,
      localBounds: { ...support.localBounds }
    })),
    visualContract: item.visualContract
      ? {
          ...item.visualContract,
          physicalSizeCm: { ...item.visualContract.physicalSizeCm },
          directions: Object.fromEntries(
            REQUIRED_DIRECTIONS.map((direction) => [
              direction,
              {
                ...item.visualContract!.directions[direction],
                bodyAsset: { ...item.visualContract!.directions[direction].bodyAsset },
                ...(item.visualContract!.directions[direction].contactShadowAsset
                  ? {
                      contactShadowAsset: {
                        ...item.visualContract!.directions[direction].contactShadowAsset!
                      }
                    }
                  : {})
              }
            ])
          ) as RoomFurnitureVisualContract["directions"],
          footprintLocalCm: item.visualContract.footprintLocalCm.map((point) => ({ ...point })),
          placementClearanceLocalCm: item.visualContract.placementClearanceLocalCm?.map((point) => ({ ...point })),
          supportSurfaceLocalCm: item.visualContract.supportSurfaceLocalCm?.map((point) => ({ ...point }))
        }
      : undefined
  }))
}

export function createRoomVNextFullWaveCandidateCatalog(): FurnitureItem[] {
  const assembly = buildCatalogAssembly()
  if (!assembly.valid) return []
  return cloneCatalogItems(assembly.catalog)
}

/**
 * Cute v3 is an append-only visual candidate. It is intentionally separate
 * from the older v1/v2 QA switches so a stale flag cannot silently select it.
 */
export function createRoomVNextFullWaveCuteCandidateCatalog(): FurnitureItem[] {
  const assembly = buildCatalogAssembly(
    false,
    false,
    ROOM_VNEXT_FULL_WAVE_CUTE_RUNTIME_ASSETS,
    fullWaveCuteManifest
  )
  if (!assembly.valid) return []
  return cloneCatalogItems(assembly.catalog)
}

export function resolveRoomVNextFullWaveCandidateCatalog(
  input: RoomVNextFullWaveCatalogInput
): RoomVNextFullWaveCatalogResolution {
  const isExplicitQaRuntime =
    input.rawFullWaveFlag === "1" &&
    (
      (input.isDevelopmentRuntime && input.buildProfile === "development") ||
      input.buildProfile === "native-ui-test"
    )

  if (!isExplicitQaRuntime) {
    return {
      enabled: false,
      reason: "disabled",
      catalog: [],
      ownedItemIds: []
    }
  }

  const useFullPolish = input.rawFullWavePolishFullFlag?.trim() === "1"
  const usePolish = !useFullPolish && input.rawFullWavePolishFlag?.trim() === "1"
  const assembly = buildCatalogAssembly(usePolish, useFullPolish)
  const catalog = assembly.valid
    ? assembly.catalog.map((item) => ({
        ...item,
        assetsByRotation: item.assetsByRotation
          ? Object.fromEntries(Object.entries(item.assetsByRotation).map(([direction, asset]) => [direction, { ...asset }]))
          : undefined,
        thumbnail: item.thumbnail ? { ...item.thumbnail } : undefined
      }))
    : []
  if (catalog.length !== ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS.length) {
    return {
      enabled: false,
      reason: "invalid_candidate_registry",
      catalog: [],
      ownedItemIds: []
    }
  }

  const unlockedCatalog = catalog.map((item) => ({
    ...item,
    ownedByDefault: true,
    locked: false
  }))
  return {
    enabled: true,
    reason: "ready",
    catalog: unlockedCatalog,
    ownedItemIds: unlockedCatalog.map((item) => item.id)
  }
}

/**
 * Explicit QA resolver for the cute v3 art wave. This shares the same build
 * allow-list as the existing full-wave proof, but requires a second flag so
 * an existing v1/v2 test setup cannot opt into new art accidentally.
 */
export function resolveRoomVNextFullWaveCuteCandidateCatalog(
  input: RoomVNextFullWaveCatalogInput & { rawFullWaveCuteFlag?: string }
): RoomVNextFullWaveCatalogResolution {
  const allowedBuild =
    (input.isDevelopmentRuntime && input.buildProfile === "development") ||
    input.buildProfile === "native-ui-test"
  if (
    input.rawFullWaveFlag?.trim() !== "1" ||
    input.rawFullWaveCuteFlag?.trim() !== "1" ||
    !allowedBuild
  ) {
    return {
      enabled: false,
      reason: "disabled",
      catalog: [],
      ownedItemIds: []
    }
  }

  const assembly = buildCatalogAssembly(
    false,
    false,
    ROOM_VNEXT_FULL_WAVE_CUTE_RUNTIME_ASSETS,
    fullWaveCuteManifest
  )
  if (!assembly.valid || assembly.catalog.length !== ROOM_VNEXT_FULL_WAVE_CANDIDATE_IDS.length) {
    return {
      enabled: false,
      reason: "invalid_candidate_registry",
      catalog: [],
      ownedItemIds: []
    }
  }

  const catalog = cloneCatalogItems(assembly.catalog).map((item) => ({
    ...item,
    ownedByDefault: true,
    locked: false
  }))
  return {
    enabled: true,
    reason: "ready",
    catalog,
    ownedItemIds: catalog.map((item) => item.id)
  }
}

export function resolveRoomV2FurnitureCatalogForVNextFullWaveRuntime(input: {
  legacyCatalog: readonly FurnitureItem[]
} & RoomVNextFullWaveCatalogInput): RoomVNextFullWaveCatalogResolution {
  const qaCatalog = resolveRoomVNextFullWaveCandidateCatalog(input)
  if (!qaCatalog.enabled) {
    return {
      enabled: false,
      reason: qaCatalog.reason,
      catalog: [...input.legacyCatalog],
      ownedItemIds: []
    }
  }
  return qaCatalog
}
