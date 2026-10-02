import type { getRenderableRoomV2AvatarMotionProfile } from "../roomV2AvatarMotion"

// The room avatar's procedural motion (walk bob, idle breathe, wave and dance
// gestures) as worklets: each maps the loop progress values (0..1, driven on
// the UI thread by useRoomRendererAvatarLoops) to one transform component.
// Split out of RoomRenderer2D so the renderer stays under its size cap.

export type RoomRendererAvatarMotion = ReturnType<typeof getRenderableRoomV2AvatarMotionProfile>

function lerp(from: number, to: number, progress: number): number {
  "worklet"
  return from + (to - from) * progress
}

export function getAvatarMotionTranslateY(
  motion: RoomRendererAvatarMotion,
  breathe: number,
  walk: number,
  gesture: number,
  usesIdleBreathe: boolean,
  /** The seat rig's drop, resolved on JS (getRoomV2AvatarSittingTranslateY). */
  sittingTranslateY: number
): number {
  "worklet"
  if (motion.state === "walking" && motion.usesRuntimeLocomotion) return lerp(0, -3, walk)
  if (motion.state === "sitting") return sittingTranslateY
  if (motion.state === "dancing" && motion.usesRuntimeGesture) return lerp(0, -5, gesture)
  if (motion.state === "waving" && motion.usesRuntimeGesture) return lerp(0, -2, gesture)
  if (motion.usesAnimatedAssets || !usesIdleBreathe) return 0
  return lerp(0, -1.5, breathe)
}

export function getAvatarMotionScaleY(
  motion: RoomRendererAvatarMotion,
  breathe: number,
  gesture: number,
  usesIdleBreathe: boolean
): number {
  "worklet"
  if (motion.state === "sitting") return 1
  if (motion.usesAnimatedAssets) return 1
  if (motion.state === "dancing" && motion.usesRuntimeGesture) return lerp(1, 1.045, gesture)
  if (!usesIdleBreathe) return 1
  return lerp(1, 1.018, breathe)
}

export function getAvatarMotionRotate(motion: RoomRendererAvatarMotion, gesture: number): string {
  "worklet"
  if (motion.usesAnimatedAssets) return "0deg"
  if (motion.state === "dancing" && motion.usesRuntimeGesture) return `${lerp(-4, 4, gesture)}deg`
  if (motion.state === "waving" && motion.usesRuntimeGesture) return `${lerp(-1, 3, gesture)}deg`
  return "0deg"
}

export function getAvatarMotionTranslateX(motion: RoomRendererAvatarMotion, gesture: number): number {
  "worklet"
  if (motion.state === "dancing" && motion.usesRuntimeGesture) return lerp(-2.5, 2.5, gesture)
  return 0
}
