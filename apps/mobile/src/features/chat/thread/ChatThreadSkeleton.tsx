import { useEffect } from "react"
import { StyleSheet, View, type DimensionValue } from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated"
import { CROSSFADE_EXITING, useMotion } from "../../../ui/motion"
import { bubbleStyles, styles as threadStyles } from "./chatThreadStyles"

/** Placeholder bubbles, oldest first; they sit at the bottom like a real thread. */
const SKELETON_BUBBLES: readonly { mine: boolean; width: DimensionValue }[] = [
  { mine: false, width: "52%" },
  { mine: false, width: "38%" },
  { mine: true, width: "46%" },
  { mine: false, width: "60%" },
  { mine: true, width: "34%" }
]
const PULSE_MIN_OPACITY = 0.55
const PULSE_HALF_MS = 800

/**
 * Stands in for the timeline while a thread's first history page loads
 * (UXO-03): quiet bubble shapes in the thread's own colours, then a
 * crossfade to the real messages. The breathing pulse stops under Reduce
 * Motion; the crossfade stays (it is only opacity).
 */
export function ChatThreadSkeleton({ label }: { label: string }) {
  const { reduceMotion } = useMotion()
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1
      return
    }
    const half = { duration: PULSE_HALF_MS, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.Never }
    pulse.value = withRepeat(withSequence(withTiming(PULSE_MIN_OPACITY, half), withTiming(1, half)), -1)
  }, [pulse, reduceMotion])
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))

  return (
    <Animated.View
      exiting={CROSSFADE_EXITING}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={[threadStyles.messageListContainer, skeletonStyles.root]}
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[skeletonStyles.stack, pulseStyle]}
      >
        {SKELETON_BUBBLES.map((bubble, index) => (
          <View
            key={index}
            style={[skeletonStyles.row, bubble.mine ? bubbleStyles.rowMe : bubbleStyles.rowThem]}
          >
            <View
              style={[
                bubbleStyles.bubble,
                bubble.mine ? bubbleStyles.bubbleMe : bubbleStyles.bubbleThem,
                skeletonStyles.bubble,
                { width: bubble.width }
              ]}
            />
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  )
}

const skeletonStyles = StyleSheet.create({
  root: {
    justifyContent: "flex-end"
  },
  stack: {
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 16
  },
  row: {
    flexDirection: "row"
  },
  bubble: {
    height: 38
  }
})
