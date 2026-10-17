/**
 * Pure rules that keep MiniRoom avatar motion off the layout system
 * (ROOM-06, ROOM-15). Functions marked 'worklet' run on the UI thread; they
 * are plain functions under node:test.
 */

/**
 * The anchor's offset inside the room for a live room position (0..1). It is
 * a transform, so a walking frame never triggers layout.
 */
export function resolveMiniRoomAvatarAnchorOffset(
  point: { x: number; y: number },
  stage: { width: number; height: number }
): { translateX: number; translateY: number } {
  "worklet"
  return { translateX: point.x * stage.width, translateY: point.y * stage.height }
}

export interface MiniRoomCameraFrame {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Transform that shows the room laid out at `rest` inside `target` (same
 * aspect ratio): translate the centre, then scale about it. The room keeps
 * one layout while the keyboard opens, so its content never re-lays out.
 */
export function resolveMiniRoomCameraTransform(
  rest: MiniRoomCameraFrame,
  target: MiniRoomCameraFrame
): { translateX: number; translateY: number; scale: number } {
  "worklet"
  if (!(rest.width > 0)) return { translateX: 0, translateY: 0, scale: 1 }
  return {
    translateX: target.left + target.width / 2 - (rest.left + rest.width / 2),
    translateY: target.top + target.height / 2 - (rest.top + rest.height / 2),
    scale: target.width / rest.width
  }
}

/** The speech stack's resting height above the anchor box's bottom, sized for the old avatarV2 box. */
export const MINI_ROOM_SPEECH_BOTTOM_PX = 130
/** A stack lifted over the partner's when the two chibis stand close sits this much higher. */
export const MINI_ROOM_SPEECH_RAISE_PX = 38
/** Clear air between the top of the drawn head (hair included) and the bubble's tail. */
const MINI_ROOM_SPEECH_HEAD_GAP_PX = 8

/**
 * Where a speech bubble (or the typing dots) sits, up from the anchor box's bottom. A calibrated 2.5D figure is
 * shorter than the old fixed box, so the line sits just above her head instead of floating far over it; without
 * a measured figure the old height stays. Never higher than the old height.
 */
export function resolveMiniRoomSpeechBottomPx(input: {
  /** Room point (her soles), up from the anchor box's bottom. */
  footFromBottomPx: number
  /** The calibrated 2.5D figure's standing height on this stage; absent = not measured. */
  figureHeightPx?: number
  raised: boolean
}): number {
  const { footFromBottomPx, figureHeightPx, raised } = input
  const resting = figureHeightPx !== undefined && figureHeightPx > 0
    ? Math.min(MINI_ROOM_SPEECH_BOTTOM_PX, Math.round(footFromBottomPx + figureHeightPx + MINI_ROOM_SPEECH_HEAD_GAP_PX))
    : MINI_ROOM_SPEECH_BOTTOM_PX
  return raised ? resting + MINI_ROOM_SPEECH_RAISE_PX : resting
}
