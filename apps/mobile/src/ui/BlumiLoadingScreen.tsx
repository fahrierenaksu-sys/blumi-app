import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Animated, Easing, StyleSheet, View } from "react-native"
import { OnboardingScanStage } from "../features/session/OnboardingScanStage"
import {
  ONBOARDING_BRAND_PRELUDE_TIMELINE_MS,
  getOnboardingBootGateRemainingMs,
  getOnboardingBootPreludeElapsedMs,
  getOnboardingBootPreludeElapsedSnapshotMs,
  getOnboardingBrandPreludeProgressAtElapsed,
  hydrateOnboardingBootPreludeStart,
  shouldReduceOnboardingBootMotion
} from "../features/session/onboardingBrandPreludeModel"
import {
  getNativeOnboardingBootReduceMotion,
  getNativeOnboardingBootStartedAtMs
} from "../features/session/nativeOnboardingBootBridge"
import { SoftBlobBackground } from "./backgrounds"
import { useReducedMotionPreference } from "./animations"

const timeline = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS

interface BlumiLoadingScreenProps {
  onPreludeReady?: () => void
}

export function BlumiLoadingScreen({ onPreludeReady }: BlumiLoadingScreenProps = {}) {
  const {
    reduceMotion,
    isResolved: motionPreferenceResolved
  } = useReducedMotionPreference()
  const nativeReduceMotion = getNativeOnboardingBootReduceMotion()
  const bootMotionPreferenceResolved =
    motionPreferenceResolved || nativeReduceMotion !== null
  const bootReduceMotion = motionPreferenceResolved
    ? reduceMotion
    : nativeReduceMotion ?? reduceMotion
  const shouldReduceMotion = shouldReduceOnboardingBootMotion(
    bootMotionPreferenceResolved,
    bootReduceMotion
  )
  const [bootTiming, setBootTiming] = useState({
    initialized: false,
    initialElapsedMs: 0
  })
  const bootInitializedRef = useRef(false)
  const scanRows = useRef(new Animated.Value(0)).current
  const scanSweep = useRef(new Animated.Value(0)).current
  const initialElapsedMs = bootTiming.initialElapsedMs

  useLayoutEffect(() => {
    if (bootInitializedRef.current) return
    bootInitializedRef.current = true
    const startedAtMs = hydrateOnboardingBootPreludeStart(
      getNativeOnboardingBootStartedAtMs()
    )
    const elapsedMs = getOnboardingBootPreludeElapsedSnapshotMs(
      Date.now(),
      startedAtMs
    )
    const initialProgress = getOnboardingBrandPreludeProgressAtElapsed(elapsedMs)
    scanRows.setValue(shouldReduceMotion ? 1 : initialProgress.scanRows)
    scanSweep.setValue(shouldReduceMotion ? 1 : initialProgress.scanSweep)
    setBootTiming({ initialized: true, initialElapsedMs: elapsedMs })
  }, [scanRows, scanSweep, shouldReduceMotion])

  useEffect(() => {
    if (!bootTiming.initialized) return undefined
    if (!onPreludeReady) return undefined
    if (!bootMotionPreferenceResolved) return undefined
    const gateElapsedMs = getOnboardingBootPreludeElapsedMs()
    const remainingMs = getOnboardingBootGateRemainingMs(
      gateElapsedMs,
      shouldReduceMotion,
      bootMotionPreferenceResolved
    )
    if (remainingMs === null) return undefined
    if (remainingMs === 0) {
      onPreludeReady()
      return undefined
    }
    const readyTimer = setTimeout(onPreludeReady, remainingMs)
    return () => clearTimeout(readyTimer)
  }, [bootMotionPreferenceResolved, bootTiming.initialized, onPreludeReady, shouldReduceMotion])

  useEffect(() => {
    if (!bootTiming.initialized) return undefined
    if (shouldReduceMotion) {
      scanRows.stopAnimation()
      scanSweep.stopAnimation()
      scanRows.setValue(1)
      scanSweep.setValue(1)
      return undefined
    }

    const animation = Animated.parallel([
      Animated.timing(scanRows, {
        toValue: 1,
        duration: Math.max(1, timeline.scanRowsComplete - initialElapsedMs),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false
      }),
      Animated.sequence([
        Animated.delay(Math.max(0, timeline.scanSweepStart - initialElapsedMs)),
        Animated.timing(scanSweep, {
          toValue: 1,
          duration: Math.max(
            1,
            timeline.scanSweepComplete - Math.max(
              timeline.scanSweepStart,
              initialElapsedMs
            )
          ),
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false
        })
      ])
    ])

    animation.start()
    return () => animation.stop()
  }, [bootTiming.initialized, initialElapsedMs, scanRows, scanSweep, shouldReduceMotion])

  return (
    <View style={styles.root}>
      <SoftBlobBackground animated={false} style={styles.backdrop} variant="register" />
      <View
        accessibilityLabel="Blumi hazırlanıyor"
        accessibilityRole="progressbar"
        style={styles.scanStage}
      >
        <OnboardingScanStage scanRows={scanRows} scanSweep={scanSweep} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF6F8",
    overflow: "hidden"
  },
  backdrop: {
    opacity: 0.46
  },
  scanStage: {
    width: 286,
    height: 330,
    alignItems: "center",
    justifyContent: "center"
  }
})
