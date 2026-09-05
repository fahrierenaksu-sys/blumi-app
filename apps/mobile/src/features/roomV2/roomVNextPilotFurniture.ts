import { roomV2Assets } from "./roomV2Assets"
import { getRoomVNextCalibratedRenderSize } from "./roomVNextScale"
import type {
  FurnitureItem,
  RoomAnchor,
  RoomFootprint,
  RoomFurnitureDirectionalVisual,
  RoomFurnitureRotation,
  RoomFurnitureSurfaceSupport,
  RoomFurnitureVisualContract,
  RoomPoint2D,
  RoomSeatSpec,
  RoomV2AssetRef
} from "./roomV2.types"

/**
 * Candidate-only World Kit catalog.  These seven pieces are intentionally
 * additive: the resolver below is used only by the isolated VNext native QA
 * flag, never by the production catalog or existing user rooms.
 */
const DIRECTIONS: readonly RoomFurnitureRotation[] = [
  "front",
  "right",
  "back",
  "left"
]

const PROFILE = {
  perspectiveProfile: "my-room-locked-2.5d-v1" as const,
  viewportProfile: "ROOM_V2_APPROVED_MY_ROOM_CAMERA" as const,
  assetCameraRigId: "blumi-room-camera-rig-v1",
  cameraRigVersion: "calibration-candidate-v2",
  lightRigVersion: "blumi-room-light-rig-v2",
  materialLibraryVersion: "blumi-room-materials-v2"
}

type DirectionalAssets = {
  body: Record<RoomFurnitureRotation, RoomV2AssetRef>
  shadow: Record<RoomFurnitureRotation, RoomV2AssetRef>
  occlusion?: Record<RoomFurnitureRotation, RoomV2AssetRef>
  thumbnail: RoomV2AssetRef
}

const PILOT_ASSETS: Record<string, DirectionalAssets> = {
  room_vnext_lounge_chair: {
    body: roomV2Assets.furniture.roomVNextPilotLoungeChair,
    shadow: roomV2Assets.furniture.roomVNextPilotLoungeChairShadow,
    occlusion: roomV2Assets.furniture.roomVNextPilotLoungeChairOcclusion,
    thumbnail: roomV2Assets.furniture.roomVNextPilotLoungeChairThumbnail
  },
  room_vnext_round_table: {
    body: roomV2Assets.furniture.roomVNextPilotRoundTable,
    shadow: roomV2Assets.furniture.roomVNextPilotRoundTableShadow,
    thumbnail: roomV2Assets.furniture.roomVNextPilotRoundTableThumbnail
  },
  room_vnext_side_table: {
    body: roomV2Assets.furniture.roomVNextPilotSideTable,
    shadow: roomV2Assets.furniture.roomVNextPilotSideTableShadow,
    thumbnail: roomV2Assets.furniture.roomVNextPilotSideTableThumbnail
  },
  room_vnext_lamp: {
    body: roomV2Assets.furniture.roomVNextPilotLamp,
    shadow: roomV2Assets.furniture.roomVNextPilotLampShadow,
    thumbnail: roomV2Assets.furniture.roomVNextPilotLampThumbnail
  },
  room_vnext_bookshelf: {
    body: roomV2Assets.furniture.roomVNextPilotBookshelf,
    shadow: roomV2Assets.furniture.roomVNextPilotBookshelfShadow,
    thumbnail: roomV2Assets.furniture.roomVNextPilotBookshelfThumbnail
  },
  room_vnext_rug: {
    body: roomV2Assets.furniture.roomVNextPilotRug,
    shadow: roomV2Assets.furniture.roomVNextPilotRugShadow,
    thumbnail: roomV2Assets.furniture.roomVNextPilotRugThumbnail
  },
  room_vnext_tabletop_plant: {
    body: roomV2Assets.furniture.roomVNextPilotTabletopPlant,
    shadow: roomV2Assets.furniture.roomVNextPilotTabletopPlantShadow,
    thumbnail: roomV2Assets.furniture.roomVNextPilotTabletopPlantThumbnail
  }
}

type PilotSpec = {
  id: keyof typeof PILOT_ASSETS
  name: string
  category: FurnitureItem["category"]
  renderClass: "upright" | "floor_plane"
  placementSurface: "floor" | "tabletop"
  physicalSizeCm: { width: number; depth: number; height: number }
  footprintLocalCm: RoomPoint2D[]
  placementClearanceLocalCm: RoomPoint2D[]
  supportSurfaceLocalCm?: RoomPoint2D[]
  floorPivot: RoomAnchor
  sharedCrop: number
  /**
   * The front body alpha envelope from the immutable render manifest. The
   * runtime canvas is square, so this ratio is required to convert the
   * physical height/width into a calibrated canvas size instead of treating
   * a crop pixel count as a world scale.
   */
  bodyAlphaWidthRatio: number
  bodyAlphaHeightRatio: number
  blocksMovement: boolean
  supportsAvatarSeat: boolean
  supportsChildItems: boolean
  interactionType: FurnitureItem["interactionType"]
  supportBounds?: RoomFurnitureSurfaceSupport["localBounds"]
  seatSpec?: RoomSeatSpec
}

const cmPolygon = (points: readonly [number, number][]): RoomPoint2D[] =>
  points.map(([x, y]) => ({ x, y }))

const PILOT_SPECS: readonly PilotSpec[] = [
  {
    id: "room_vnext_lounge_chair",
    name: "Blumi Cloud Lounge Chair",
    category: "seating",
    renderClass: "upright",
    placementSurface: "floor",
    physicalSizeCm: { width: 82, depth: 80, height: 92 },
    footprintLocalCm: cmPolygon([[-38, -34], [38, -34], [38, 34], [-38, 34]]),
    placementClearanceLocalCm: cmPolygon([[-44, -42], [44, -42], [44, 42], [-44, 42]]),
    floorPivot: { x: 0.5059, y: 0.7529 },
    sharedCrop: 170,
    bodyAlphaWidthRatio: 0.6006,
    bodyAlphaHeightRatio: 0.7090,
    blocksMovement: true,
    supportsAvatarSeat: true,
    supportsChildItems: false,
    interactionType: "seat",
    seatSpec: {
      capacity: 1,
      seatPoints: [{
        id: "cloud-seat",
        x: 0,
        y: 0.1,
        facing: "front",
        approachPoint: { x: 0, y: -0.575 },
        exitPoint: { x: 0, y: 0.6 },
        localPositionCm: { x: 0, y: 8 },
        approachPointCm: { x: 0, y: -46 },
        exitPointCm: { x: 0, y: 48 },
        seatHeight: 0.0794
      }]
    }
  },
  {
    id: "room_vnext_round_table",
    name: "Blumi Honey Round Table",
    category: "table",
    renderClass: "upright",
    placementSurface: "floor",
    physicalSizeCm: { width: 90, depth: 90, height: 72 },
    footprintLocalCm: cmPolygon([[-44, -44], [44, -44], [44, 44], [-44, 44]]),
    placementClearanceLocalCm: cmPolygon([[-50, -50], [50, -50], [50, 50], [-50, 50]]),
    supportSurfaceLocalCm: cmPolygon([[-35, -35], [35, -35], [35, 35], [-35, 35]]),
    floorPivot: { x: 0.5032, y: 0.7161 },
    sharedCrop: 155,
    bodyAlphaWidthRatio: 0.6797,
    bodyAlphaHeightRatio: 0.6816,
    blocksMovement: true,
    supportsAvatarSeat: false,
    supportsChildItems: true,
    interactionType: "decor",
    supportBounds: { minX: 0.12, maxX: 0.88, minY: 0.12, maxY: 0.3 }
  },
  {
    id: "room_vnext_side_table",
    name: "Blumi Petal Side Table",
    category: "table",
    renderClass: "upright",
    placementSurface: "floor",
    physicalSizeCm: { width: 46, depth: 46, height: 50 },
    footprintLocalCm: cmPolygon([[-22, -22], [22, -22], [22, 22], [-22, 22]]),
    placementClearanceLocalCm: cmPolygon([[-27, -27], [27, -27], [27, 27], [-27, 27]]),
    supportSurfaceLocalCm: cmPolygon([[-17, -17], [17, -17], [17, 17], [-17, 17]]),
    floorPivot: { x: 0.5046, y: 0.7431 },
    sharedCrop: 109,
    bodyAlphaWidthRatio: 0.4922,
    bodyAlphaHeightRatio: 0.5566,
    blocksMovement: true,
    supportsAvatarSeat: false,
    supportsChildItems: true,
    interactionType: "decor",
    supportBounds: { minX: 0.14, maxX: 0.86, minY: 0.14, maxY: 0.3 }
  },
  {
    id: "room_vnext_lamp",
    name: "Blumi Glow Floor Lamp",
    category: "lighting",
    renderClass: "upright",
    placementSurface: "floor",
    physicalSizeCm: { width: 34, depth: 34, height: 126 },
    footprintLocalCm: cmPolygon([[-16, -16], [16, -16], [16, 16], [-16, 16]]),
    placementClearanceLocalCm: cmPolygon([[-21, -21], [21, -21], [21, 21], [-21, 21]]),
    floorPivot: { x: 0.5026, y: 0.8377 },
    sharedCrop: 191,
    bodyAlphaWidthRatio: 0.1963,
    bodyAlphaHeightRatio: 0.7461,
    blocksMovement: true,
    supportsAvatarSeat: false,
    supportsChildItems: false,
    interactionType: "decor"
  },
  {
    id: "room_vnext_bookshelf",
    name: "Blumi Story Bookshelf",
    category: "misc",
    renderClass: "upright",
    placementSurface: "floor",
    physicalSizeCm: { width: 94, depth: 38, height: 164 },
    footprintLocalCm: cmPolygon([[-45, -18], [45, -18], [45, 18], [-45, 18]]),
    placementClearanceLocalCm: cmPolygon([[-50, -24], [50, -24], [50, 24], [-50, 24]]),
    supportSurfaceLocalCm: cmPolygon([[-40, -15], [40, -15], [40, 15], [-40, 15]]),
    floorPivot: { x: 0.5019, y: 0.8276 },
    sharedCrop: 261,
    bodyAlphaWidthRatio: 0.4102,
    bodyAlphaHeightRatio: 0.8125,
    blocksMovement: true,
    supportsAvatarSeat: false,
    supportsChildItems: true,
    interactionType: "decor",
    supportBounds: { minX: 0.08, maxX: 0.92, minY: 0.08, maxY: 0.22 }
  },
  {
    id: "room_vnext_rug",
    name: "Blumi Daisy Rug",
    category: "rug",
    renderClass: "floor_plane",
    placementSurface: "floor",
    physicalSizeCm: { width: 158, depth: 112, height: 1 },
    footprintLocalCm: cmPolygon([[-77, -53], [77, -53], [77, 53], [-77, 53]]),
    placementClearanceLocalCm: cmPolygon([[-80, -56], [80, -56], [80, 56], [-80, 56]]),
    floorPivot: { x: 0.5057, y: 0.5208 },
    sharedCrop: 265,
    bodyAlphaWidthRatio: 0.8184,
    bodyAlphaHeightRatio: 0.3838,
    blocksMovement: false,
    supportsAvatarSeat: false,
    supportsChildItems: false,
    interactionType: "decor"
  },
  {
    id: "room_vnext_tabletop_plant",
    name: "Blumi Sprout Plant",
    category: "plant",
    renderClass: "upright",
    placementSurface: "tabletop",
    physicalSizeCm: { width: 22, depth: 22, height: 42 },
    footprintLocalCm: cmPolygon([[-10, -10], [10, -10], [10, 10], [-10, 10]]),
    placementClearanceLocalCm: cmPolygon([[-12, -12], [12, -12], [12, 12], [-12, 12]]),
    supportSurfaceLocalCm: cmPolygon([[-9, -9], [9, -9], [9, 9], [-9, 9]]),
    floorPivot: { x: 0.5051, y: 0.7172 },
    sharedCrop: 99,
    bodyAlphaWidthRatio: 0.2422,
    bodyAlphaHeightRatio: 0.5039,
    blocksMovement: false,
    supportsAvatarSeat: false,
    supportsChildItems: false,
    interactionType: "decor"
  }
]

function sceneFootprint(
  points: readonly RoomPoint2D[],
  rotation: RoomFurnitureRotation
): RoomFootprint {
  const horizontalUnitsPerCm = 0.3 / 170
  const floorDepthUnitsPerCm = 0.075 / 100
  const xValues = points.map((point) => point.x)
  const yValues = points.map((point) => point.y)
  const widthCm = Math.max(...xValues) - Math.min(...xValues)
  const depthCm = Math.max(...yValues) - Math.min(...yValues)
  return {
    width: Number(((rotation === "left" || rotation === "right" ? depthCm : widthCm) * horizontalUnitsPerCm).toFixed(4)),
    height: Number(((rotation === "left" || rotation === "right" ? widthCm : depthCm) * floorDepthUnitsPerCm).toFixed(4))
  }
}

function directionalVisuals(
  spec: PilotSpec,
  assets: DirectionalAssets
): Record<RoomFurnitureRotation, RoomFurnitureDirectionalVisual> {
  // The shell's canonical avatar is 170 cm tall in a 0.30 normalized stage.
  // Calibrating from the authored alpha envelope keeps the visible object at
  // its physical size. Upright renders use a square envelope; floor-plane
  // renders retain their authored X/Y envelope so rugs preserve the room
  // depth of the locked camera. `sharedCrop` remains provenance metadata only;
  // it must never be used as a world-size proxy.
  const size = getRoomVNextCalibratedRenderSize({
    physicalWidthCm: spec.physicalSizeCm.width,
    physicalDepthCm: spec.physicalSizeCm.depth,
    physicalHeightCm: spec.physicalSizeCm.height,
    renderClass: spec.renderClass,
    bodyAlphaWidthRatio: spec.bodyAlphaWidthRatio,
    bodyAlphaHeightRatio: spec.bodyAlphaHeightRatio
  })
  return Object.fromEntries(DIRECTIONS.map((direction) => [direction, {
    bodyAsset: assets.body[direction],
    contactShadowAsset: assets.shadow[direction],
    ...(assets.occlusion ? { foregroundOcclusionAsset: assets.occlusion[direction] } : {}),
    normalizedRenderSize: { ...size },
    normalizedFloorPivot: { ...spec.floorPivot }
  }])) as Record<RoomFurnitureRotation, RoomFurnitureDirectionalVisual>
}

function createContract(spec: PilotSpec, assets: DirectionalAssets): RoomFurnitureVisualContract {
  return {
    schemaVersion: "room-furniture-visual-vnext-1",
    skuId: spec.id,
    assetSetId: spec.id.replace("room_vnext_", "").split("_").join("-") + "-vnext",
    assetVersion: 17,
    ...PROFILE,
    physicalSizeCm: { ...spec.physicalSizeCm },
    renderClass: spec.renderClass,
    placementSurface: spec.placementSurface,
    directions: directionalVisuals(spec, assets),
    footprintLocalCm: spec.footprintLocalCm.map((point) => ({ ...point })),
    placementClearanceLocalCm: spec.placementClearanceLocalCm.map((point) => ({ ...point })),
    ...(spec.supportSurfaceLocalCm ? {
      supportSurfaceLocalCm: spec.supportSurfaceLocalCm.map((point) => ({ ...point }))
    } : {}),
    blocksMovement: spec.blocksMovement,
    supportsAvatarSeat: spec.supportsAvatarSeat,
    supportsChildItems: spec.supportsChildItems
  }
}

function createFurnitureItem(spec: PilotSpec): FurnitureItem {
  const assets = PILOT_ASSETS[spec.id]
  const visualContract = createContract(spec, assets)
  const renderSize = getRoomVNextCalibratedRenderSize({
    physicalWidthCm: spec.physicalSizeCm.width,
    physicalDepthCm: spec.physicalSizeCm.depth,
    physicalHeightCm: spec.physicalSizeCm.height,
    renderClass: spec.renderClass,
    bodyAlphaWidthRatio: spec.bodyAlphaWidthRatio,
    bodyAlphaHeightRatio: spec.bodyAlphaHeightRatio
  })
  const renderSizeByRotation = Object.fromEntries(
    DIRECTIONS.map((direction) => [direction, { ...renderSize }])
  ) as FurnitureItem["renderSizeByRotation"]
  const footprintByRotation = Object.fromEntries(
    DIRECTIONS.map((direction) => [direction, sceneFootprint(spec.footprintLocalCm, direction)])
  ) as NonNullable<FurnitureItem["footprintByRotation"]>
  const clearanceByRotation = Object.fromEntries(
    DIRECTIONS.map((direction) => [direction, sceneFootprint(spec.placementClearanceLocalCm, direction)])
  ) as NonNullable<FurnitureItem["placementFootprintByRotation"]>
  const surfaceSupports = spec.supportBounds ? [{
    surface: "tabletop" as const,
    localBounds: { ...spec.supportBounds },
    localBoundsByRotation: Object.fromEntries(
      DIRECTIONS.map((direction) => [direction, { ...spec.supportBounds }])
    ) as RoomFurnitureSurfaceSupport["localBoundsByRotation"]
  }] : undefined

  return {
    id: spec.id,
    name: spec.name,
    asset: assets.body.front,
    assetsByRotation: { ...assets.body },
    rotationPolicy: "directional_assets_required",
    thumbnail: assets.thumbnail,
    collectionId: "room-vnext-cohesion-pilot-v17-refined",
    homeTheme: "blumi-home-pastel-warm-v1",
    category: spec.category,
    sceneProjection: spec.renderClass,
    // Floor-plane assets must enter the floor pass. Keeping a rug in the
    // furniture pass lets it sort above tables/chairs despite its physical
    // support being the shell floor.
    layer: spec.renderClass === "floor_plane" ? "floor" : "furniture",
    placementSurface: spec.placementSurface,
    width: renderSize.width,
    height: renderSize.height,
    renderSizeByRotation,
    anchor: { ...spec.floorPivot },
    anchorByRotation: Object.fromEntries(
      DIRECTIONS.map((direction) => [direction, { ...spec.floorPivot }])
    ) as FurnitureItem["anchorByRotation"],
    footprint: footprintByRotation.front!,
    footprintByRotation,
    placementFootprint: clearanceByRotation.front!,
    placementFootprintByRotation: clearanceByRotation,
    blocksMovement: spec.blocksMovement,
    interactionType: spec.interactionType,
    ...(spec.seatSpec ? { seatSpec: spec.seatSpec, seatPoints: spec.seatSpec.seatPoints } : {}),
    surfaceSupports,
    sourceStatus: "candidate",
    qaStatus: "pending",
    ownedByDefault: false,
    locked: true,
    visualContract
  }
}

export const ROOM_VNEXT_PILOT_FURNITURE_CATALOG: readonly FurnitureItem[] =
  Object.freeze(PILOT_SPECS.map(createFurnitureItem))
