import { useEffect } from "react"
import { Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"
import { useReducedMotion } from "../../ui/animations"

/** One finite UI-thread transition; old accepted cards mount already open. */
export function useRoomInviteSceneMotion(open: boolean) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(open ? 1 : 0)
  useEffect(() => {
    cancelAnimation(progress)
    progress.value = reduceMotion ? Number(open) : withTiming(Number(open), {
      duration: open ? 1250 : 450, easing: Easing.bezier(0.22, 0.68, 0.2, 1)
    })
    return () => cancelAnimation(progress)
  }, [open, progress, reduceMotion])
  const doorStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 500 }, { rotateY: `${-72 * progress.value}deg` }]
  }))
  const beamStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2, 1], [0, 0.04, 0.48]),
    transform: [{ scaleX: interpolate(progress.value, [0, 1], [0.45, 1]) }]
  }))
  const poolStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + progress.value * 0.62,
    transform: [{ scaleX: 0.55 + progress.value * 0.65 }]
  }))
  const interiorStyle = useAnimatedStyle(() => ({ opacity: 0.65 + progress.value * 0.35 }))
  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 6 }, { scale: 0.8 + progress.value * 0.2 }]
  }))
  return { doorStyle, beamStyle, poolStyle, interiorStyle, checkStyle }
}
