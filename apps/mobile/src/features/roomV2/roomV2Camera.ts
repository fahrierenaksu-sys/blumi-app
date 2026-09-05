import type { RoomShellMyRoomCamera } from "./roomV2.types"

export interface ResolvedRoomV2MyRoomCamera {
  compactRendererWidth: NonNullable<RoomShellMyRoomCamera["compactRendererWidth"]>
  regularRendererWidth: NonNullable<RoomShellMyRoomCamera["regularRendererWidth"]>
  rendererTranslateY: number
  compactStageHeightRatio: number
  wideStageHeightRatio: number
  compactMinStageHeight: number
  wideMinStageHeight: number
  compactMaxStageHeight: number
  wideMaxStageHeight: number
}

// Every production shell and blocked shell preview shares this viewport
// contract. Keeping one source prevents an older shell definition from
// restoring the cropped My Room presentation after a refactor.
export const ROOM_V2_APPROVED_MY_ROOM_CAMERA: ResolvedRoomV2MyRoomCamera = {
  compactRendererWidth: "155%",
  regularRendererWidth: "154%",
  rendererTranslateY: 0,
  compactStageHeightRatio: 0.64,
  wideStageHeightRatio: 0.64,
  compactMinStageHeight: 430,
  wideMinStageHeight: 440,
  compactMaxStageHeight: 680,
  wideMaxStageHeight: 560
}

export function resolveRoomV2MyRoomCamera(
  _camera: RoomShellMyRoomCamera | undefined
): ResolvedRoomV2MyRoomCamera {
  // Shell art may vary, but the live My Room viewport is a product-level
  // contract. Never let historical or draft shell metadata restore an older
  // zoom, crop, vertical offset, or short stage.
  return { ...ROOM_V2_APPROVED_MY_ROOM_CAMERA }
}

export function resolveRoomV2StageHeight(
  viewportHeight: number,
  usesWideWindow: boolean,
  camera: ResolvedRoomV2MyRoomCamera
): number {
  const stageHeightRatio = usesWideWindow
    ? camera.wideStageHeightRatio
    : camera.compactStageHeightRatio
  const minStageHeight = usesWideWindow
    ? camera.wideMinStageHeight
    : camera.compactMinStageHeight
  const maxStageHeight = usesWideWindow
    ? camera.wideMaxStageHeight
    : camera.compactMaxStageHeight

  return Math.max(
    minStageHeight,
    Math.min(maxStageHeight, Math.round(viewportHeight * stageHeightRatio))
  )
}
