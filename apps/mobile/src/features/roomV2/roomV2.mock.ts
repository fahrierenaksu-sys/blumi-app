import { roomV2ProductionAssets as roomV2Assets } from "./roomV2ProductionAssets"
import { ROOM_V2_APPROVED_MY_ROOM_CAMERA } from "./roomV2Camera"
import type {
  FurnitureItem,
  RoomV2AssetRef,
  RoomFurnitureVisualContract,
  RoomShell,
  UserRoomDecor
} from "./roomV2.types"

function createModeledStarterBedVisualContract(): RoomFurnitureVisualContract {
  // V29 is exported on the locked 1254x714 shell-sized canvas. These values
  // preserve that camera while making the 343px-wide authored bed read at its
  // intended avatar-relative scale in the mobile room viewport.
  const renderSize = { width: 1.42, height: 1.42 }
  // The v29 body and contact-shadow alpha both end at roughly 60% of the
  // shared 1254x714 canvas. Anchor to that real contact edge so the authored
  // bed sits on the shell floor instead of floating above it.
  const floorPivot = { x: 0.5, y: 0.6 }
  const direction = (
    bodyAsset: RoomV2AssetRef,
    contactShadowAsset: RoomV2AssetRef
  ) => ({
    bodyAsset,
    contactShadowAsset,
    thumbnailAsset: roomV2Assets.furniture.modeledPinkCloudBedThumbnailV29,
    normalizedRenderSize: { ...renderSize },
    normalizedFloorPivot: { ...floorPivot }
  })

  return {
    schemaVersion: "room-furniture-visual-vnext-1",
    skuId: "room_v2_cozy_bed",
    assetSetId: "pink-cloud-bed-authored-gold-v29",
    assetVersion: 29,
    perspectiveProfile: "my-room-locked-2.5d-v1",
    viewportProfile: "ROOM_V2_APPROVED_MY_ROOM_CAMERA",
    assetCameraRigId: "blumi-room-camera-rig-v1",
    cameraRigVersion: "current-shell-v2.accepted-v1",
    lightRigVersion: "blumi-room-light-rig-v1",
    materialLibraryVersion: "pink-cloud-bed-authored-v29",
    physicalSizeCm: { width: 165, depth: 210, height: 105 },
    renderClass: "upright",
    placementSurface: "floor",
    directions: {
      front: direction(
        roomV2Assets.furniture.modeledPinkCloudBedFrontV29,
        roomV2Assets.furniture.modeledPinkCloudBedFrontShadowV29
      ),
      right: direction(
        roomV2Assets.furniture.modeledPinkCloudBedRightV29,
        roomV2Assets.furniture.modeledPinkCloudBedRightShadowV29
      ),
      back: direction(
        roomV2Assets.furniture.modeledPinkCloudBedBackV29,
        roomV2Assets.furniture.modeledPinkCloudBedBackShadowV29
      ),
      left: direction(
        roomV2Assets.furniture.modeledPinkCloudBedLeftV29,
        roomV2Assets.furniture.modeledPinkCloudBedLeftShadowV29
      )
    },
    footprintLocalCm: [
      { x: -82.5, y: -105 },
      { x: 82.5, y: -105 },
      { x: 82.5, y: 105 },
      { x: -82.5, y: 105 }
    ],
    placementClearanceLocalCm: [
      { x: -86, y: -109 },
      { x: 86, y: -109 },
      { x: 86, y: 109 },
      { x: -86, y: 109 }
    ],
    blocksMovement: true,
    supportsAvatarSeat: true,
    supportsChildItems: false
  }
}

export const DEFAULT_ROOM_V2_SHELL_ID =
  "room_v2_shell_blumi_world_v1"

const BASE_ROOM_V2_SHELL_CATALOG: RoomShell[] = [
  {
    id: DEFAULT_ROOM_V2_SHELL_ID,
    name: "Blumi Home",
    asset: roomV2Assets.shells.blumiWorldShellV1,
    canvasSize: { width: 1254, height: 714 },
    myRoomCamera: { ...ROOM_V2_APPROVED_MY_ROOM_CAMERA },
    miniRoomCamera: {
      rendererWidth: "176%",
      rendererTranslateY: -10,
      backgroundColor: "#F8ECF2"
    },
    // Rectangular bounds stay useful for edit placement and lane snapping.
    placeableArea: {
      minX: 0.22,
      maxX: 0.78,
      minY: 0.45,
      maxY: 0.88
    },
    surfacePlacementAreas: {
      // The calibrated wall band includes the full height of tall mirrors and
      // curtain panels while keeping the shell's floor and ceiling bands out
      // of the placement surface.
      wall: { minX: 0.18, maxX: 0.76, minY: 0.08, maxY: 0.56 },
      ceiling: { minX: 0.2, maxX: 0.8, minY: 0.04, maxY: 0.18 }
    },
    surfacePlacementExclusions: {
      // The baked arched window is part of the shell and cannot accept a
      // clock, artwork, mirror, or other wall-mounted prop.
      wall: [{ minX: 0.33, maxX: 0.43, minY: 0.2, maxY: 0.46 }]
    },
    walkablePolygon: [
      { x: 0.48, y: 0.42 },
      { x: 0.8, y: 0.55 },
      { x: 0.83, y: 0.72 },
      { x: 0.7, y: 0.9 },
      { x: 0.3, y: 0.9 },
      { x: 0.17, y: 0.72 },
      { x: 0.2, y: 0.55 }
    ],
    placementLanes: [
      {
        id: "room_v2_world_lane_wall",
        label: "Wall line",
        y: 0.54,
        minX: 0.26,
        maxX: 0.74,
        snapRadius: 0.035
      },
      {
        id: "room_v2_world_lane_mid",
        label: "Middle",
        y: 0.66,
        minX: 0.24,
        maxX: 0.76,
        snapRadius: 0.045
      },
      {
        id: "room_v2_world_lane_social",
        label: "Social",
        y: 0.76,
        minX: 0.25,
        maxX: 0.75,
        snapRadius: 0.045
      },
      {
        id: "room_v2_world_lane_front",
        label: "Front",
        y: 0.86,
        minX: 0.28,
        maxX: 0.72,
        snapRadius: 0.04
      }
    ]
  }
]

// Runtime deliberately exposes only the approved Blumi Home shell. Candidate
// generation and promotion validation stay offline until immutable visual,
// geometry, Simulator, and independent-review evidence is complete.
export const ROOM_V2_SHELL_CATALOG: RoomShell[] = BASE_ROOM_V2_SHELL_CATALOG

const LEGACY_ROOM_V2_FURNITURE_CATALOG: FurnitureItem[] = [
  {
    id: "room_v2_chair_blush",
    name: "Blush Lounge Chair",
    asset: roomV2Assets.furniture.blumiWorldChairV1,
    category: "seating",
    layer: "furniture",
    width: 0.126,
    height: 0.244,
    footprint: { width: 0.109, height: 0.067 },
    blocksMovement: true,
    interactionType: "seat",
    frontOcclusionByRotation: {
      front: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
      back: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
      left: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
      right: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 }
    },
    seatPoints: [
      {
        id: "front_edge",
        x: 0,
        y: -0.2,
        facing: "front"
      }
    ],
    seatSpec: {
      capacity: 1,
      seatPoints: [
        {
          id: "front_edge",
          x: 0,
          y: -0.2,
          facing: "front",
          approachPoint: { x: 0, y: 0.22 },
          exitPoint: { x: 0, y: 0.28 },
          seatHeight: 0.096
        }
      ]
    },
    locked: true
  },
  {
    id: "room_v2_table_round",
    name: "Cozy Round Table",
    asset: roomV2Assets.furniture.blumiWorldTableV1,
    category: "table",
    layer: "furniture",
    width: 0.126,
    height: 0.168,
    footprint: { width: 0.101, height: 0.067 },
    surfaceSupports: [{
      surface: "tabletop",
      localBounds: { minX: 0.12, maxX: 0.88, minY: 0.18, maxY: 0.28 }
    }],
    blocksMovement: true,
    interactionType: "decor",
    locked: true
  },
  {
    id: "room_v2_lamp_heart",
    name: "Heart Glow Lamp",
    asset: roomV2Assets.furniture.blumiWorldDecorV1,
    category: "lighting",
    layer: "furniture",
    width: 0.067,
    height: 0.235,
    interactionType: "decor",
    locked: true
  },
  {
    id: "room_v2_cozy_bed",
    name: "Pink Cloud Bed",
    asset: roomV2Assets.furniture.modeledPinkCloudBedFrontV29,
    assetsByRotation: {
      front: roomV2Assets.furniture.modeledPinkCloudBedFrontV29,
      right: roomV2Assets.furniture.modeledPinkCloudBedRightV29,
      back: roomV2Assets.furniture.modeledPinkCloudBedBackV29,
      left: roomV2Assets.furniture.modeledPinkCloudBedLeftV29
    },
    visualContract: createModeledStarterBedVisualContract(),
    rotationPolicy: "directional_assets_required",
    category: "seating",
    layer: "furniture",
    // The bed is a floor-plane prop in the locked My Room camera. Its
    // authored sprite canvas must map to the same diagonal floor plane as the
    // shell instead of being treated like an upright catalog cutout.
    sceneProjection: "floor_plane",
    width: 0.294,
    height: 0.294,
    renderSizeByRotation: {
      front: { width: 0.294, height: 0.196 },
      right: { width: 0.294, height: 0.196 },
      back: { width: 0.294, height: 0.196 },
      left: { width: 0.294, height: 0.196 }
    },
    anchor: { x: 0.5, y: 1 },
    anchorByRotation: {
      front: { x: 0.5, y: 1 },
      right: { x: 0.5, y: 1 },
      back: { x: 0.5, y: 1 },
      left: { x: 0.5, y: 1 }
    },
    footprint: { width: 0.252, height: 0.168 },
    footprintByRotation: {
      front: { width: 0.252, height: 0.168 },
      back: { width: 0.252, height: 0.168 },
      left: { width: 0.168, height: 0.252 },
      right: { width: 0.168, height: 0.252 }
    },
    placementFootprint: { width: 0.13, height: 0.065 },
    placementFootprintByRotation: {
      front: { width: 0.13, height: 0.065 },
      back: { width: 0.13, height: 0.065 },
      left: { width: 0.065, height: 0.13 },
      right: { width: 0.065, height: 0.13 }
    },
    blocksMovement: true,
    interactionType: "seat",
    seatPoints: [
      {
        id: "left_edge",
        x: -0.18,
        y: -0.36,
        facing: "left"
      }
    ],
    seatSpec: {
      capacity: 1,
      seatPoints: [
        {
          id: "left_edge",
          x: -0.18,
          y: -0.36,
          facing: "left",
          approachPoint: { x: -0.18, y: 0.36 },
          exitPoint: { x: -0.18, y: 0.44 },
          seatHeight: 0.08
        }
      ]
    },
    ownedByDefault: true
  },
  {
    id: "room_v2_cute_bookshelf",
    name: "Cozy Bookshelf",
    asset: roomV2Assets.furniture.blumiBookshelfV1,
    category: "wallDecor",
    layer: "wall",
    width: 0.168,
    height: 0.252,
    anchor: { x: 0.5, y: 0.88 },
    placementSurface: "wall",
    blocksMovement: false,
    interactionType: "decor",
    locked: true
  },
  {
    id: "room_v2_heart_rug",
    name: "Heart Cloud Rug",
    asset: roomV2Assets.furniture.blumiHeartRugV1,
    category: "rug",
    layer: "floor",
    width: 0.21,
    height: 0.126,
    anchor: { x: 0.5, y: 0.75 },
    blocksMovement: false,
    interactionType: "decor",
    locked: true
  },
  {
    id: "room_v2_side_table",
    name: "Petal Side Table",
    asset: roomV2Assets.furniture.blumiSideTableV1,
    category: "table",
    layer: "furniture",
    width: 0.126,
    height: 0.151,
    anchor: { x: 0.5, y: 0.85 },
    footprint: { width: 0.101, height: 0.067 },
    surfaceSupports: [{
      surface: "tabletop",
      localBounds: { minX: 0.12, maxX: 0.88, minY: 0.18, maxY: 0.28 }
    }],
    blocksMovement: true,
    interactionType: "decor",
    locked: true
  }
]

export const ROOM_V2_FURNITURE_CATALOG: FurnitureItem[] =
  LEGACY_ROOM_V2_FURNITURE_CATALOG

export const MOCK_USER_ROOM_V2_DECOR: UserRoomDecor = {
  roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
  placedItems: [
    {
      instanceId: "room_v2_placed_lamp_01",
      itemId: "room_v2_lamp_heart",
      x: 0.76,
      y: 0.66,
      rotation: "front"
    },
    {
      instanceId: "room_v2_placed_chair_01",
      itemId: "room_v2_chair_blush",
      x: 0.58,
      y: 0.86,
      rotation: "front"
    },
    {
      instanceId: "room_v2_placed_table_01",
      itemId: "room_v2_table_round",
      x: 0.42,
      y: 0.74,
      rotation: "front"
    },
    {
      instanceId: "room_v2_placed_rug_01",
      itemId: "room_v2_heart_rug",
      x: 0.75,
      y: 0.60,
      rotation: "front"
    }
  ]
}
