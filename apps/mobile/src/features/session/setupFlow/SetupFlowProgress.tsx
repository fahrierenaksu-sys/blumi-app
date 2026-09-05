import { useLayoutEffect } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"

interface SetupFlowProgressProps {
  current: 1 | 2 | 3 | 4
  reduceMotion: boolean
}

export function SetupFlowProgress({
  current,
  reduceMotion
}: SetupFlowProgressProps) {
  const railWidth = useSharedValue(0)
  const progress = useSharedValue(current / 4)

  useLayoutEffect(() => {
    progress.value = withTiming(current / 4, {
      duration: reduceMotion ? 120 : 300,
      easing: Easing.out(Easing.cubic)
    })
  }, [current, progress, reduceMotion])

  const fillStyle = useAnimatedStyle(() => ({
    // Percentage fallback keeps the visible progress correct before the
    // native rail measurement arrives. Once measured, switch to pixel width
    // so the animation remains deterministic across viewport sizes.
    width: railWidth.value > 0
      ? railWidth.value * progress.value
      : `${progress.value * 100}%`
  }))

  return (
    <View
      accessible
      accessibilityLabel={`Kurulum adımı ${current} / 4`}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 4,
        now: current,
        text: `${current} / 4`
      }}
      onLayout={(event) => {
        railWidth.value = event.nativeEvent.layout.width
      }}
      style={styles.rail}
      testID="setup-flow-progress"
    >
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  rail: {
    backgroundColor: uiTheme.colors.borderStrong,
    borderRadius: uiTheme.radius.full,
    height: 4,
    overflow: "hidden",
    width: "100%"
  },
  fill: {
    backgroundColor: uiTheme.colors.actionDark,
    borderRadius: uiTheme.radius.full,
    height: 4
  }
})
