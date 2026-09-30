import type { AppLocale } from "../session/appLocale"
import { getMyRoomStageCopy } from "./myRoomStageCopy"

/** The loading veil fades out over the ready room in this time. */
export const MY_ROOM_STAGE_REVEAL_DURATION_MS = 180

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

export function getMyRoomStageRevealMotion(reduceMotion: boolean): MyRoomStageRevealMotion {
  return { durationMs: reduceMotion ? 0 : MY_ROOM_STAGE_REVEAL_DURATION_MS }
}

/**
 * The veil covers the stage at once while the saved room loads (the renderer
 * is not mounted then) and fades away once the room is ready.
 */
export function getMyRoomStageVeilFrame(input: {
  isLoading: boolean
  reduceMotion: boolean
}): MyRoomStageVeilFrame {
  if (input.isLoading) return { opacity: 1, durationMs: 0 }
  return { opacity: 0, durationMs: getMyRoomStageRevealMotion(input.reduceMotion).durationMs }
}
