import type { AvatarState } from "./miniRoomSceneTypes"

export interface MiniRoomMotionPolicy {
  animateBreathe: boolean
  animateJoin: boolean
  animateSpeaking: boolean
  animateBubble: boolean
  animateWalking: boolean
  /** The procedural step bob is decoration on top of the (essential) walk. */
  animateWalkBob: boolean
}

/**
 * The dock and room share one keyboard-coupled clock
 * (useMiniRoomCameraTransform). It is custom on purpose rather than a
 * ui/motion spring: it follows UIKit's own keyboard duration, so the dock
 * stays glued to the keyboard edge. Changes that are not the keyboard (a
 * longer draft, a measured history row) take this short step, and the
 * history viewport resizes on the same step and curve so the transcript
 * and its dock move together. Reduce Motion makes both instant; the
 * content fades still crossfade (ui/motion `crossfade`).
 */
export const MINI_ROOM_DOCK_STEP_MS = 180
export const MINI_ROOM_DESIGN_EASING = [0.25, 0.1, 0.25, 1] as const
export const MINI_ROOM_PARTNER_ARRIVAL_MS = 900

/** Ambient avatar loops; plain data for the UI-thread drivers. */
export const MINI_ROOM_AVATAR_LOOPS = Object.freeze({
  breatheHalfMs: 1600,
  walkBobHalfMs: 220,
  speakingHalfMs: 180,
  speakingCycles: 4,
  arrivalRingMs: MINI_ROOM_PARTNER_ARRIVAL_MS
})

export interface MiniRoomAvatarLoops {
  breathe: boolean
  walkBob: boolean
  speaking: boolean
  arrivalRing: boolean
}

/**
 * Which ambient loops one avatar runs. Drawn animation frames already carry
 * their own breathing and stride, so the procedural loop stays off for them.
 */
export function resolveMiniRoomAvatarLoops(input: {
  motion: AvatarState["motion"]
  policy: MiniRoomMotionPolicy
  usesAnimatedFrames: boolean
  arriving: boolean
}): MiniRoomAvatarLoops {
  const { motion, policy, usesAnimatedFrames } = input
  return {
    breathe: policy.animateBreathe && motion === "idle" && !usesAnimatedFrames,
    walkBob: policy.animateWalkBob && motion === "walking" && !usesAnimatedFrames,
    speaking: policy.animateSpeaking && motion === "speaking",
    arrivalRing: policy.animateJoin && input.arriving
  }
}

/**
 * Decorative motion stops under the OS accessibility preference. Walking is
 * state-essential spatial feedback and remains available.
 */
export function resolveMiniRoomMotionPolicy(
  reduceMotion: boolean
): MiniRoomMotionPolicy {
  return {
    animateBreathe: !reduceMotion,
    animateJoin: !reduceMotion,
    animateSpeaking: !reduceMotion,
    animateBubble: !reduceMotion,
    animateWalking: true,
    animateWalkBob: !reduceMotion
  }
}
