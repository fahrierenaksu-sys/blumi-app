import { useEffect, useRef, useState } from "react"
import {
  Animated,
  AppState,
  type AppStateStatus,
  Easing,
  StyleSheet,
  View
} from "react-native"
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
  const floatProgress = useRef(new Animated.Value(0)).current
  const animationRef = useRef<Animated.CompositeAnimation | null>(null)
  const canAnimate = active && isResolved && !reduceMotion && appState === "active"

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    animationRef.current?.stop()
    animationRef.current = null
    floatProgress.setValue(0)
    if (!canAnimate) return

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatProgress, {
          duration: 2_400,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(floatProgress, {
          duration: 2_400,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true
        })
      ]),
      { resetBeforeIteration: false }
    )
    animationRef.current = animation
    animation.start()

    return () => {
      animation.stop()
      if (animationRef.current === animation) animationRef.current = null
    }
  }, [canAnimate, floatProgress])

  const translateY = floatProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [2, -4]
  })
  const translateX = floatProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-1.5, 1.5]
  })
  const rotate = floatProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["-0.35deg", "0.35deg"]
  })
  const shadowOpacity = floatProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.17, 0.1]
  })
  const shadowScaleX = floatProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.93]
  })

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.stage}
      testID="register-world-hero"
    >
      <Animated.View
        style={[
          styles.shadow,
          { opacity: shadowOpacity, transform: [{ scaleX: shadowScaleX }] }
        ]}
      />
      <Animated.Image
        accessibilityIgnoresInvertColors
        accessible={false}
        fadeDuration={0}
        resizeMode="contain"
        source={WORLD_HERO}
        style={[
          styles.image,
          { transform: [{ translateX }, { translateY }, { rotate }] }
        ]}
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
