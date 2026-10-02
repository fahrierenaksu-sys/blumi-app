export interface MiniRoomMotionPolicy {
  animateBreathe: boolean
  animateJoin: boolean
  animateSpeaking: boolean
  animateBubble: boolean
  animateWalking: boolean
}

export const MINI_ROOM_ENTRY_DURATION_MS = 440
export const MINI_ROOM_CAMERA_DURATION_MS = 280
export const MINI_ROOM_DOCK_DURATION_MS = 220
export const MINI_ROOM_HISTORY_RESIZE_DURATION_MS = 180
export const MINI_ROOM_DESIGN_EASING = [0.25, 0.1, 0.25, 1] as const
export const MINI_ROOM_PARTNER_ARRIVAL_MS = 900
export const MINI_ROOM_WELCOME_REVEAL_MS = 180
export const MINI_ROOM_WELCOME_HOLD_MS = 900
export const MINI_ROOM_WELCOME_FADE_MS = 240

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
    animateWalking: true
  }
}
