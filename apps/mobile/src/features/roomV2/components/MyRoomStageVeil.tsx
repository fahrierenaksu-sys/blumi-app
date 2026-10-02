import { useCallback, useEffect, useState } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import {
  getMyRoomStageVeilFrame,
  isMyRoomStageCovered,
  MY_ROOM_STAGE_PAINT_FALLBACK_MS
} from "../myRoomStageModel"

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

/**
 * Whether the stage is still covered: while the room loads, and after that
 * until the renderer reports the shell's first paint (markPainted), with a
 * fallback so a paint that is never reported cannot keep the veil up.
 */
export function useMyRoomStageCover(isLoading: boolean): { covered: boolean; markPainted: () => void } {
  const [painted, setPainted] = useState(false)
  const [fallbackElapsed, setFallbackElapsed] = useState(false)
  const [wasLoading, setWasLoading] = useState(isLoading)
  if (wasLoading !== isLoading) {
    setWasLoading(isLoading)
    if (isLoading) {
      // A reload mounts a fresh renderer: wait for its first paint again.
      setPainted(false)
      setFallbackElapsed(false)
    }
  }
  useEffect(() => {
    if (isLoading) return
    const timer = setTimeout(() => setFallbackElapsed(true), MY_ROOM_STAGE_PAINT_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [isLoading])
  const markPainted = useCallback(() => setPainted(true), [])
  return {
    covered: isMyRoomStageCovered({ isLoading, shellPainted: painted, paintFallbackElapsed: fallbackElapsed }),
    markPainted
  }
}

interface MyRoomStageVeilProps {
  /** isMyRoomStageCovered: loading, or the room has not painted yet. */
  covered: boolean
}

/**
 * A shell-coloured placeholder over the stage. It covers the stage while the
 * saved room loads and until the room's first frame is painted, then
 * crossfades out on the UI thread. It never takes touches or focus.
 */
export function MyRoomStageVeil({ covered }: MyRoomStageVeilProps) {
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(covered ? 1 : 0)

  useEffect(() => {
    const frame = getMyRoomStageVeilFrame({ covered, reduceMotion })
    opacity.value = frame.durationMs > 0
      ? withTiming(frame.opacity, { duration: frame.durationMs, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never })
      : frame.opacity
  }, [covered, opacity, reduceMotion])

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
