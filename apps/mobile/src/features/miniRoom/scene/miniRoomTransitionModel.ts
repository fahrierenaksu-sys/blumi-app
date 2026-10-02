import { resolveMiniRoomCameraTransform, type MiniRoomCameraFrame } from "./miniRoomAvatarStageModel"
import type { MiniRoomLayout } from "./miniRoomLayout"
import { MINI_ROOM_DOCK_STEP_MS } from "./miniRoomReducedMotion"

/** One numeric pose: every edge and the room share the same animation clock. */
export type MiniRoomTransitionFrame = {
  progress: number
  bottom: number
  height: number
  margin: number
  cameraX: number
  cameraY: number
  cameraScale: number
}

export function resolveMiniRoomTransitionTarget(rest: MiniRoomCameraFrame, layout: MiniRoomLayout): MiniRoomTransitionFrame {
  const camera = resolveMiniRoomCameraTransform(rest, layout.camera)
  return {
    progress: layout.panelMode === "typing" ? 1 : 0,
    bottom: layout.panelBottom, height: layout.panelHeight, margin: layout.panelMargin,
    cameraX: camera.translateX, cameraY: camera.translateY, cameraScale: camera.scale
  }
}

/** Each text layer keeps its settled width while the enclosing paper morphs.
 * Otherwise wrapped rows remeasure mid-transition and can restart its clock.
 */
export function resolveMiniRoomTextWidths(windowWidth: number): {
  history: number; recent: number; historyComposer: number; typingComposer: number
} {
  return { history: Math.max(0, windowWidth - 58), recent: Math.max(0, windowWidth - 34),
    historyComposer: Math.max(0, windowWidth - 46), typingComposer: Math.max(0, windowWidth - 28) }
}

/** A late text measurement must not undo touch-down's pending keyboard intent. */
export function shouldDeferMiniRoomLayout(input: {
  intent: "history" | "typing" | null; actual: "history" | "typing"; accessibilityChanged: boolean
}): boolean {
  return input.intent !== null && input.intent !== input.actual && !input.accessibilityChanged
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

/** Lift the persistent composer ahead of the rising keyboard, then settle softly.
 * The whole pose uses this clock so the dock never catches the room floor.
 */
export function resolveMiniRoomOpeningProgress(time: number): number {
  "worklet"
  const t = Math.min(1, Math.max(0, time))
  return 1 - (1 - t) ** 4
}

/** Selected CSS ease curve, solved directly so every callable stays UI-safe. */
export function resolveMiniRoomSettlingProgress(time: number): number {
  "worklet"
  const t = Math.min(1, Math.max(0, time))
  if (t === 0 || t === 1) return t
  let u = t
  for (let i = 0; i < 6; i++) {
    const x = u ** 3 - 0.75 * u ** 2 + 0.75 * u
    const slope = 3 * u ** 2 - 1.5 * u + 0.75
    u = Math.min(1, Math.max(0, u - (x - t) / slope))
  }
  return Math.min(1, Math.max(0, 0.3 * u + 2.4 * u ** 2 - 1.7 * u ** 3))
}

/** Keyboard edge leads; room and dock top settle together. Short-lived panel
 * compression gives the input room without letting the dock cross the floor.
 * Reversals start from the actual visible pose, rather than either endpoint.
 */
export function resolveMiniRoomMorphFrame(
  from: MiniRoomTransitionFrame, to: MiniRoomTransitionFrame,
  roomProgress: number, keyboardProgress: number, composerClearance: number
): MiniRoomTransitionFrame {
  "worklet"
  const k = Math.min(1, Math.max(0, keyboardProgress))
  let p = Math.min(1, Math.max(0, roomProgress))
  const bottom = from.bottom + (to.bottom - from.bottom) * k
  const startTop = from.bottom + from.height
  const topTravel = to.bottom + to.height - startTop
  const minimumHeight = Math.min(composerClearance, from.height, to.height)
  if (topTravel > 0) {
    p = Math.max(p, Math.min(1, Math.max(0, (bottom + minimumHeight - startTop) / topTravel)))
  }
  return {
    progress: from.progress + (to.progress - from.progress) * p,
    bottom, height: startTop + topTravel * p - bottom,
    margin: from.margin + (to.margin - from.margin) * p,
    cameraX: from.cameraX + (to.cameraX - from.cameraX) * p,
    cameraY: from.cameraY + (to.cameraY - from.cameraY) * p,
    cameraScale: from.cameraScale + (to.cameraScale - from.cameraScale) * p
  }
}

export function resolveMiniRoomTransitionDuration(input: {
  keyboardChanged: boolean; keyboardDurationMs: number; reduceMotion: boolean; opening?: boolean
}): number {
  if (input.reduceMotion) return 0
  if (!input.keyboardChanged) return MINI_ROOM_DOCK_STEP_MS
  const duration = Number.isFinite(input.keyboardDurationMs) && input.keyboardDurationMs > 0
    ? input.keyboardDurationMs : 280
  // The notification reaches JS after UIKit has started rising. Catch up on
  // opening so the input clears the keys; keep the full soft closing duration.
  return input.opening ? Math.min(duration, 200) : duration
}
