import type { DimensionValue, ImageSourcePropType } from "react-native"

export type RoomLayer =
  | "background"
  | "wall"
  | "floor"
  | "furniture"
  | "foreground"
  | "overlay"

export const ROOM_LAYER_ORDER: Record<RoomLayer, number> = {
  background: 0,
  wall: 10,
  floor: 20,
  furniture: 30,
  foreground: 40,
  overlay: 50
}

export type RoomFurnitureRotation = "front" | "back" | "left" | "right"

export type RoomPlacementSurface = "floor" | "wall" | "tabletop" | "ceiling"

export type RoomAssetSourceStatus = "approved" | "candidate" | "legacy"

export type RoomAssetQaStatus = "pending" | "pass" | "fail" | "blocked"

export type RoomV2AvatarMotionState =
  | "idle"
  | "walking"
  | "sitting"
  | "waving"
  | "dancing"

export type RoomV2AvatarAssetResolutionKind =
  | "exact"
  | "sameStateFront"
  | "idleSameDirection"
  | "idleFront"
  | "baseAsset"

export type RoomV2AvatarMotionTreatment =
  | "animatedMotionAssets"
  | "exactMotionAssets"
  | "runtimeLocomotion"
  | "runtimeGesture"
  | "idleBaseAsset"
  | "idleFallback"

export type RoomV2AvatarMotionAssetIssueId =
  | "missing_exact_layers"
  | "missing_animation_frames"
  | "insufficient_animation_frames"
  | "mixed_frame_counts"
  | "mixed_frame_durations"
  | "mixed_rigs"
  | "mixed_fit_profiles"

export interface RoomV2AvatarMotionAssetDiagnostics {
  requestedState: RoomV2AvatarMotionState
  requestedDirection: RoomFurnitureRotation
  layerCount: number
  exactLayerCount: number
  animatedLayerCount: number
  frameCounts: number[]
  frameDurationMsValues: number[]
  minimumFrameCount: number
  rigIds: string[]
  fitProfileIds: string[]
  issueIds: RoomV2AvatarMotionAssetIssueId[]
  supportsExactMotion: boolean
  supportsAnimatedMotion: boolean
  isProductionReady: boolean
}

export type FurnitureCategory =
  | "seating"
  | "table"
  | "rug"
  | "plant"
  | "lighting"
  | "wallDecor"
  | "misc"

export type FurnitureInteractionType = "none" | "decor" | "seat"

export type FurnitureRotationPolicy =
  | "legacy_mirror_allowed"
  | "directional_assets_required"

export interface RoomV2AssetRef {
  key: string
  source: ImageSourcePropType
  /** Build-time binding to the reviewed runtime file bytes. */
  integritySha256?: string
}

/**
 * Immutable visual metadata emitted by the Room VNext world-kit pipeline.
 *
 * The current renderer still accepts the legacy FurnitureItem fields.  This
 * contract is intentionally additive so an approved VNext asset can be
 * adapted into that shape without making existing user rooms unreadable.
 */
export interface RoomFurnitureDirectionalVisual {
  bodyAsset: RoomV2AssetRef
  contactShadowAsset?: RoomV2AssetRef
  foregroundOcclusionAsset?: RoomV2AssetRef
  /** Optional tight thumbnail derived from the same directional master. */
  thumbnailAsset?: RoomV2AssetRef
  normalizedRenderSize: {
    width: number
    height: number
  }
  normalizedFloorPivot: RoomAnchor
}

export interface RoomFurnitureVisualContract {
  schemaVersion: "room-furniture-visual-vnext-1"
  skuId: string
  assetSetId: string
  assetVersion: number
  perspectiveProfile: "my-room-locked-2.5d-v1"
  viewportProfile: "ROOM_V2_APPROVED_MY_ROOM_CAMERA"
  assetCameraRigId: string
  cameraRigVersion: string
  lightRigVersion: string
  materialLibraryVersion: string
  physicalSizeCm: {
    width: number
    depth: number
    height: number
  }
  renderClass: "upright" | "floor_plane"
  placementSurface: RoomPlacementSurface
  directions: Record<RoomFurnitureRotation, RoomFurnitureDirectionalVisual>
  /** Polygon in local centimetres, anchored at the shared floor pivot. */
  footprintLocalCm: RoomPoint2D[]
  placementClearanceLocalCm?: RoomPoint2D[]
  supportSurfaceLocalCm?: RoomPoint2D[]
  blocksMovement: boolean
  supportsAvatarSeat: boolean
  supportsChildItems: boolean
}

export interface RoomV2AvatarAssetSequence {
  frames: [RoomV2AssetRef, ...RoomV2AssetRef[]]
  frameDurationMs: number
  loop?: boolean
}

export type RoomV2AvatarMotionAsset =
  | RoomV2AssetRef
  | RoomV2AvatarAssetSequence

export interface RoomCanvasSize {
  width: number
  height: number
}

export interface RoomBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface RoomWalkablePolygonPoint {
  x: number
  y: number
}

/** Generic 2D point used by asset-local footprint metadata. */
export type RoomPoint2D = RoomWalkablePolygonPoint

export interface RoomPlacementLane {
  id: string
  y: number
  label?: string
  minX?: number
  maxX?: number
  snapRadius?: number
}

export interface RoomShellMyRoomCamera {
  compactRendererWidth: DimensionValue
  regularRendererWidth: DimensionValue
  rendererTranslateY: number
  compactStageHeightRatio?: number
  wideStageHeightRatio?: number
  compactMinStageHeight?: number
  wideMinStageHeight?: number
  compactMaxStageHeight?: number
  wideMaxStageHeight?: number
}

export interface RoomShellMiniRoomCamera {
  rendererWidth: DimensionValue
  rendererTranslateY: number
  backgroundColor: string
}

export interface RoomAnchor {
  x: number
  y: number
}

export interface RoomFootprint {
  width: number
  height: number
}

export interface RoomSeatPoint {
  id: string
  x: number
  y: number
  facing?: RoomFurnitureRotation
  approachPoint?: RoomAnchor
  exitPoint?: RoomAnchor
  /** Optional authored physical coordinates for VNext furniture. */
  localPositionCm?: RoomPoint2D
  approachPointCm?: RoomPoint2D
  exitPointCm?: RoomPoint2D
  seatHeight?: number
}

export interface RoomSeatSpec {
  capacity: number
  seatPoints: RoomSeatPoint[]
}

export interface RoomV2SeatWorldPoint {
  id: string
  facing: RoomFurnitureRotation
  /** Normalized vertical sitting offset, preserved for avatar pose alignment. */
  seatHeight: number
  seat: RoomAnchor
  approach: RoomAnchor
  exit: RoomAnchor
}

export interface RoomShell {
  id: string
  name: string
  asset: RoomV2AssetRef
  canvasSize: RoomCanvasSize
  geometryVersion?: string
  sourceStatus?: RoomAssetSourceStatus
  qaStatus?: RoomAssetQaStatus
  myRoomCamera?: RoomShellMyRoomCamera
  miniRoomCamera?: RoomShellMiniRoomCamera
  placeableArea?: RoomBounds
  /** Normalized placement regions for non-floor surfaces in the locked room. */
  surfacePlacementAreas?: Partial<Record<RoomPlacementSurface, RoomBounds>>
  /** Normalized keep-out regions such as baked windows or wall openings. */
  surfacePlacementExclusions?: Partial<Record<RoomPlacementSurface, RoomBounds[]>>
  walkablePolygon?: RoomWalkablePolygonPoint[]
  placementLanes?: RoomPlacementLane[]
}

export interface RoomFurnitureSurfaceSupport {
  surface: Extract<RoomPlacementSurface, "tabletop">
  /** Bounds are normalized to the supporting furniture image rectangle. */
  localBounds: RoomBounds
  /** Optional bounds for asymmetric directional renders. */
  localBoundsByRotation?: Partial<Record<RoomFurnitureRotation, RoomBounds>>
}

/**
 * Normalized crop of a furniture render that belongs in front of a seated
 * avatar. This keeps the avatar behind the cushion/seat rail without
 * requiring a second bitmap for every directional asset.
 */
export interface RoomFurnitureFrontOcclusion {
  left: number
  top: number
  width: number
  height: number
}

export interface FurnitureItem {
  id: string
  name: string
  asset: RoomV2AssetRef
  assetsByRotation?: Partial<Record<RoomFurnitureRotation, RoomV2AssetRef>>
  rotationPolicy?: FurnitureRotationPolicy
  thumbnail?: RoomV2AssetRef
  collectionId?: string
  homeTheme?: string
  category: FurnitureCategory
  /** How authored art maps into the locked 2.5D scene box. */
  sceneProjection?: "upright" | "floor_plane"
  layer: RoomLayer
  placementSurface?: RoomPlacementSurface
  /** Wall props either avoid baked openings or intentionally attach to one. */
  surfacePlacementPolicy?: "avoid_openings" | "opening"
  surfaceSupports?: RoomFurnitureSurfaceSupport[]
  width: number
  height: number
  /** Rotation-aware projected box derived from the physical meter contract. */
  renderSizeByRotation?: Partial<
    Record<RoomFurnitureRotation, { width: number; height: number }>
  >
  anchor?: RoomAnchor
  anchorByRotation?: Partial<Record<RoomFurnitureRotation, RoomAnchor>>
  footprint?: RoomFootprint
  footprintByRotation?: Partial<Record<RoomFurnitureRotation, RoomFootprint>>
  /**
   * Tight base used only while arranging furniture. It deliberately excludes
   * painted shadows and empty transparent crop so adjacent props can read as
   * one natural grouping without changing avatar collision.
   */
  placementFootprint?: RoomFootprint
  placementFootprintByRotation?: Partial<
    Record<RoomFurnitureRotation, RoomFootprint>
  >
  blocksMovement?: boolean
  interactionType?: FurnitureInteractionType
  seatPoints?: RoomSeatPoint[]
  seatSpec?: RoomSeatSpec
  frontOcclusionByRotation?: Partial<Record<RoomFurnitureRotation, RoomFurnitureFrontOcclusion>>
  rearAsset?: RoomV2AssetRef
  frontOcclusionAsset?: RoomV2AssetRef
  sourceStatus?: RoomAssetSourceStatus
  qaStatus?: RoomAssetQaStatus
  ownedByDefault?: boolean
  locked?: boolean
  /** Optional VNext contract. Legacy fields remain the compatibility adapter. */
  visualContract?: RoomFurnitureVisualContract
}

export interface PlacedRoomItem {
  instanceId: string
  itemId: string
  x: number
  y: number
  rotation: RoomFurnitureRotation
  depth?: number
  width?: number
  height?: number
  /** Geometry contract used when this instance was last placed. */
  geometryVersion?: string
  placementSurface?: RoomPlacementSurface
  /** Parent furniture instance for tabletop/attached combinations. */
  supportInstanceId?: string
  /** Parent direction at the time the child was attached. */
  supportParentRotation?: RoomFurnitureRotation
  /** Child position in the parent's normalized support surface. */
  supportLocalPosition?: RoomPoint2D
}

export interface UserRoomDecor {
  schemaVersion?: number
  geometryVersion?: string
  migration?: {
    fromSchemaVersion: number
    sourceShellId: string
  }
  roomShellId: string
  placedItems: PlacedRoomItem[]
}

export interface RoomV2RenderItemBase {
  renderId: string
  kind: "furniture" | "avatar"
  layer: RoomLayer
  depth: number
  x: number
  y: number
  width: number
  height: number
  anchor: RoomAnchor
}

export interface RoomV2FurnitureRenderItem extends RoomV2RenderItemBase {
  kind: "furniture"
  itemId: string
  name: string
  category: FurnitureCategory
  sceneProjection?: "upright" | "floor_plane"
  asset: RoomV2AssetRef
  rotation: RoomFurnitureRotation
  usesMirroredRotation: boolean
  footprint?: RoomFootprint
  placementFootprint?: RoomFootprint
  placementSurface?: RoomPlacementSurface
  surfacePlacementPolicy?: "avoid_openings" | "opening"
  surfaceSupports?: RoomFurnitureSurfaceSupport[]
  blocksMovement: boolean
  /** Runtime world polygon derived from the physical VNext footprint. */
  collisionPolygon?: RoomPoint2D[]
  /** Runtime world polygon including placement clearance. */
  placementPolygon?: RoomPoint2D[]
  interactionType: FurnitureInteractionType
  seatPoints?: RoomSeatPoint[]
  seatSpec?: RoomSeatSpec
  seatWorldPoints?: RoomV2SeatWorldPoint[]
  frontOcclusion?: RoomFurnitureFrontOcclusion
  visualContract?: RoomFurnitureVisualContract
  contactShadowAsset?: RoomV2AssetRef
  foregroundOcclusionAsset?: RoomV2AssetRef
}

export interface RoomV2AvatarRenderLayer {
  id: string
  type: string
  layerOrder: number
  asset: RoomV2AssetRef
  animation?: RoomV2AvatarAssetSequence
  requestedState?: RoomV2AvatarMotionState
  requestedDirection?: RoomFurnitureRotation
  resolvedState?: RoomV2AvatarMotionState
  resolvedDirection?: RoomFurnitureRotation
  usingFallbackAsset?: boolean
  assetResolutionKind?: RoomV2AvatarAssetResolutionKind
  rigId?: string
  fitProfileId?: string
}

/**
 * Furniture-local rig metadata carried by an avatar while seated.
 * Furniture rotation resolves the world point and facing before this reaches
 * the renderer; the renderer consumes the calibrated height without
 * inventing a second coordinate system.
 */
export interface RoomV2AvatarSeatRig {
  furnitureRenderId: string
  seatId: string
  seatHeight: number
  facing: RoomFurnitureRotation
}

export interface RoomV2AvatarRenderItem extends RoomV2RenderItemBase {
  kind: "avatar"
  avatarId: string
  name?: string
  layers: RoomV2AvatarRenderLayer[]
  direction?: RoomFurnitureRotation
  state?: RoomV2AvatarMotionState
  motionTreatment?: RoomV2AvatarMotionTreatment
  seatRig?: RoomV2AvatarSeatRig
  // Future metadata only: chat/reaction rendering is intentionally out of
  // scope for the first room-world proof.
  chatBubbleAnchor?: RoomAnchor
  reactionAnchor?: RoomAnchor
}

export type RoomV2RenderItem =
  | RoomV2FurnitureRenderItem
  | RoomV2AvatarRenderItem

export interface ResolvedRoomV2Scene {
  shell: RoomShell | null
  renderItems: RoomV2RenderItem[]
}
