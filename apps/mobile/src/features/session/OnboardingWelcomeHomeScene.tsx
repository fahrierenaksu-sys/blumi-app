import { useEffect, useRef, useState } from "react"
import { Animated, Easing, Image, StyleSheet, View } from "react-native"
import { OnboardingGreetingPair } from "./OnboardingGreetingPair"
import { ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y } from "./onboardingWorldCompositionModel"
import {
  ONBOARDING_WELCOME_HOME_TIMELINE_MS as timeline,
  getOnboardingWelcomeHomeProgressAtElapsed
} from "./onboardingWelcomeHomeModel"

const WELCOME_COTTAGE = require("./assets/onboarding-welcome-home-v1-candidate/blumi_welcome_cottage_v1.png")

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
  const sceneClock = useRef(new Animated.Value(
    shouldReduceMotion ? timeline.settled : 0
  )).current
  const lightPulse = useRef(new Animated.Value(0)).current
  const elapsedMsRef = useRef(shouldReduceMotion ? timeline.settled : 0)
  const [isSettled, setIsSettled] = useState(shouldReduceMotion)

  useEffect(() => {
    if (!motionPreferenceResolved) return undefined
    if (reduceMotion) {
      sceneClock.setValue(timeline.settled)
      elapsedMsRef.current = timeline.settled
      setIsSettled(true)
      return undefined
    }
    if (!motionEnabled || elapsedMsRef.current >= timeline.settled) return undefined

    const startedAt = Date.now()
    const remainingMs = timeline.settled - elapsedMsRef.current
    const animation = Animated.timing(sceneClock, {
      toValue: timeline.settled,
      duration: remainingMs,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false
    })
    animation.start(({ finished }) => {
      if (!finished) return
      elapsedMsRef.current = timeline.settled
      setIsSettled(true)
    })

    return () => {
      elapsedMsRef.current = Math.min(
        timeline.settled,
        elapsedMsRef.current + Date.now() - startedAt
      )
      animation.stop()
    }
  }, [motionEnabled, motionPreferenceResolved, reduceMotion, sceneClock])

  useEffect(() => {
    if (!motionEnabled || reduceMotion || !isSettled) {
      lightPulse.stopAnimation()
      return undefined
    }

    const lightLoop = Animated.loop(Animated.sequence([
      Animated.timing(lightPulse, {
        toValue: 1,
        duration: 1_800,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
        isInteraction: false
      }),
      Animated.timing(lightPulse, {
        toValue: 0,
        duration: 2_050,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
        isInteraction: false
      })
    ]))
    lightLoop.start()
    return () => {
      lightLoop.stop()
    }
  }, [isSettled, lightPulse, motionEnabled, reduceMotion])

  const progress = getOnboardingWelcomeHomeProgressAtElapsed(
    shouldReduceMotion ? timeline.settled : elapsedMsRef.current,
    shouldReduceMotion
  )
  const houseOpacity = sceneClock.interpolate({
    inputRange: [timeline.houseRevealStart, timeline.houseRevealComplete],
    outputRange: [progress.house, 1],
    extrapolate: "clamp"
  })
  const doorLightOpacity = sceneClock.interpolate({
    inputRange: [timeline.doorLightStart, timeline.doorLightComplete],
    outputRange: [progress.doorLight, 1],
    extrapolate: "clamp"
  })
  const entranceOpacity = sceneClock.interpolate({
    inputRange: [timeline.characterEntranceStart, timeline.characterEntranceComplete],
    outputRange: [0, 1],
    extrapolate: "clamp"
  })
  const entranceProgress = sceneClock.interpolate({
    inputRange: [timeline.characterEntranceStart, timeline.characterEntranceComplete],
    outputRange: [0, 1],
    extrapolate: "clamp"
  })
  const settleLift = sceneClock.interpolate({
    inputRange: [timeline.settleStart, timeline.settleComplete],
    outputRange: [0, 1],
    extrapolate: "clamp"
  })

  return (
    <View
      accessibilityLabel="Sıcak Blumi evinin önünde canlı karakterler"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.root, compact ? styles.rootCompact : null]}
      testID="onboarding-welcome-home-scene"
    >
      <Animated.View
        style={[
          styles.cottageLayer,
          {
            opacity: houseOpacity,
            transform: [
              {
                translateY: sceneClock.interpolate({
                  inputRange: [0, 190, timeline.houseRevealComplete],
                  outputRange: [20, -4, 0],
                  extrapolate: "clamp"
                })
              },
              {
                scale: sceneClock.interpolate({
                  inputRange: [0, 210, timeline.houseRevealComplete],
                  outputRange: [0.92, 1.018, 1],
                  extrapolate: "clamp"
                })
              }
            ]
          }
        ]}
      >
        <Animated.View
          style={[
            styles.doorGlow,
            {
              opacity: Animated.multiply(
                doorLightOpacity,
                lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0.96] })
              ),
              transform: [
                {
                  scale: lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.1] })
                }
              ]
            }
          ]}
        />
        <Animated.View
          style={[
            styles.windowGlow,
            {
              opacity: Animated.multiply(
                doorLightOpacity,
                lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.54] })
              )
            }
          ]}
        />
        <Image
          accessibilityIgnoresInvertColors
          fadeDuration={0}
          resizeMode="contain"
          source={WELCOME_COTTAGE}
          style={styles.cottage}
        />
        <Animated.View
          style={[
            styles.floorLight,
            {
              opacity: Animated.multiply(
                doorLightOpacity,
                lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.44] })
              ),
              transform: [
                {
                  scaleX: lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] })
                },
                {
                  scaleY: lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.03] })
                }
              ]
            }
          ]}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sparkle,
          styles.sparkleLeft,
          {
            opacity: Animated.multiply(
              doorLightOpacity,
              lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.68] })
            ),
            transform: [
              { rotate: "45deg" },
              {
                scale: lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.56, 1] })
              }
            ]
          }
        ]}
      />
      <Animated.View
        style={[
          styles.sparkle,
          styles.sparkleRight,
          {
            opacity: Animated.multiply(
              doorLightOpacity,
              lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.66, 0.18] })
            ),
            transform: [
              { rotate: "45deg" },
              {
                scale: lightPulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 0.54] })
              }
            ]
          }
        ]}
      />

      <Animated.View
        style={[
          styles.entrancePair,
          {
            opacity: entranceOpacity,
            transform: [
              {
                translateY: sceneClock.interpolate({
                  inputRange: [
                    timeline.characterEntranceStart,
                    timeline.characterEntranceComplete,
                    timeline.settleComplete
                  ],
                  outputRange: [
                    -26,
                    ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y + 2,
                    ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y
                  ],
                  extrapolate: "clamp"
                })
              },
              {
                scale: sceneClock.interpolate({
                  inputRange: [
                    timeline.characterEntranceStart,
                    timeline.characterEntranceComplete,
                    timeline.settleComplete
                  ],
                  outputRange: [0.58, 1.015, 1],
                  extrapolate: "clamp"
                })
              },
              {
                translateY: settleLift.interpolate({
                  inputRange: [0, 0.72, 1],
                  outputRange: [0, -4, 0]
                })
              }
            ]
          }
        ]}
      >
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
