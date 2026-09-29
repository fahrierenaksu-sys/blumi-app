import { roomV2Assets } from "./roomV2Assets"
import { ROOM_VNEXT_PILOT_FURNITURE_CATALOG } from "./roomVNextPilotFurniture"
import { ROOM_V2_FURNITURE_CATALOG } from "./roomV2Catalog"
import {
  resolveApprovedRoomV3UniversalCoreFurniture,
  type RoomV3UniversalCorePromotionRecord,
  type RoomV3UniversalCorePromotionTrust
} from "./roomV3UniversalCorePromotion"
import {
  resolveApprovedRoomVNextFullWaveFurniture,
  type RoomVNextFullWavePromotionRecord,
  type RoomVNextFullWavePromotionTrust
} from "./roomVNextFullWavePromotion"
import type {
  FurnitureItem,
  RoomFurnitureVisualContract
} from "./roomV2.types"

/**
 * Historical mechanics-only QA catalog.
 *
 * This module must never be imported from the production mobile entry graph.
 * It preserves old test/evidence reproducibility while R0 keeps rejected
 * candidate imagery out of Metro and out of user rooms.
 */
export const ROOM_VNEXT_PINK_CLOUD_BED_CONTRACT: RoomFurnitureVisualContract = {
  schemaVersion: "room-furniture-visual-vnext-1",
  skuId: "room_v2_cozy_bed",
  assetSetId: "pink-cloud-bed-v0.12",
  assetVersion: 12,
  perspectiveProfile: "my-room-locked-2.5d-v1",
  viewportProfile: "ROOM_V2_APPROVED_MY_ROOM_CAMERA",
  assetCameraRigId: "blumi-room-camera-rig-v1",
  cameraRigVersion: "calibration-candidate-v2",
  lightRigVersion: "blumi-room-light-rig-v1",
  materialLibraryVersion: "blumi-room-materials-v1",
  physicalSizeCm: { width: 165, depth: 210, height: 140 },
  renderClass: "upright",
  placementSurface: "floor",
  directions: {
    front: {
      bodyAsset: roomV2Assets.furniture.roomVNextPinkCloudBedFrontV0_12,
      contactShadowAsset: roomV2Assets.furniture.roomVNextPinkCloudBedFrontShadowV0_12,
      thumbnailAsset: roomV2Assets.furniture.roomVNextPinkCloudBedFrontThumbnailV0_12,
      normalizedRenderSize: { width: 0.294, height: 0.294 },
      normalizedFloorPivot: { x: 0.5027322404371585, y: 0.6857923497267759 }
    },
    right: {
      bodyAsset: roomV2Assets.furniture.roomVNextPinkCloudBedRightV0_12,
      contactShadowAsset: roomV2Assets.furniture.roomVNextPinkCloudBedRightShadowV0_12,
      thumbnailAsset: roomV2Assets.furniture.roomVNextPinkCloudBedRightThumbnailV0_12,
      normalizedRenderSize: { width: 0.294, height: 0.294 },
      normalizedFloorPivot: { x: 0.5027322404371585, y: 0.6857923497267759 }
    },
    back: {
      bodyAsset: roomV2Assets.furniture.roomVNextPinkCloudBedBackV0_12,
      contactShadowAsset: roomV2Assets.furniture.roomVNextPinkCloudBedBackShadowV0_12,
      thumbnailAsset: roomV2Assets.furniture.roomVNextPinkCloudBedBackThumbnailV0_12,
      normalizedRenderSize: { width: 0.294, height: 0.294 },
      normalizedFloorPivot: { x: 0.5027322404371585, y: 0.6857923497267759 }
    },
    left: {
      bodyAsset: roomV2Assets.furniture.roomVNextPinkCloudBedLeftV0_12,
      contactShadowAsset: roomV2Assets.furniture.roomVNextPinkCloudBedLeftShadowV0_12,
      thumbnailAsset: roomV2Assets.furniture.roomVNextPinkCloudBedLeftThumbnailV0_12,
      normalizedRenderSize: { width: 0.294, height: 0.294 },
      normalizedFloorPivot: { x: 0.5027322404371585, y: 0.6857923497267759 }
    }
  },
  footprintLocalCm: [
    { x: -82.5, y: -105 },
    { x: 82.5, y: -105 },
    { x: 82.5, y: 105 },
    { x: -82.5, y: 105 }
  ],
  placementClearanceLocalCm: [
    { x: -90, y: -115 },
    { x: 90, y: -115 },
    { x: 90, y: 115 },
    { x: -90, y: 115 }
  ],
  blocksMovement: true,
  supportsAvatarSeat: false,
  supportsChildItems: false
}

export function resolveHistoricalRoomV2QaFurnitureCatalog(
  promotionRecords: readonly RoomV3UniversalCorePromotionRecord[] = [],
  trust: RoomV3UniversalCorePromotionTrust | null = null,
  fullWavePromotionRecords: readonly RoomVNextFullWavePromotionRecord[] = [],
  fullWaveTrust: RoomVNextFullWavePromotionTrust | null = null
): FurnitureItem[] {
  return [
    ...ROOM_V2_FURNITURE_CATALOG,
    ...promotionRecords.flatMap((record) =>
      resolveApprovedRoomV3UniversalCoreFurniture(record, trust)
    ),
    ...fullWavePromotionRecords.flatMap((record) =>
      resolveApprovedRoomVNextFullWaveFurniture(record, fullWaveTrust)
    )
  ]
}

export const ROOM_VNEXT_CANDIDATE_FURNITURE_CATALOG: readonly FurnitureItem[] =
  Object.freeze([
    ...ROOM_V2_FURNITURE_CATALOG
      .filter((item) => item.id === "room_v2_cozy_bed")
      .map((item) => ({ ...item, visualContract: ROOM_VNEXT_PINK_CLOUD_BED_CONTRACT })),
    ...ROOM_VNEXT_PILOT_FURNITURE_CATALOG
  ])
