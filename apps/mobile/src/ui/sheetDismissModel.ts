// Pure swipe-down-to-dismiss rules shared by every bottom sheet
// (ui/SwipeDismissSheet.tsx). Functions marked 'worklet' run inside the sheet's
// pan gesture on the UI thread; they are plain functions under node:test.

export const SHEET_DISMISS = Object.freeze({
  /** Downward travel (px) before the sheet follows the finger. */
  activeOffsetY: 10,
  /** Horizontal travel (px) that leaves the touch to the content. */
  failOffsetX: 24,
  /** Share of the sheet height a slow drag must travel to close it. */
  distanceFraction: 0.3,
  /** Upper and lower bounds (px) of that distance. */
  maxDistance: 160,
  minDistance: 64,
  /** Distance (px) used before the sheet has been measured. */
  fallbackDistance: 120,
  /** Downward release speed (px/s) that closes the sheet as a flick. */
  flickVelocity: 900,
  /** A flick must also have moved at least this far (px). */
  flickMinDistance: 24,
  /** Seconds of release velocity added to the offset before deciding. */
  projectionSeconds: 0.12,
  /** Exit animation duration (ms) after a dismissing release. */
  exitDurationMs: 180
})

/** Spring back to rest: critically damped, no bounce. */
export const SHEET_RETURN_SPRING = Object.freeze({
  stiffness: 420,
  mass: 1,
  damping: 2 * Math.sqrt(420)
})

export type SheetDismissClaim = "wait" | "activate" | "fail"

/**
 * Whether a touch that started on the sheet becomes a dismiss drag. Only a
 * mostly vertical downward drag claims it, and only while the sheet's
 * content is scrolled to the top; otherwise the content keeps the touch.
 */
export function resolveSheetDismissClaim(input: { dx: number; dy: number; atTop: boolean }): SheetDismissClaim {
  "worklet"
  const { dx, dy, atTop } = input
  const absX = Math.abs(dx)
  if (absX > SHEET_DISMISS.failOffsetX && absX > Math.abs(dy)) return "fail"
  if (dy < -SHEET_DISMISS.activeOffsetY) return "fail"
  if (dy > SHEET_DISMISS.activeOffsetY && dy > absX) return atTop ? "activate" : "fail"
  return "wait"
}

/** Sheet offset (px, downward) for a drag: 1:1 down, never above rest. */
export function resolveSheetDragOffset(translationY: number): number {
  "worklet"
  if (!Number.isFinite(translationY)) return 0
  return Math.max(0, translationY)
}

/** Distance (px) a slow drag must travel to close a sheet of this height. */
export function getSheetDismissDistance(sheetHeight: number): number {
  "worklet"
  if (!(sheetHeight > 0)) return SHEET_DISMISS.fallbackDistance
  return Math.max(
    SHEET_DISMISS.minDistance,
    Math.min(sheetHeight * SHEET_DISMISS.distanceFraction, SHEET_DISMISS.maxDistance)
  )
}

/**
 * Release decision. A fast downward flick closes once it moved a little;
 * a fast upward flick keeps the sheet; otherwise the offset projected by
 * the release velocity must pass the dismiss distance.
 */
export function resolveSheetDismissRelease(input: {
  offset: number
  velocityY: number
  sheetHeight: number
}): "dismiss" | "return" {
  "worklet"
  const { offset, velocityY, sheetHeight } = input
  if (!Number.isFinite(offset) || offset < SHEET_DISMISS.flickMinDistance) return "return"
  const velocity = Number.isFinite(velocityY) ? velocityY : 0
  if (velocity >= SHEET_DISMISS.flickVelocity) return "dismiss"
  if (velocity <= -SHEET_DISMISS.flickVelocity) return "return"
  const projected = offset + velocity * SHEET_DISMISS.projectionSeconds
  return projected >= getSheetDismissDistance(sheetHeight) ? "dismiss" : "return"
}

/** Offset (px) that moves the sheet fully below the screen edge. */
export function getSheetExitOffset(sheetHeight: number): number {
  "worklet"
  return (sheetHeight > 0 ? sheetHeight : SHEET_DISMISS.fallbackDistance * 4) + 48
}
