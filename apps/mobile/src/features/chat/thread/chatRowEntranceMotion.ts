import { MOTION_DURATIONS } from "../../../ui/motionTokens"

/**
 * How a new timeline row appears (owner direction, 2026-10-02): every new
 * row, mine, the partner's or an invitation, fades in while it rises a few
 * points into place. One calm motion for all of them; a bubble never grows,
 * shrinks or pops. Reduce Motion is decided before the row mounts (no
 * entrance at all). Plain data and worklets, so node tests run them.
 */
export const CHAT_ROW_ENTRANCE = Object.freeze({
  durationMs: MOTION_DURATIONS.fadeIn,
  /** Points below its place the row starts from. */
  risePt: 8
})

export interface ChatRowEntranceFrame {
  readonly opacity: number
  readonly translateY: number
}

/** Ease-out cubic, the curve the entrance plays on (Reanimated Easing.out(Easing.cubic)). */
function easeOutCubic(progress: number): number {
  "worklet"
  const clamped = Math.min(1, Math.max(0, progress))
  return 1 - (1 - clamped) ** 3
}

/** The row at `progress` (0 = mounted, 1 = at rest). Only opacity and a vertical offset. */
export function chatRowEntranceFrame(progress: number): ChatRowEntranceFrame {
  "worklet"
  const eased = easeOutCubic(progress)
  return {
    opacity: eased,
    translateY: CHAT_ROW_ENTRANCE.risePt * (1 - eased)
  }
}
