import { ROOM_V2_APPROVED_MY_ROOM_CAMERA } from "../../roomV2/roomV2Camera"

export interface MiniRoomPresentationInput {
  viewportWidth: number
  viewportHeight: number
  keyboardVisible: boolean
}

export interface MiniRoomPresentation {
  cameraWidthPercent: number
  cameraTop: number
  chromeHorizontalInset: number
  chromeGap: number
  composerHorizontalInset: number
  composerVerticalInset: number
}

/**
 * Keeps the shared room camera stable across supported phone sizes while the
 * keyboard compresses the camera and chrome. The camera remains tied to the room
 * world so furniture, hotspots, and avatars share one projection.
 */
export function resolveMiniRoomPresentation(
  input: MiniRoomPresentationInput
): MiniRoomPresentation {
  const compactWidth = input.viewportWidth < 375
  const compactHeight = input.viewportHeight < 760
  const myRoomCameraWidthPercent = Number.parseFloat(String(compactWidth
    ? ROOM_V2_APPROVED_MY_ROOM_CAMERA.compactRendererWidth
    : ROOM_V2_APPROVED_MY_ROOM_CAMERA.regularRendererWidth))

  return {
    cameraWidthPercent: input.keyboardVisible
      ? compactWidth ? 132 : 128
      : myRoomCameraWidthPercent,
    cameraTop: input.keyboardVisible
      ? compactHeight ? 100 : 135
      : compactHeight ? 200 : 235,
    chromeHorizontalInset: compactWidth ? 10 : 16,
    chromeGap: compactWidth ? 6 : 8,
    composerHorizontalInset: compactWidth ? 10 : 16,
    composerVerticalInset: input.keyboardVisible ? 8 : 14
  }
}
