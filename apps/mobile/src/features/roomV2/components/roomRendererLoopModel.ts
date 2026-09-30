/**
 * Which native-driver idle loops a room render item runs. Reduce Motion
 * rules are the renderer's existing ones (the walk bob never followed Reduce
 * Motion); `paused` (screen not focused) stops every loop so hidden rooms do
 * not keep animating.
 */
export function getRoomRendererAvatarLoops(input: {
  isAvatar: boolean
  state: string
  usesAnimatedAssets: boolean
  usesRuntimeLocomotion: boolean
  usesRuntimeGesture: boolean
  reduceMotion: boolean
  paused: boolean
}): { breathe: boolean; walk: boolean; gesture: boolean } {
  const active = input.isAvatar && !input.paused
  return {
    breathe: active && input.state === "idle" && !input.usesAnimatedAssets && !input.reduceMotion,
    walk: active && input.state === "walking" && input.usesRuntimeLocomotion,
    gesture: active && !input.reduceMotion && input.usesRuntimeGesture
  }
}

export function shouldRunRoomRendererMarkerPulse(input: {
  reduceMotion: boolean
  paused: boolean
}): boolean {
  return !input.reduceMotion && !input.paused
}
