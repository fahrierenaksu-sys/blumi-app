import { resolveMiniRoomCameraTransform, type MiniRoomCameraFrame } from "./miniRoomAvatarStageModel"
import { resolveMiniRoomLayout, resolveMiniRoomRestCamera, type MiniRoomLayout, type MiniRoomLayoutInput } from "./miniRoomLayout"

/**
 * One MiniRoom pose: the room camera and the chat paper. The scene has two
 * resting poses (keyboard closed / open) and every visible frame is the mix
 * of the two at the keyboard's own progress, so the room, the paper and the
 * composer can never run on different clocks. Functions marked 'worklet' run
 * on the UI thread every frame; they are plain functions under node:test.
 */
export type MiniRoomTransitionFrame = {
  /** 0 closed → 1 open: what the paper's shape and content fades follow. */
  progress: number
  /** Paper bottom edge above the window bottom (points). */
  bottom: number
  /** Paper height (points). */
  height: number
  /** Paper side margin (points). */
  margin: number
  cameraX: number
  cameraY: number
  cameraScale: number
  /** The closed paper's height: the history transcript stays pinned to it. */
  restHeight: number
  /** Width of the room canvas at rest (points); the follow camera's travel. */
  roomWidth: number
}

/** Everything the pose depends on except the keyboard (that is `progress`). */
export type MiniRoomPoseInput = Omit<MiniRoomLayoutInput, "keyboardVisible" | "keyboardInset">

export interface MiniRoomPoseEndpoints {
  closed: MiniRoomTransitionFrame
  open: MiniRoomTransitionFrame
}

export function resolveMiniRoomTransitionTarget(
  rest: MiniRoomCameraFrame, layout: MiniRoomLayout, restHeight?: number
): MiniRoomTransitionFrame {
  "worklet"
  const camera = resolveMiniRoomCameraTransform(rest, layout.camera)
  return {
    progress: layout.panelMode === "typing" ? 1 : 0,
    bottom: layout.panelBottom, height: layout.panelHeight, margin: layout.panelMargin,
    cameraX: camera.translateX, cameraY: camera.translateY, cameraScale: camera.scale,
    restHeight: restHeight ?? layout.panelHeight, roomWidth: rest.width
  }
}

/**
 * The two resting poses for a keyboard of `keyboardHeight` points (0 where
 * the window itself resizes, Android). The room canvas keeps one layout; only
 * its transform differs.
 */
export function resolveMiniRoomPoseEndpoints(input: MiniRoomPoseInput, keyboardHeight: number): MiniRoomPoseEndpoints {
  "worklet"
  const closedInput = { ...input, keyboardVisible: false, keyboardInset: 0 }
  const rest = resolveMiniRoomRestCamera(closedInput)
  const closedLayout = resolveMiniRoomLayout(closedInput)
  const openLayout = resolveMiniRoomLayout({
    ...input, keyboardVisible: true, keyboardInset: keyboardHeight > 0 ? keyboardHeight : 0
  })
  return {
    closed: resolveMiniRoomTransitionTarget(rest, closedLayout, closedLayout.panelHeight),
    open: resolveMiniRoomTransitionTarget(rest, openLayout, closedLayout.panelHeight)
  }
}

function mixFrame(from: MiniRoomTransitionFrame, to: MiniRoomTransitionFrame, t: number): MiniRoomTransitionFrame {
  "worklet"
  return {
    progress: from.progress + (to.progress - from.progress) * t,
    bottom: from.bottom + (to.bottom - from.bottom) * t,
    height: from.height + (to.height - from.height) * t,
    margin: from.margin + (to.margin - from.margin) * t,
    cameraX: from.cameraX + (to.cameraX - from.cameraX) * t,
    cameraY: from.cameraY + (to.cameraY - from.cameraY) * t,
    cameraScale: from.cameraScale + (to.cameraScale - from.cameraScale) * t,
    restHeight: from.restHeight + (to.restHeight - from.restHeight) * t,
    roomWidth: from.roomWidth + (to.roomWidth - from.roomWidth) * t
  }
}

/**
 * The visible pose at keyboard progress `progress` (0 closed, 1 open). It is
 * a straight mix, so it is continuous, monotonic and reverses from wherever
 * the keyboard is: the keyboard's own curve is the only easing. Both resting
 * poses keep the paper below the room floor and the composer above the
 * keyboard, and a mix of the two keeps both.
 */
export function resolveMiniRoomPose(endpoints: MiniRoomPoseEndpoints, progress: number): MiniRoomTransitionFrame {
  "worklet"
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  return mixFrame(endpoints.closed, endpoints.open, p)
}

const ZERO_FRAME: MiniRoomTransitionFrame = {
  progress: 0, bottom: 0, height: 0, margin: 0, cameraX: 0, cameraY: 0, cameraScale: 0, restHeight: 0, roomWidth: 0
}
export const MINI_ROOM_NO_POSE_OFFSET: MiniRoomPoseEndpoints = { closed: ZERO_FRAME, open: ZERO_FRAME }

function differenceFrame(a: MiniRoomTransitionFrame, b: MiniRoomTransitionFrame): MiniRoomTransitionFrame {
  "worklet"
  return {
    progress: 0,
    bottom: a.bottom - b.bottom, height: a.height - b.height, margin: a.margin - b.margin,
    cameraX: a.cameraX - b.cameraX, cameraY: a.cameraY - b.cameraY, cameraScale: a.cameraScale - b.cameraScale,
    // restHeight stays the laid-out value: the transcript is laid out at its
    // final size at once, and h − restHeight keeps it on the composer while
    // the paper settles around it.
    restHeight: 0, roomWidth: a.roomWidth - b.roomWidth
  }
}

/**
 * A change that is not the keyboard (a longer draft, a measured message, a
 * new font size) must not jump the pose: the offset from the old resting
 * poses to the new ones settles away with `weight` (1 → 0). It is a constant
 * offset, so it stays continuous while the keyboard moves at the same time.
 */
export function resolveMiniRoomPoseOffset(before: MiniRoomPoseEndpoints, after: MiniRoomPoseEndpoints): MiniRoomPoseEndpoints {
  "worklet"
  return { closed: differenceFrame(before.closed, after.closed), open: differenceFrame(before.open, after.open) }
}

export function applyMiniRoomPoseOffset(
  endpoints: MiniRoomPoseEndpoints, offset: MiniRoomPoseEndpoints, weight: number
): MiniRoomPoseEndpoints {
  "worklet"
  if (weight === 0) return endpoints
  return {
    closed: mixFrame(endpoints.closed, addFrame(endpoints.closed, offset.closed), weight),
    open: mixFrame(endpoints.open, addFrame(endpoints.open, offset.open), weight)
  }
}

function addFrame(a: MiniRoomTransitionFrame, b: MiniRoomTransitionFrame): MiniRoomTransitionFrame {
  "worklet"
  return {
    progress: a.progress,
    bottom: a.bottom + b.bottom, height: a.height + b.height, margin: a.margin + b.margin,
    cameraX: a.cameraX + b.cameraX, cameraY: a.cameraY + b.cameraY, cameraScale: a.cameraScale + b.cameraScale,
    restHeight: a.restHeight + b.restHeight, roomWidth: a.roomWidth + b.roomWidth
  }
}

/**
 * One keyboard frame (react-native-keyboard-controller: `height` in points,
 * `progress` = height / open height) → the scene's progress and the open
 * keyboard's height. A frame with no usable progress keeps the last height.
 */
export function resolveMiniRoomKeyboardFrame(
  event: { height: number; progress: number }, previousOpenHeight: number
): { progress: number; openHeight: number } {
  "worklet"
  const progress = Number.isFinite(event.progress) ? Math.min(1, Math.max(0, event.progress)) : 0
  const height = Number.isFinite(event.height) ? Math.max(0, event.height) : 0
  const openHeight = progress > 0.01 && height > 0 ? height / progress : previousOpenHeight
  return { progress, openHeight }
}

/**
 * Follow camera. The room is wider than the phone, so a walk target near a
 * side edge could leave the avatar half out of frame. Only then the room
 * pans, just far enough to bring the target back inside the safe frame (a
 * side margin of MINI_ROOM_FOLLOW_MARGIN of the window), never past the
 * room's own edges. Inside the safe frame nothing moves: a tap never zooms.
 */
export const MINI_ROOM_FOLLOW_MARGIN = 0.16

export function resolveMiniRoomFollowSlack(frame: MiniRoomTransitionFrame, windowWidth: number): number {
  "worklet"
  return Math.max(0, (frame.roomWidth * frame.cameraScale - windowWidth) / 2)
}

export function clampMiniRoomFollow(follow: number, frame: MiniRoomTransitionFrame, windowWidth: number): number {
  "worklet"
  const slack = resolveMiniRoomFollowSlack(frame, windowWidth)
  return Math.min(slack, Math.max(-slack, follow))
}

/** The pan that keeps room point `pointX` (0..1) inside the safe frame of `frame`. */
export function resolveMiniRoomFollowTarget(input: {
  pointX: number
  frame: MiniRoomTransitionFrame
  windowWidth: number
  current: number
}): number {
  "worklet"
  const { frame, windowWidth } = input
  const current = clampMiniRoomFollow(input.current, frame, windowWidth)
  if (!Number.isFinite(input.pointX)) return current
  const pointX = Math.min(1, Math.max(0, input.pointX))
  const screenX = windowWidth / 2 + frame.cameraX + current + (pointX - 0.5) * frame.roomWidth * frame.cameraScale
  const margin = windowWidth * MINI_ROOM_FOLLOW_MARGIN
  let next = current
  if (screenX < margin) next = current + (margin - screenX)
  else if (screenX > windowWidth - margin) next = current - (screenX - (windowWidth - margin))
  next = clampMiniRoomFollow(next, frame, windowWidth)
  // Sub-point corrections are not worth a camera move.
  return Math.abs(next - current) < 0.5 ? current : next
}

/** Each text layer keeps its settled width while the enclosing paper morphs.
 * Otherwise wrapped rows remeasure mid-transition.
 */
export function resolveMiniRoomTextWidths(windowWidth: number): {
  history: number; recent: number; historyComposer: number; typingComposer: number
} {
  return { history: Math.max(0, windowWidth - 58), recent: Math.max(0, windowWidth - 34),
    historyComposer: Math.max(0, windowWidth - 46), typingComposer: Math.max(0, windowWidth - 28) }
}

/** Fade the two contents through a quiet midpoint; never layer readable text. */
export function resolveMiniRoomContentOpacity(progress: number): { history: number; recent: number; context: number } {
  "worklet"
  const p = Math.min(1, Math.max(0, progress))
  return {
    history: Math.max(0, 1 - p / 0.55),
    recent: Math.max(0, (p - 0.55) / (1 - 0.55)),
    context: Math.max(0, 1 - p / 0.3)
  }
}

/**
 * The history ↔ recent handoff: while a text layer is not fully shown it
 * drifts a few points off its rest (history settles down as it leaves, the
 * recent strip rises into place), so the switch reads as one motion. A shown
 * layer sits exactly at rest; Reduce Motion keeps both still (only the fade).
 */
export function resolveMiniRoomContentDrift(progress: number, reduceMotion: boolean): { history: number; recent: number } {
  "worklet"
  if (reduceMotion) return { history: 0, recent: 0 }
  const opacity = resolveMiniRoomContentOpacity(progress)
  return { history: 6 * (1 - opacity.history), recent: 4 * (1 - opacity.recent) }
}

/** Height of the paper's rounded top and bottom caps (the resting corner radius). */
export const MINI_ROOM_PAPER_CAP = 26
/** The resting paper's side margin (miniRoomLayout `panelMargin`, closed). */
export const MINI_ROOM_PAPER_REST_MARGIN = 13
/** Layout height of the paper's straight middle; it is stretched by scaleY. */
export const MINI_ROOM_PAPER_BODY_UNIT = 100

/**
 * The paper drawn with transforms only (no width/height/top/left animation):
 * a rounded top cap, a straight middle stretched by scaleY and a bottom cap,
 * all scaled to the paper's width. Each cap has a resting (rounded) shape
 * and an open shape that fades in over it; the resting corner lies inside
 * the open one, so their union is always one solid sheet. `up` values are
 * distances above the window bottom.
 */
export function resolveMiniRoomPaperGeometry(frame: MiniRoomTransitionFrame, windowWidth: number): {
  topCapUp: number; bodyUp: number; bodyScaleY: number; bottomCapUp: number
  restScaleX: number; fullScaleX: number; openOpacity: number
  shadowUp: number; shadowScaleX: number; shadowScaleY: number
} {
  "worklet"
  const width = Math.max(0, windowWidth - 2 * frame.margin)
  const restWidth = Math.max(1, windowWidth - 2 * MINI_ROOM_PAPER_REST_MARGIN)
  const cap = MINI_ROOM_PAPER_CAP
  const inset = MINI_ROOM_PAPER_SHADOW_INSET
  // One point of overlap on each side of the middle hides hairline seams.
  const bodyHeight = Math.max(0, frame.height - 2 * cap + 2)
  return {
    topCapUp: frame.bottom + frame.height - cap,
    bodyUp: frame.bottom + cap - 1,
    bodyScaleY: bodyHeight / MINI_ROOM_PAPER_BODY_UNIT,
    bottomCapUp: frame.bottom,
    restScaleX: width / restWidth,
    fullScaleX: windowWidth > 0 ? width / windowWidth : 1,
    openOpacity: Math.min(1, Math.max(0, frame.progress)),
    // The shadow caster sits under the sheet, inset so its square corners
    // stay hidden inside the rounded ones; only its soft shadow shows.
    shadowUp: frame.bottom + inset,
    shadowScaleX: windowWidth > 0 ? Math.max(0, width - 2 * inset) / windowWidth : 1,
    shadowScaleY: Math.max(0, frame.height - 2 * inset) / MINI_ROOM_PAPER_SHADOW_UNIT
  }
}

/** Layout height of the shadow caster (stretched by scaleY like the middle). */
export const MINI_ROOM_PAPER_SHADOW_UNIT = 200
const MINI_ROOM_PAPER_SHADOW_INSET = 10
