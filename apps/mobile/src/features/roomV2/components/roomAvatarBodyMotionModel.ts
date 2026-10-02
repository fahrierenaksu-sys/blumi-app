import type { RoomV2AvatarMotionState } from "../roomV2.types"

// Procedural body motion for the room avatar on top of the existing frames
// (VIS-02, VIS-03 in docs/quality/ROOM_AVATAR_VISUAL_DIRECTION_2026-10-01.md):
// a sit/stand transition instead of a 0 ms swap, walk frames locked to the
// distance travelled instead of a clock, a stride bob and a contact shadow.
// No new art: only translate/scale on the frames the avatar already has.
// Every function here is a worklet so the UI thread drives it per frame.

export type RoomAvatarPoseTransitionKind = "sit" | "stand"

/** Sit: anticipation (push up) → drop onto the seat → settle (squash). */
export const ROOM_AVATAR_SIT_TRANSITION_MS = Object.freeze({
  anticipation: 90,
  drop: 170,
  settle: 160
})

/** Stand: crouch → rise with a little stretch → settle. */
export const ROOM_AVATAR_STAND_TRANSITION_MS = Object.freeze({
  anticipation: 80,
  rise: 150,
  settle: 110
})

/** Reduce Motion: the pose change is a short crossfade, never a squash. */
export const ROOM_AVATAR_REDUCED_POSE_FADE_MS = 120
export const ROOM_AVATAR_REDUCED_POSE_FADE_FROM_OPACITY = 0.35

/**
 * How far the body travels in a sit or stand, as a share of the avatar box
 * height (the drawn figure is about 0.62 of its 256×384 canvas, and the hip
 * moves roughly a fifth of the figure). Tunable on a device.
 */
export const ROOM_AVATAR_POSE_LIFT_BOX_HEIGHTS = 0.12

/**
 * One walk cycle (four frames, two steps) per this many avatar box heights
 * travelled on screen, so the feet plant instead of sliding (S3). Tunable on
 * a device together with the walk pace.
 */
export const ROOM_AVATAR_STRIDE_CYCLE_BOX_HEIGHTS = 0.6
/** Peak body bob while walking, as a share of the avatar box height. */
export const ROOM_AVATAR_WALK_BOB_BOX_HEIGHTS = 0.012

export interface RoomAvatarBodyPose {
  translateY: number
  scaleY: number
}

const REST_POSE: RoomAvatarBodyPose = { translateY: 0, scaleY: 1 }

/** Which transition a pose change plays, if any. */
export function getRoomAvatarPoseTransitionKind(
  previous: RoomV2AvatarMotionState | undefined,
  next: RoomV2AvatarMotionState | undefined
): RoomAvatarPoseTransitionKind | null {
  if (previous === undefined || next === undefined || previous === next) return null
  if (next === "sitting") return "sit"
  if (previous === "sitting") return "stand"
  return null
}

export function getRoomAvatarPoseTransitionDurationMs(kind: RoomAvatarPoseTransitionKind): number {
  "worklet"
  if (kind === "sit") {
    const { anticipation, drop, settle } = ROOM_AVATAR_SIT_TRANSITION_MS
    return anticipation + drop + settle
  }
  const { anticipation, rise, settle } = ROOM_AVATAR_STAND_TRANSITION_MS
  return anticipation + rise + settle
}

function clamp01(value: number): number {
  "worklet"
  return value <= 0 ? 0 : value >= 1 ? 1 : value
}

/**
 * The body offset `elapsedMs` into a sit or stand. The new pose's frame is
 * already showing; this moves it from where the old pose's body was to its
 * resting place. `liftPx` is how far the hip travels. Scale is anchored at
 * the feet by the caller. Past the end it is exactly the rest pose.
 */
export function getRoomAvatarPoseTransitionPose(
  kind: RoomAvatarPoseTransitionKind,
  elapsedMs: number,
  liftPx: number
): RoomAvatarBodyPose {
  "worklet"
  if (!(elapsedMs >= 0) || elapsedMs >= getRoomAvatarPoseTransitionDurationMs(kind)) return REST_POSE
  if (kind === "sit") {
    const { anticipation, drop, settle } = ROOM_AVATAR_SIT_TRANSITION_MS
    if (elapsedMs < anticipation) {
      // A small push up before the drop.
      const p = clamp01(elapsedMs / anticipation)
      const eased = 1 - (1 - p) * (1 - p)
      return { translateY: -liftPx * (1 + 0.25 * eased), scaleY: 1 + 0.02 * eased }
    }
    if (elapsedMs < anticipation + drop) {
      // Gravity: accelerates into the seat.
      const p = clamp01((elapsedMs - anticipation) / drop)
      return { translateY: -liftPx * 1.25 * (1 - p * p), scaleY: 1.02 - 0.02 * p }
    }
    // Landing squash that dies out with one soft rebound.
    const p = clamp01((elapsedMs - anticipation - drop) / settle)
    return { translateY: 0, scaleY: 1 - 0.05 * Math.exp(-4 * p) * Math.cos(p * Math.PI * 1.5) }
  }
  const { anticipation, rise, settle } = ROOM_AVATAR_STAND_TRANSITION_MS
  if (elapsedMs < anticipation) {
    // Still low from the seat, gathering for the push.
    const p = clamp01(elapsedMs / anticipation)
    return { translateY: liftPx, scaleY: 0.93 - 0.03 * p }
  }
  if (elapsedMs < anticipation + rise) {
    const p = clamp01((elapsedMs - anticipation) / rise)
    const eased = 1 - (1 - p) * (1 - p) * (1 - p)
    return { translateY: liftPx - liftPx * 1.15 * eased, scaleY: 0.9 + 0.13 * eased }
  }
  const p = clamp01((elapsedMs - anticipation - rise) / settle)
  const eased = 1 - (1 - p) * (1 - p)
  return { translateY: -0.15 * liftPx * (1 - eased), scaleY: 1.03 - 0.03 * eased }
}

/** Walk-cycle phase (0..1) gained by moving `distancePx` on screen. */
export function getRoomAvatarStridePhaseDelta(distancePx: number, avatarBoxHeightPx: number): number {
  "worklet"
  const cyclePx = avatarBoxHeightPx * ROOM_AVATAR_STRIDE_CYCLE_BOX_HEIGHTS
  if (!(cyclePx > 0) || !(distancePx > 0)) return 0
  return distancePx / cyclePx
}

/** A step is half a walk cycle; a foot plants at every multiple of it. */
export const ROOM_AVATAR_STRIDE_STEP_PHASE = 0.5

/** On-screen length of a walk path given in stage-relative points. */
export function getRoomAvatarWalkPathPx(
  path: readonly { x: number; y: number }[],
  stageWidthPx: number,
  stageHeightPx: number
): number {
  "worklet"
  let total = 0
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!
    const to = path[index]!
    total += Math.hypot((to.x - from.x) * stageWidthPx, (to.y - from.y) * stageHeightPx)
  }
  return total
}

/**
 * How fast the feet cycle relative to the distance alone, for one walk of
 * `walkPx` that starts at stride `phase`. The walk takes whole steps and at
 * least one, so a tap right beside the avatar still steps instead of
 * sliding, and every walk (a retarget mid-step included) ends on a planted
 * foot. Long walks stay within half a step of the distance-locked cadence.
 */
export function getRoomAvatarStrideGain(phase: number, walkPx: number, avatarBoxHeightPx: number): number {
  "worklet"
  const natural = getRoomAvatarStridePhaseDelta(walkPx, avatarBoxHeightPx)
  if (!(natural > 0) || !Number.isFinite(phase)) return 1
  const step = ROOM_AVATAR_STRIDE_STEP_PHASE
  const nearestPlant = Math.round((phase + natural) / step) * step
  const firstPlantAfterAStep = Math.ceil((phase + step) / step - 1e-6) * step
  return (Math.max(nearestPlant, firstPlantAfterAStep) - phase) / natural
}

/** Advances a phase and keeps it in [0, 1). */
export function advanceRoomAvatarStridePhase(phase: number, delta: number): number {
  "worklet"
  const next = (phase + delta) % 1
  return next < 0 ? next + 1 : next
}

/** The walk frame for a phase: the frame changes only as the avatar moves. */
export function getRoomAvatarStrideFrameIndex(phase: number, frameCount: number): number {
  "worklet"
  if (frameCount <= 1) return 0
  const wrapped = advanceRoomAvatarStridePhase(phase, 0)
  return Math.min(frameCount - 1, Math.floor(wrapped * frameCount))
}

/**
 * Body lift for a phase, 0..1: zero when a foot plants (start and middle of
 * the cycle) and highest mid-step, two bobs per cycle.
 */
export function getRoomAvatarStrideBob(phase: number): number {
  "worklet"
  return (1 - Math.cos(phase * Math.PI * 4)) / 2
}

/** The contact shadow tightens and fades a touch as the body lifts. */
export function getRoomAvatarContactShadow(bob: number): { scale: number; opacity: number } {
  "worklet"
  const lift = clamp01(bob)
  return { scale: 1 - 0.08 * lift, opacity: 1 - 0.2 * lift }
}
