import { useEffect } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import type { RoomPoint } from "./miniRoomSceneTypes"

/** One quiet floor ripple per accepted destination; never a persistent marker. */
export function RoomTapFeedback({ point }: { point: RoomPoint }) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = 0
    progress.value = withTiming(1, {
      duration: reduceMotion ? 320 : 520,
      easing: Easing.out(Easing.cubic),
      // Only opacity changes under Reduce Motion; the spatial expansion stops.
      reduceMotion: ReduceMotion.Never
    })
    return () => cancelAnimation(progress)
  }, [point, progress, reduceMotion])

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.75 * (1 - progress.value),
    transform: [{ scale: reduceMotion ? 1 : 0.72 + progress.value * 0.48 }]
  }))
  const centerStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))

  return (
    <View
      pointerEvents="none"
      accessible={false}
      testID="mini-room-tap-feedback"
      style={[styles.anchor, { left: `${point.x * 100}%`, top: `${point.y * 100}%` }]}
    >
      <Animated.View style={[styles.ring, ringStyle]} />
      <Animated.View style={[styles.center, centerStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    width: 42,
    height: 18,
    marginLeft: -21,
    marginTop: -9,
    alignItems: "center",
    justifyContent: "center"
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    borderWidth: 1.25,
    borderColor: "rgba(163, 111, 141, 0.6)",
    backgroundColor: "rgba(255, 255, 255, 0.18)"
  },
  center: {
    width: 5,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(163, 111, 141, 0.65)"
  }
})
