/**
 * Swipe-to-remove for a row of the Shop outfit list ("Kombinin · 3 parça").
 * A row follows the finger to the right and reveals a red remove backdrop
 * behind it; released past the threshold (or flicked) it leaves the outfit,
 * released before it springs back. Pure worklets: the row's pan runs them on
 * the UI thread and tests run them in node.
 */

import { getEaseOutExitDurationMs } from "../../ui/motionTokens"

/** Movement (pt) before a touch on a row is judged as a swipe or not. */
export const COMBINATION_ROW_SWIPE_SLOP = 10
/** A swipe must be this much more horizontal than vertical to claim the touch. */
const HORIZONTAL_DOMINANCE = 1.5
/** The remove threshold: this share of the row width, but never less than the floor. */
const REMOVE_WIDTH_FRACTION = 0.4
const REMOVE_DISTANCE_FLOOR = 64
/** A flick (pt/s) to the right removes once the row has moved a little. */
const FLICK_VELOCITY = 700
const FLICK_MIN_DISTANCE = 24

export type CombinationRowSwipeClaim = "wait" | "claim" | "fail"

/**
 * Whether a touch that started on a row is a remove swipe. Only a mostly
 * horizontal move to the right claims it; a vertical move or a move to the
 * left fails at once, so list scrolling and the main page pager keep working.
 */
export function getCombinationRowSwipeClaim(dx: number, dy: number): CombinationRowSwipeClaim {
  "worklet"
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return "fail"
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < COMBINATION_ROW_SWIPE_SLOP && ay < COMBINATION_ROW_SWIPE_SLOP) return "wait"
  if (dx > 0 && ax >= COMBINATION_ROW_SWIPE_SLOP && ax > ay * HORIZONTAL_DOMINANCE) return "claim"
  return "fail"
}

/** How far right the row sits for a finger translation: never left of its rest. */
export function getCombinationRowSwipeOffset(translationX: number): number {
  "worklet"
  return Number.isFinite(translationX) ? Math.max(0, translationX) : 0
}

/** The distance (pt) a row must travel to be removed on release. */
export function getCombinationRowRemoveThreshold(rowWidth: number): number {
  "worklet"
  const width = Number.isFinite(rowWidth) && rowWidth > 0 ? rowWidth : 0
  return Math.max(REMOVE_DISTANCE_FLOOR, width * REMOVE_WIDTH_FRACTION)
}

/**
 * 0 at rest, 1 at the threshold: how strongly the red backdrop and its icon
 * show. The icon pops to full size when the row is armed (progress 1).
 */
export function getCombinationRowRevealProgress(offset: number, threshold: number): number {
  "worklet"
  if (!(threshold > 0) || !Number.isFinite(offset)) return 0
  return Math.max(0, Math.min(1, offset / threshold))
}

/** Longest and shortest slide-out (ms) of a removed row. */
export const COMBINATION_ROW_LEAVE_MAX_MS = 200
const COMBINATION_ROW_LEAVE_MIN_MS = 110
/** Past the row's own width, so its shadow leaves too. */
const COMBINATION_ROW_LEAVE_OVERSHOOT = 8

/**
 * How a removed row slides out from `offset`: to just past its right edge,
 * as an ease-out that starts at the release speed (a fast flick leaves
 * sooner). The piece is removed when this ends, the moment the row is gone.
 */
export function getCombinationRowLeave(input: {
  offset: number
  velocityX: number
  rowWidth: number
}): { to: number; durationMs: number } {
  "worklet"
  const width = Number.isFinite(input.rowWidth) && input.rowWidth > 0 ? input.rowWidth : 1
  const to = width + COMBINATION_ROW_LEAVE_OVERSHOOT
  const from = getCombinationRowSwipeOffset(input.offset)
  return {
    to,
    durationMs: getEaseOutExitDurationMs(to - from, input.velocityX, COMBINATION_ROW_LEAVE_MAX_MS, COMBINATION_ROW_LEAVE_MIN_MS)
  }
}

/** What a released row does: leave the outfit, or spring back. */
export function resolveCombinationRowSwipeRelease(input: {
  translationX: number
  velocityX: number
  rowWidth: number
}): "remove" | "restore" {
  "worklet"
  const offset = getCombinationRowSwipeOffset(input.translationX)
  const velocity = Number.isFinite(input.velocityX) ? input.velocityX : 0
  // A flick back towards rest cancels, even past the threshold.
  if (velocity <= -FLICK_VELOCITY) return "restore"
  if (offset >= getCombinationRowRemoveThreshold(input.rowWidth)) return "remove"
  return velocity >= FLICK_VELOCITY && offset >= FLICK_MIN_DISTANCE ? "remove" : "restore"
}
