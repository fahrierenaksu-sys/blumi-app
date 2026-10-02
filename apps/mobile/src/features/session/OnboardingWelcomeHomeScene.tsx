import { useEffect, useRef, useState } from "react"
import { Image, StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { animateSegment, animateSequence, repeatForever } from "../../ui/motion"
import { OnboardingGreetingPair } from "./OnboardingGreetingPair"
import { ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y } from "./onboardingWorldCompositionModel"
import {
  ONBOARDING_WELCOME_HOME_TIMELINE_MS as timeline,
  getOnboardingWelcomeHomeProgressAtElapsed
} from "./onboardingWelcomeHomeModel"
import { getCurrentSetupFlowCopy } from "./setupFlow/setupFlowLocale"

const WELCOME_COTTAGE = require("./assets/onboarding-welcome-home-v1-runtime/blumi_welcome_cottage_v1.png")

interface OnboardingWelcomeHomeSceneProps {
  compact: boolean
  motionEnabled: boolean
  motionPreferenceResolved: boolean
  reduceMotion: boolean
}

const ignoreFinished = () => undefined

export function OnboardingWelcomeHomeScene({
  compact,
  motionEnabled,
  motionPreferenceResolved,
  reduceMotion
}: OnboardingWelcomeHomeSceneProps) {
  const shouldReduceMotion = motionPreferenceResolved && reduceMotion
  const sceneClock = useSharedValue(shouldReduceMotion ? timeline.settled : 0)
  const lightPulse = useSharedValue(0)
  const elapsedMsRef = useRef(shouldReduceMotion ? timeline.settled : 0)
  const [isSettled, setIsSettled] = useState(shouldReduceMotion)

  useEffect(() => {
    if (!motionPreferenceResolved) return undefined
    if (reduceMotion) {
      cancelAnimation(sceneClock)
      sceneClock.value = timeline.settled
      elapsedMsRef.current = timeline.settled
      setIsSettled(true)
      return undefined
    }
    if (!motionEnabled || elapsedMsRef.current >= timeline.settled) return undefined

    const startedAt = Date.now()
    const remainingMs = timeline.settled - elapsedMsRef.current
    const settle = () => {
      elapsedMsRef.current = timeline.settled
      setIsSettled(true)
    }
    sceneClock.value = animateSegment(timeline.settled, { durationMs: remainingMs }, (finished) => {
      "worklet"
      if (finished) scheduleOnRN(settle)
    })

    return () => {
      elapsedMsRef.current = Math.min(
        timeline.settled,
        elapsedMsRef.current + Date.now() - startedAt
      )
      cancelAnimation(sceneClock)
    }
  }, [motionEnabled, motionPreferenceResolved, reduceMotion, sceneClock])

  useEffect(() => {
    if (!motionEnabled || reduceMotion || !isSettled) {
      cancelAnimation(lightPulse)
      return undefined
    }

    const easing = Easing.inOut(Easing.sin)
    lightPulse.value = 0
    lightPulse.value = repeatForever(animateSequence(
      animateSegment(1, { durationMs: 1_800, easing }),
      animateSegment(0, { durationMs: 2_050, easing })
    ))
    return () => {
      cancelAnimation(lightPulse)
    }
  }, [isSettled, lightPulse, motionEnabled, reduceMotion])

  const progress = getOnboardingWelcomeHomeProgressAtElapsed(
    shouldReduceMotion ? timeline.settled : elapsedMsRef.current,
    shouldReduceMotion
  )
  const houseFrom = progress.house
  const doorLightFrom = progress.doorLight
  const doorLight = (clock: number) => {
    "worklet"
    return interpolate(clock, [timeline.doorLightStart, timeline.doorLightComplete], [doorLightFrom, 1], Extrapolation.CLAMP)
  }

  const cottageStyle = useAnimatedStyle(() => {
    const clock = sceneClock.value
    return {
      opacity: interpolate(clock, [timeline.houseRevealStart, timeline.houseRevealComplete], [houseFrom, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(clock, [0, 190, timeline.houseRevealComplete], [20, -4, 0], Extrapolation.CLAMP) },
        { scale: interpolate(clock, [0, 210, timeline.houseRevealComplete], [0.92, 1.018, 1], Extrapolation.CLAMP) }
      ]
    }
  })
  const doorGlowStyle = useAnimatedStyle(() => ({
    opacity: doorLight(sceneClock.value) * interpolate(lightPulse.value, [0, 1], [0.6, 0.96]),
    transform: [{ scale: interpolate(lightPulse.value, [0, 1], [0.96, 1.1]) }]
  }))
  const windowGlowStyle = useAnimatedStyle(() => ({
    opacity: doorLight(sceneClock.value) * interpolate(lightPulse.value, [0, 1], [0.26, 0.54])
  }))
  const floorLightStyle = useAnimatedStyle(() => ({
    opacity: doorLight(sceneClock.value) * interpolate(lightPulse.value, [0, 1], [0.2, 0.44]),
    transform: [
      { scaleX: interpolate(lightPulse.value, [0, 1], [0.94, 1.08]) },
      { scaleY: interpolate(lightPulse.value, [0, 1], [0.92, 1.03]) }
    ]
  }))
  const sparkleLeftStyle = useAnimatedStyle(() => ({
    opacity: doorLight(sceneClock.value) * interpolate(lightPulse.value, [0, 1], [0.12, 0.68]),
    transform: [
      { rotate: "45deg" },
      { scale: interpolate(lightPulse.value, [0, 1], [0.56, 1]) }
    ]
  }))
  const sparkleRightStyle = useAnimatedStyle(() => ({
    opacity: doorLight(sceneClock.value) * interpolate(lightPulse.value, [0, 1], [0.66, 0.18]),
    transform: [
      { rotate: "45deg" },
      { scale: interpolate(lightPulse.value, [0, 1], [0.88, 0.54]) }
    ]
  }))
  const entranceProgress = useDerivedValue(() => interpolate(
    sceneClock.value,
    [timeline.characterEntranceStart, timeline.characterEntranceComplete],
    [0, 1],
    Extrapolation.CLAMP
  ))
  const entrancePairStyle = useAnimatedStyle(() => {
    const clock = sceneClock.value
    const settleLift = interpolate(clock, [timeline.settleStart, timeline.settleComplete], [0, 1], Extrapolation.CLAMP)
    const keyframes = [timeline.characterEntranceStart, timeline.characterEntranceComplete, timeline.settleComplete]
    return {
      opacity: entranceProgress.value,
      transform: [
        {
          translateY: interpolate(clock, keyframes, [
            -26,
            ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y + 2,
            ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y
          ], Extrapolation.CLAMP)
        },
        { scale: interpolate(clock, keyframes, [0.58, 1.015, 1], Extrapolation.CLAMP) },
        { translateY: interpolate(settleLift, [0, 0.72, 1], [0, -4, 0]) }
      ]
    }
  })

  return (
    <View
      accessibilityLabel={getCurrentSetupFlowCopy().welcomeHomeAccessibilityLabel}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.root, compact ? styles.rootCompact : null]}
      testID="onboarding-welcome-home-scene"
    >
      <Animated.View style={[styles.cottageLayer, cottageStyle]}>
        <Animated.View style={[styles.doorGlow, doorGlowStyle]} />
        <Animated.View style={[styles.windowGlow, windowGlowStyle]} />
        <Image
          accessibilityIgnoresInvertColors
          fadeDuration={0}
          resizeMode="contain"
          source={WELCOME_COTTAGE}
          style={styles.cottage}
        />
        <Animated.View style={[styles.floorLight, floorLightStyle]} />
      </Animated.View>

      <Animated.View style={[styles.sparkle, styles.sparkleLeft, sparkleLeftStyle]} />
      <Animated.View style={[styles.sparkle, styles.sparkleRight, sparkleRightStyle]} />

      <Animated.View style={[styles.entrancePair, entrancePairStyle]}>
        <OnboardingGreetingPair
          ambientOnly={true}
          entranceVariant="doorway"
          entranceProgress={entranceProgress}
          greetingActive={false}
          motionEnabled={motionEnabled}
          motionPreferenceResolved={motionPreferenceResolved}
          onFinished={ignoreFinished}
          reduceMotion={reduceMotion}
        />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: 388,
    height: 366,
    alignItems: "center",
    justifyContent: "flex-end"
  },
  rootCompact: {
    width: 344,
    height: 326,
    transform: [{ scale: 0.95 }]
  },
  cottageLayer: {
    position: "absolute",
    top: 2,
    width: 378,
    height: 352,
    alignItems: "center",
    justifyContent: "center"
  },
  cottage: {
    position: "absolute",
    width: 378,
    height: 352,
    zIndex: 2
  },
  doorGlow: {
    position: "absolute",
    left: 132,
    top: 84,
    width: 102,
    height: 160,
    borderRadius: 56,
    backgroundColor: "rgba(255,202,116,0.34)",
    shadowColor: "#FFC979",
    shadowOpacity: 0.74,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 1
  },
  windowGlow: {
    position: "absolute",
    right: 52,
    top: 116,
    width: 52,
    height: 76,
    borderRadius: 26,
    backgroundColor: "rgba(255,218,151,0.22)",
    shadowColor: "#FFD99F",
    shadowOpacity: 0.52,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 3
  },
  floorLight: {
    position: "absolute",
    left: 118,
    bottom: 24,
    width: 126,
    height: 62,
    borderRadius: 63,
    backgroundColor: "rgba(255,224,173,0.28)",
    shadowColor: "#FFD89A",
    shadowOpacity: 0.54,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -2 },
    zIndex: 3
  },
  entrancePair: {
    position: "absolute",
    left: 78,
    top: 132,
    width: 232,
    height: 198,
    zIndex: 4
  },
  sparkle: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.94)",
    shadowColor: "#FFD8A2",
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 8
  },
  sparkleLeft: { left: 74, top: 184 },
  sparkleRight: { right: 72, top: 122 }
})
