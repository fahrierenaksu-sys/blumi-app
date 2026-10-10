import { roomAvatar25d } from "../../avatar/roomAvatarSeam"
import type { MotionSegment } from "../../../ui/motion"

/**
 * The editor's small reward beats, as pure UI-thread maths (transform and opacity only):
 * - settle: a dropped piece falls the last few points onto its cell, squashes a little and springs back;
 * - sparkle: a few soft stars pop on the floor around the piece and drift up as they fade;
 * - turn: a rotated piece cross-fades from its old drawing to its new one with a small scale pulse.
 * Reduce Motion skips all three (the piece simply lands or turns). No sound, by design.
 */

/**
 * The beats play only in the 2.5D room (its calibration is on); every other build places and turns
 * pieces exactly as shipped.
 */
export const ROOM_EDITOR_PLACE_JUICE = roomAvatar25d.roomCalibration !== null

/** Quadratic curves (worklets), so this module stays plain maths that Node tests load without React Native. */
export function easeInQuad(t: number): number {
  "worklet"
  return t * t
}

export function easeOutQuad(t: number): number {
  "worklet"
  return 1 - (1 - t) * (1 - t)
}

export function easeInOutQuad(t: number): number {
  "worklet"
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
}

/** The settle's beats (authored): fall onto the cell, squash, rebound, rest. About 220 ms in all. */
export const ROOM_EDITOR_SETTLE_FALL: MotionSegment = { durationMs: 70, easing: easeInQuad }
export const ROOM_EDITOR_SETTLE_SQUASH: MotionSegment = { durationMs: 50, easing: easeOutQuad }
export const ROOM_EDITOR_SETTLE_REBOUND: MotionSegment = { durationMs: 60, easing: easeInOutQuad }
export const ROOM_EDITOR_SETTLE_REST: MotionSegment = { durationMs: 40, easing: easeOutQuad }
export const ROOM_EDITOR_SETTLE_MS = ROOM_EDITOR_SETTLE_FALL.durationMs + ROOM_EDITOR_SETTLE_SQUASH.durationMs +
  ROOM_EDITOR_SETTLE_REBOUND.durationMs + ROOM_EDITOR_SETTLE_REST.durationMs
/**
 * After the settle the room draws the piece again: once its image is on screen the overlay waits this one beat
 * more over it, then fades. If the room never reports it (a failed image), the overlay fades after the cap.
 */
export const ROOM_EDITOR_SETTLE_HANDOFF_MS = 32
export const ROOM_EDITOR_SETTLE_HANDOFF_CAP_MS = 450
/** The rebound overshoots the other way by this share of the squash. */
export const ROOM_EDITOR_SETTLE_REBOUND_SHARE = -0.35
/** Full squash: the piece is this much shorter (and a little wider) for a moment. */
export const ROOM_EDITOR_SQUASH_DEPTH = 0.05

/**
 * Scale factors for a squash amount (0 at rest, 1 full squash, negative a slight stretch). Width grows by a bit
 * more than half of what the height loses, so the piece reads as soft, not as shrinking.
 */
export function getRoomEditorSquashScale(squash: number): { x: number; y: number } {
  "worklet"
  return {
    x: 1 + squash * ROOM_EDITOR_SQUASH_DEPTH * 0.6,
    y: 1 - squash * ROOM_EDITOR_SQUASH_DEPTH
  }
}

/** Sparkles: a fixed pool, laid out once, played by one 0..1 clock. */
export const ROOM_EDITOR_SPARKLE_COUNT = 6
export const ROOM_EDITOR_SPARKLE_MS = 560

export interface RoomEditorSparkleFrame {
  translateX: number
  translateY: number
  scale: number
  opacity: number
  rotateDeg: number
}

/**
 * Sparkle `index` at clock `progress` (0..1), around a piece `width` px wide whose floor contact is the origin.
 * They start on a flat floor ellipse round the base (the room's floor is seen at an angle), pop in fast, drift
 * up and a little outward, and are gone (opacity 0) when the clock ends.
 */
export function getRoomEditorSparkleFrame(index: number, progress: number, width: number): RoomEditorSparkleFrame {
  "worklet"
  const p = Math.max(0, Math.min(1, progress))
  const count = ROOM_EDITOR_SPARKLE_COUNT
  // even spacing, nudged per index so the ring never looks mechanical
  const angle = (index / count) * Math.PI * 2 + (index % 2 === 0 ? 0.35 : -0.2)
  const radiusX = Math.max(18, width * 0.42) * (0.82 + 0.18 * ((index * 7) % 3) / 2)
  const radiusY = radiusX * 0.42
  const spread = 1 + 0.25 * p
  const rise = (14 + (index % 3) * 6) * p
  const popIn = Math.min(1, p / 0.18)
  const fadeOut = p < 0.45 ? 1 : Math.max(0, 1 - (p - 0.45) / 0.55)
  return {
    translateX: Math.cos(angle) * radiusX * spread,
    translateY: Math.sin(angle) * radiusY * spread - rise,
    scale: (0.45 + 0.55 * popIn) * (1 - 0.35 * p) * (index % 3 === 1 ? 0.75 : 1),
    opacity: popIn * fadeOut,
    rotateDeg: (index % 2 === 0 ? 1 : -1) * 40 * p
  }
}

/** The soft turn: a quick cross-fade with a small scale pulse. */
export const ROOM_EDITOR_TURN_MS = 180
/** A turn that also nudged the piece to a free cell glides there: the same beat, a little longer. */
export const ROOM_EDITOR_TURN_NUDGE_MS = 300
export const ROOM_EDITOR_TURN_PULSE = 0.06

/** How long a turn plays: longer when the piece also slides to another cell. */
export function getRoomEditorTurnMs(nudged: boolean): number {
  return nudged ? ROOM_EDITOR_TURN_NUDGE_MS : ROOM_EDITOR_TURN_MS
}

export interface RoomEditorTurnFrame {
  /** The old drawing, on top, fading out over the whole turn. */
  outgoingOpacity: number
  /** The new drawing, underneath, in by the middle of the turn so the floor never shows through. */
  incomingOpacity: number
  scale: number
  /**
   * How far both drawings have travelled from the old drawn spot to the new one (0..1; the turn's clock is eased). They move
   * together, so the piece turns in one place and, after a nudge, glides to its new cell; the old drawing is never
   * left standing on its old spot.
   */
  slide: number
}

export function getRoomEditorTurnFrame(progress: number): RoomEditorTurnFrame {
  "worklet"
  const p = Math.max(0, Math.min(1, progress))
  return {
    outgoingOpacity: 1 - p,
    incomingOpacity: Math.min(1, p / 0.45),
    scale: 1 + ROOM_EDITOR_TURN_PULSE * Math.sin(Math.PI * p),
    slide: p
  }
}

/**
 * Where a turning drawing is (px from its own drawn spot): the old one starts on its spot and ends on the new
 * spot, the new one starts on the old spot and ends on its own; `delta` is new spot minus old spot (px).
 */
export function getRoomEditorTurnOffset(
  role: "incoming" | "outgoing",
  slide: number,
  delta: { x: number; y: number }
): { x: number; y: number } {
  "worklet"
  const share = role === "outgoing" ? slide : slide - 1
  return { x: delta.x * share, y: delta.y * share }
}
