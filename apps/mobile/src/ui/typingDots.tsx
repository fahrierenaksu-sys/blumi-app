import { useEffect } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { useReducedMotion } from "./animations"
import { uiTheme } from "./theme"

const DOT_RISE_MS = 300
const DOT_STAGGER_MS = 150
const DOT_REST_MS = 450
/** Reduce Motion: three still dots, graded so they still read as "…". */
const STILL_OPACITY = [0.45, 0.7, 1] as const

function Dot({ progress, size, color }: {
  progress: SharedValue<number>
  size: number
  color: string
}) {
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: -progress.value * size * 0.5 }]
  }))
  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style
      ]}
    />
  )
}

const stillProgress = (index: number): number => (STILL_OPACITY[index] - 0.35) / 0.65

function useDotProgress(index: number, animate: boolean): SharedValue<number> {
  const progress = useSharedValue(animate ? 0 : stillProgress(index))
  useEffect(() => {
    if (!animate) {
      cancelAnimation(progress)
      progress.value = stillProgress(index)
      return undefined
    }
    progress.value = 0
    progress.value = withDelay(index * DOT_STAGGER_MS, withRepeat(withSequence(
      withTiming(1, { duration: DOT_RISE_MS, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: DOT_RISE_MS, easing: Easing.in(Easing.cubic) }),
      withTiming(0, { duration: DOT_REST_MS })
    ), -1, false))
    return () => cancelAnimation(progress)
  }, [animate, index, progress])
  return progress
}

/**
 * Three "typing" dots animated on the UI thread with Reanimated shared values
 * (no React state per frame). Under Reduce Motion (shared store) they hold
 * still. Decorative: the caller owns the accessible label.
 */
export function TypingDots({ size = 6, color = uiTheme.colors.primary }: { size?: number; color?: string }) {
  const animate = !useReducedMotion()
  const first = useDotProgress(0, animate)
  const second = useDotProgress(1, animate)
  const third = useDotProgress(2, animate)
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.row, { gap: Math.round(size * 0.7), paddingTop: size * 0.5 }]}
    >
      <Dot progress={first} size={size} color={color} />
      <Dot progress={second} size={size} color={color} />
      <Dot progress={third} size={size} color={color} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center"
  }
})
