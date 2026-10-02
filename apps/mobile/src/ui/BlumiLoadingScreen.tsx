import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { OnboardingScanStage } from "../features/session/OnboardingScanStage"
import { ONBOARDING_SCAN_FRAMES } from "../features/session/OnboardingGreetingPair"
import {
  ONBOARDING_BRAND_PRELUDE_TIMELINE_MS,
  getOnboardingBootDissolvePlan,
  getOnboardingBootGateRemainingMs,
  getOnboardingBootPreludeElapsedMs,
  getOnboardingBootPreludeElapsedSnapshotMs,
  getOnboardingBrandPreludeProgressAtElapsed,
  getOnboardingLoadingScanResume,
  hydrateOnboardingBootPreludeStart,
  markOnboardingBootSurfaceVisible,
  readOnboardingBootSurfaceHandoff,
  shouldReduceOnboardingBootMotion
} from "../features/session/onboardingBrandPreludeModel"
import {
  getNativeOnboardingBootReduceMotion,
  getNativeOnboardingBootStartedAtMs
} from "../features/session/nativeOnboardingBootBridge"
import { SoftBlobBackground } from "./backgrounds"
import { useReducedMotionPreference } from "./animations"
import { animateSegment, animateSequence } from "./motion"
import { getLoadingScreenCopy } from "./loadingScreenCopy"
import { resolveUiLocale } from "./uiLocale"

const timeline = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS

/**
 * Plays the boot scan (rows, then the sweep) on the UI thread from
 * `startElapsedMs` of the shared prelude clock. `holdMs` keeps the sweep
 * resting after both finish; `onComplete` runs once the whole scan has
 * played naturally (never when it is cancelled).
 */
function playScan(
  scanRows: SharedValue<number>,
  scanSweep: SharedValue<number>,
  startElapsedMs: number,
  options: { holdMs?: number; onComplete?: () => void } = {}
): void {
  const rowsMs = Math.max(1, timeline.scanRowsComplete - startElapsedMs)
  const sweepDelayMs = Math.max(0, timeline.scanSweepStart - startElapsedMs)
  const sweepMs = Math.max(
    1,
    timeline.scanSweepComplete - Math.max(timeline.scanSweepStart, startElapsedMs)
  )
  scanRows.value = animateSegment(1, { durationMs: rowsMs, easing: Easing.out(Easing.cubic) })
  const sweep = animateSegment(1, {
    delayMs: sweepDelayMs,
    durationMs: sweepMs,
    easing: Easing.inOut(Easing.cubic)
  })
  const onComplete = options.onComplete
  if (!onComplete) {
    scanSweep.value = sweep
    return
  }
  // The rows and the sweep run side by side; the scan is done when the later
  // of the two has finished and the hold has passed.
  const restMs = Math.max(0, rowsMs - (sweepDelayMs + sweepMs)) + (options.holdMs ?? 0)
  scanSweep.value = animateSequence(
    sweep,
    animateSegment(1, { durationMs: restMs }, (finished) => {
      "worklet"
      if (finished) scheduleOnRN(onComplete)
    })
  )
}

interface BlumiLoadingScreenProps {
  /**
   * Given only while an onboarding prelude waits for this surface. The scan
   * then dissolves here and the callback fires once it has, so the prelude
   * mounts with the characters already gone (its scan sits higher on screen).
   */
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
  const scanRows = useSharedValue(0)
  const scanSweep = useSharedValue(0)
  const scanOpacity = useSharedValue(1)
  const scanStageStyle = useAnimatedStyle(() => ({ opacity: scanOpacity.value }))
  const initialElapsedMs = bootTiming.initialElapsedMs

  useLayoutEffect(() => markOnboardingBootSurfaceVisible(), [])

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
    scanRows.value = shouldReduceMotion ? 1 : initialProgress.scanRows
    scanSweep.value = shouldReduceMotion ? 1 : initialProgress.scanSweep
    setBootTiming({ initialized: true, initialElapsedMs: elapsedMs })
  }, [scanRows, scanSweep, shouldReduceMotion])

  useEffect(() => {
    if (!onPreludeReady) {
      // No prelude takes over (splash, Discover, linking fallback): the scan
      // stays on screen for as long as this surface does.
      scanOpacity.value = 1
      return undefined
    }
    if (!bootTiming.initialized) return undefined
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
    const dissolve = getOnboardingBootDissolvePlan(gateElapsedMs)
    scanOpacity.value = animateSegment(0, {
      delayMs: dissolve.delayMs,
      durationMs: dissolve.durationMs,
      easing: Easing.out(Easing.cubic)
    })
    // The handoff itself is a React state change, so it stays on the JS clock.
    const readyTimer = setTimeout(onPreludeReady, remainingMs)
    return () => {
      clearTimeout(readyTimer)
      cancelAnimation(scanOpacity)
    }
  }, [bootMotionPreferenceResolved, bootTiming.initialized, onPreludeReady, scanOpacity, shouldReduceMotion])

  useEffect(() => {
    if (!bootTiming.initialized) return undefined
    if (shouldReduceMotion) {
      cancelAnimation(scanRows)
      cancelAnimation(scanSweep)
      scanRows.value = 1
      scanSweep.value = 1
      return undefined
    }

    playScan(scanRows, scanSweep, initialElapsedMs)
    return () => {
      cancelAnimation(scanRows)
      cancelAnimation(scanSweep)
    }
  }, [bootTiming.initialized, initialElapsedMs, scanRows, scanSweep, shouldReduceMotion])

  return (
    <View style={styles.root}>
      <SoftBlobBackground animated={false} style={styles.backdrop} variant="register" />
      <Animated.View
        accessibilityLabel={getLoadingScreenCopy(resolveUiLocale()).preparing}
        accessibilityRole="progressbar"
        style={[styles.scanStage, scanStageStyle]}
      >
        <OnboardingScanStage scanRows={scanRows} scanSweep={scanSweep} />
      </Animated.View>
    </View>
  )
}

/**
 * Covers Discover until it is ready. Straight after the boot surface (cold
 * start) it continues the boot scan on the shared clock with the images
 * already on screen; later (sign-in) it plays its own scan once loaded.
 */
export function PreparedDiscoveryLoadingScreen({ onFinished, onError }: {
  onFinished: () => void
  onError: () => void
}) {
  const { reduceMotion, isResolved } = useReducedMotionPreference()
  const nativeReduceMotion = getNativeOnboardingBootReduceMotion()
  const motionResolved = isResolved || nativeReduceMotion !== null
  const reduced = isResolved ? reduceMotion : nativeReduceMotion ?? false
  const [resume] = useState(() => getOnboardingLoadingScanResume({
    nowMs: Date.now(),
    ...readOnboardingBootSurfaceHandoff(),
    bootElapsedMs: getOnboardingBootPreludeElapsedSnapshotMs()
  }))
  const startMs = resume.startElapsedMs
  const [loadedAssets, setLoadedAssets] = useState<readonly number[]>([])
  const requiredAssetCount = ONBOARDING_SCAN_FRAMES.length + 1
  const assetsReady = resume.resumesBootScan || loadedAssets.length === requiredAssetCount
  const startProgress = getOnboardingBrandPreludeProgressAtElapsed(startMs)
  const scanRows = useSharedValue(startProgress.scanRows)
  const scanSweep = useSharedValue(startProgress.scanSweep)
  const completed = useRef(false)
  const onAssetLoad = useCallback((id: number) => {
    if (!Number.isInteger(id) || id < 0 || id >= requiredAssetCount) return
    setLoadedAssets((current) => current.includes(id) ? current : [...current, id])
  }, [requiredAssetCount])

  useEffect(() => {
    if (!assetsReady || !motionResolved || completed.current) return
    if (reduced || startMs >= timeline.scanDissolveComplete) {
      scanRows.value = 1
      scanSweep.value = 1
      completed.current = true
      onFinished()
      return
    }
    let active = true
    const finish = () => {
      if (!active || completed.current) return
      completed.current = true
      onFinished()
    }
    playScan(scanRows, scanSweep, startMs, {
      holdMs: Math.max(0, timeline.scanDissolveComplete - Math.max(timeline.scanSweepComplete, startMs)),
      onComplete: finish
    })
    return () => {
      active = false
      cancelAnimation(scanRows)
      cancelAnimation(scanSweep)
    }
  }, [assetsReady, motionResolved, reduced, onFinished, scanRows, scanSweep, startMs])

  return (
    <View style={styles.root}>
      <SoftBlobBackground animated={false} style={styles.backdrop} variant="register" />
      <View accessibilityLabel={getLoadingScreenCopy(resolveUiLocale()).preparing} accessibilityRole="progressbar"
        style={[styles.scanStage, { opacity: assetsReady && motionResolved ? 1 : 0 }]}>
        <OnboardingScanStage scanRows={scanRows} scanSweep={scanSweep}
          onAssetLoad={onAssetLoad} onAssetError={onError} />
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
