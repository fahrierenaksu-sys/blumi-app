import { useEffect, useState } from "react"
import {
  AppState,
  type AppStateStatus,
  StyleSheet,
  View
} from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated"
import { useReducedMotionPreference } from "../../ui/animations"

const WORLD_HERO = require(
  "./assets/register-world-hero-v1-runtime/blumi_register_world_hero_v1.png"
)

interface RegisterWorldHeroProps {
  active?: boolean
}

export function RegisterWorldHero({ active = true }: RegisterWorldHeroProps) {
  const { isResolved, reduceMotion } = useReducedMotionPreference()
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState)
  const floatProgress = useSharedValue(0)
  const canAnimate = active && isResolved && !reduceMotion && appState === "active"

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    floatProgress.value = 0
    if (!canAnimate) return
    // A slow float on the UI thread while visible and in the foreground.
    const half = { duration: 2_400, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }
    floatProgress.value = withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), -1)
    return () => { floatProgress.value = 0 }
  }, [canAnimate, floatProgress])

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: 0.17 - 0.07 * floatProgress.value,
    transform: [{ scaleX: 1 - 0.07 * floatProgress.value }]
  }))
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -1.5 + 3 * floatProgress.value },
      { translateY: 2 - 6 * floatProgress.value },
      { rotate: `${-0.35 + 0.7 * floatProgress.value}deg` }
    ]
  }))

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.stage}
      testID="register-world-hero"
    >
      <Animated.View style={[styles.shadow, shadowStyle]} />
      <Animated.Image
        accessibilityIgnoresInvertColors
        accessible={false}
        fadeDuration={0}
        resizeMode="contain"
        source={WORLD_HERO}
        style={[styles.image, heroStyle]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  stage: {
    alignItems: "center",
    height: 148,
    justifyContent: "center",
    width: 240
  },
  image: {
    height: 137,
    position: "absolute",
    width: 222
  },
  shadow: {
    backgroundColor: "rgba(162, 68, 104, 0.32)",
    borderRadius: 999,
    bottom: 10,
    height: 9,
    position: "absolute",
    width: 142
  }
})
