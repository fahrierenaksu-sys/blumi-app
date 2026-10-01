import { useEffect } from "react"
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import {
  resolveMiniRoomCameraTransform,
  type MiniRoomCameraFrame
} from "./miniRoomAvatarStageModel"

// Close to the iOS keyboard curve, so the room moves with the keyboard.
const KEYBOARD_EASING = Easing.bezier(0.17, 0.59, 0.4, 0.77)

/**
 * ROOM-15: the room keeps its resting layout while the keyboard opens; the
 * typing framing is a UI-thread translate + scale over the keyboard's own
 * duration, so the room, its furniture, hotspots and avatars never re-lay
 * out. Reduce Motion (or an event without duration) switches at once.
 */
export function useMiniRoomCameraTransform(input: {
  rest: MiniRoomCameraFrame
  target: MiniRoomCameraFrame
  durationMs: number
  reduceMotion: boolean
}) {
  const { translateX, translateY, scale } = resolveMiniRoomCameraTransform(input.rest, input.target)
  const { durationMs, reduceMotion } = input
  const x = useSharedValue(translateX)
  const y = useSharedValue(translateY)
  const s = useSharedValue(scale)

  useEffect(() => {
    if (reduceMotion || !(durationMs > 0)) {
      x.value = translateX
      y.value = translateY
      s.value = scale
      return
    }
    const config = { duration: durationMs, easing: KEYBOARD_EASING, reduceMotion: ReduceMotion.Never }
    x.value = withTiming(translateX, config)
    y.value = withTiming(translateY, config)
    s.value = withTiming(scale, config)
  }, [durationMs, reduceMotion, s, scale, translateX, translateY, x, y])

  return useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: s.value }]
  }))
}
