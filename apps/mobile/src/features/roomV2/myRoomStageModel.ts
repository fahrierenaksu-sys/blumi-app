import type { AppLocale } from "../session/appLocale"
import { MOTION_DURATIONS } from "../../ui/motionTokens"
import { getMyRoomStageCopy } from "./myRoomStageCopy"

/** The loading veil crossfades away over the painted room in this time. */
export const MY_ROOM_STAGE_REVEAL_DURATION_MS = MOTION_DURATIONS.crossfade

/**
 * If the room's shell never reports its first paint (a decode error), the
 * veil still lifts after this long once the room data is ready.
 */
export const MY_ROOM_STAGE_PAINT_FALLBACK_MS = 1200

export interface MyRoomStageRevealMotion {
  durationMs: number
}

export interface MyRoomStageVeilFrame {
  opacity: 0 | 1
  durationMs: number
}

/**
 * The stage's spoken value: how many pieces the owner has placed, in the
 * app language. Debug identifiers (shell id, render counts) never reach it.
 */
export function getMyRoomStageAccessibilityValue(input: {
  savedItemCount: number
  locale: AppLocale
}): string {
  const copy = getMyRoomStageCopy(input.locale)
  const count = Number.isFinite(input.savedItemCount)
    ? Math.max(0, Math.floor(input.savedItemCount))
    : 0
  return count === 0 ? copy.noItems : copy.itemCount(count)
}

/**
 * The reveal is an opacity crossfade, so it stays under Reduce Motion (it
 * replaces movement, it is not movement).
 */
export function getMyRoomStageRevealMotion(_reduceMotion: boolean): MyRoomStageRevealMotion {
  return { durationMs: MY_ROOM_STAGE_REVEAL_DURATION_MS }
}

/**
 * The stage stays covered while the saved room loads (the renderer is not
 * mounted then) and until the room's shell has painted its first frame
 * (ROOM-16), so the veil never lifts over a half-drawn room. A shell that
 * never reports a paint is uncovered after the fallback.
 */
export function isMyRoomStageCovered(input: {
  isLoading: boolean
  shellPainted: boolean
  paintFallbackElapsed: boolean
}): boolean {
  if (input.isLoading) return true
  return !input.shellPainted && !input.paintFallbackElapsed
}

/** The veil covers the stage at once and crossfades away once uncovered. */
export function getMyRoomStageVeilFrame(input: {
  covered: boolean
  reduceMotion: boolean
}): MyRoomStageVeilFrame {
  if (input.covered) return { opacity: 1, durationMs: 0 }
  return { opacity: 0, durationMs: getMyRoomStageRevealMotion(input.reduceMotion).durationMs }
}
