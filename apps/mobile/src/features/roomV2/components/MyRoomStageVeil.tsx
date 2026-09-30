import { useEffect } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import { getMyRoomStageVeilFrame } from "../myRoomStageModel"

// The My Room shell's warm base (matches the stage backdrop) and a soft floor.
const STAGE_SHELL_COLOR = "#E8B698"
const STAGE_FLOOR_GLOW = "rgba(255, 248, 246, 0.26)"
const STAGE_WALL_SHADE = "rgba(112, 35, 68, 0.06)"

interface MyRoomStageLoadingStatusProps {
  label: string
}

/** The spoken loading state of the stage; the veil draws the visuals. */
export function MyRoomStageLoadingStatus({ label }: MyRoomStageLoadingStatusProps) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={StyleSheet.absoluteFill}
    />
  )
}

interface MyRoomStageVeilProps {
  isLoading: boolean
}

/**
 * A shell-coloured placeholder over the stage. It covers the stage while the
 * saved room loads and fades out on the UI thread once the room is ready
 * (instantly under Reduce Motion). It never takes touches or focus.
 */
export function MyRoomStageVeil({ isLoading }: MyRoomStageVeilProps) {
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(isLoading ? 1 : 0)

  useEffect(() => {
    const frame = getMyRoomStageVeilFrame({ isLoading, reduceMotion })
    opacity.value = frame.durationMs > 0
      ? withTiming(frame.opacity, { duration: frame.durationMs, easing: Easing.out(Easing.quad) })
      : frame.opacity
  }, [isLoading, opacity, reduceMotion])

  const veilStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.veil, veilStyle]}
    >
      <View style={styles.wallShade} />
      <View style={styles.floorGlow} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  veil: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: STAGE_SHELL_COLOR
  },
  wallShade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "46%",
    backgroundColor: STAGE_WALL_SHADE
  },
  floorGlow: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: "14%",
    height: "34%",
    borderRadius: 999,
    backgroundColor: STAGE_FLOOR_GLOW
  }
})
