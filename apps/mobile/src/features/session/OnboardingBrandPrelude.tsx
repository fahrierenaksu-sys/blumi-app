import { useCallback, useEffect, useRef, useState } from "react"
import { Image, StyleSheet, Text, View } from "react-native"
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { blumiEntryTheme as uiTheme } from "../../ui/theme"
import { animateSegment } from "../../ui/motion"
import { captureProductEvent } from "../../analytics/productAnalytics"
import { OnboardingGreetingPair } from "./OnboardingGreetingPair"
import { OnboardingScanStage } from "./OnboardingScanStage"
import { OnboardingWelcomeHomeScene } from "./OnboardingWelcomeHomeScene"
import { ONBOARDING_GREETING_PAIR_LAYER_BOTTOM_IN_STAGE } from "./onboardingWorldCompositionModel"
import {
  ONBOARDING_BRAND_PRELUDE_TIMELINE_MS as timeline,
  getOnboardingBootPreludeElapsedSnapshotMs,
  getOnboardingBrandPreludeProgressAtElapsed,
  getOnboardingPreludeMountElapsedMs,
  shouldReduceOnboardingBootMotion
} from "./onboardingBrandPreludeModel"
import {
  markOnboardingContentReady
} from "./nativeOnboardingBootBridge"
import {
  createOnboardingIntroTelemetry,
  getOnboardingIntroBeatEvent,
  getOnboardingIntroPerformanceEvent,
  recordOnboardingFrameGaps
} from "./onboardingIntroTelemetry"
import { useOnboardingIntroFrameSampler } from "./onboardingIntroFrameSampler"

/** Typing cadence of the greeting reveal (one clip on the UI thread). */
const GREETING_TYPE_DELAY_MS = 360
const GREETING_TYPE_MS_PER_CHARACTER = 38

const BLUMI_MARK = require("../../../assets/brand/blumi-splash-mark.png")
interface OnboardingBrandPreludeProps {
  compact: boolean
  greetingText: string
  motionEnabled: boolean
  motionPreferenceResolved: boolean
  onActionsVisible: () => void
  onSecondaryActionVisible: () => void
  onFinished: () => void
  reduceMotion: boolean
  showCharacters: boolean
  showGreetingBubble: boolean
}

function remainingDuration(total: number, progress: number): number {
  return Math.max(1, Math.round(total * (1 - Math.max(0, Math.min(1, progress)))))
}

/**
 * One beat of the prelude timeline, resumed from `elapsedMs` of the shared
 * clock: waits until `startMs`, then plays what is left of the beat.
 */
function playBeat(
  value: SharedValue<number>,
  beat: {
    elapsedMs: number
    startMs: number
    endMs: number
    current: number
    toValue: number
    easing: (value: number) => number
  }
): void {
  value.value = animateSegment(beat.toValue, {
    delayMs: Math.max(0, beat.startMs - beat.elapsedMs),
    durationMs: remainingDuration(beat.endMs - beat.startMs, beat.current),
    easing: beat.easing
  })
}

export function OnboardingBrandPrelude({
  compact,
  greetingText,
  motionEnabled,
  motionPreferenceResolved,
  onActionsVisible,
  onSecondaryActionVisible,
  onFinished,
  reduceMotion,
  showCharacters,
  showGreetingBubble
}: OnboardingBrandPreludeProps) {
  const shouldReduceMotion = shouldReduceOnboardingBootMotion(
    motionPreferenceResolved,
    reduceMotion
  )
  const initialElapsedMs = useRef(
    shouldReduceMotion
      ? timeline.interactive
      : getOnboardingPreludeMountElapsedMs(
        getOnboardingBootPreludeElapsedSnapshotMs()
      )
  ).current
  const initialProgress = useRef(
    getOnboardingBrandPreludeProgressAtElapsed(initialElapsedMs)
  ).current
  const telemetry = useRef(
    createOnboardingIntroTelemetry(Date.now() - initialElapsedMs, Date.now())
  ).current
  const scanRows = useSharedValue(initialProgress.scanRows)
  const scanSweep = useSharedValue(initialProgress.scanSweep)
  const scanOpacity = useSharedValue(initialProgress.scanOpacity)
  const brandReveal = useSharedValue(initialProgress.brand)
  const characterReveal = useSharedValue(initialProgress.characters)
  const greetingReveal = useSharedValue(showGreetingBubble ? 1 : 0)
  const homeExit = useSharedValue(showGreetingBubble ? 1 : 0)
  const greetingPairReveal = useSharedValue(showGreetingBubble ? 1 : 0)
  const elapsedMsRef = useRef(initialElapsedMs)
  const didShowActions = useRef(false)
  const didShowSecondaryAction = useRef(false)
  const didFinish = useRef(false)
  // The timeline starts once the prelude has a native layout.
  const [sceneReady, setSceneReady] = useState(shouldReduceMotion)
  const [charactersStarted, setCharactersStarted] = useState(
    shouldReduceMotion || initialElapsedMs >= timeline.characterEntranceStart
  )
  const charactersStartedRef = useRef(charactersStarted)
  const greetingReveal01 = useSharedValue(shouldReduceMotion && showGreetingBubble ? 1 : 0)
  const [greetingWidth, setGreetingWidth] = useState(0)
  const greetingClipStyle = useAnimatedStyle(() => ({
    width: greetingReveal01.value * greetingWidth
  }))
  const readFrameGaps = useOnboardingIntroFrameSampler(
    sceneReady && !shouldReduceMotion && motionEnabled
  )
  const [greetingPairActive, setGreetingPairActive] = useState(
    shouldReduceMotion && showGreetingBubble
  )

  // Stable per motion mode (already a timeline dependency via its inputs).
  const captureBeat = useCallback((
    beat: "scan" | "brand" | "characters" | "actions" | "world",
    resumed: boolean
  ) => {
    const event = getOnboardingIntroBeatEvent(telemetry, {
      beat,
      nowMs: Date.now(),
      reduceMotion: shouldReduceMotion,
      resumed
    })
    if (event) captureProductEvent(event.name, event.properties)
  }, [shouldReduceMotion, telemetry])

  const capturePerformance = useCallback((resumed: boolean) => {
    const nowMs = Date.now()
    // Frame gaps arrive from the UI thread once; the timing is read now.
    readFrameGaps((gaps) => {
      recordOnboardingFrameGaps(telemetry, gaps)
      const event = getOnboardingIntroPerformanceEvent(telemetry, {
        nowMs,
        reduceMotion: shouldReduceMotion,
        resumed,
        coldStartMs: nowMs - telemetry.startedAtMs
      })
      captureProductEvent(event.name, event.properties)
    })
  }, [readFrameGaps, shouldReduceMotion, telemetry])

  const handleLayout = () => {
    setSceneReady(true)
    markOnboardingContentReady()
  }

  useEffect(() => {
    cancelAnimation(greetingReveal)
    cancelAnimation(homeExit)
    cancelAnimation(greetingPairReveal)
    if (shouldReduceMotion) {
      greetingReveal.value = showGreetingBubble ? 1 : 0
      homeExit.value = showGreetingBubble ? 1 : 0
      greetingPairReveal.value = showGreetingBubble ? 1 : 0
      setGreetingPairActive(showGreetingBubble)
      return undefined
    }
    let activationTimer: ReturnType<typeof setTimeout> | undefined
    if (showGreetingBubble) {
      setGreetingPairActive(false)
      // Cues the wave in the pair (React state), as the pair starts to rise.
      activationTimer = setTimeout(() => setGreetingPairActive(true), 140)
      homeExit.value = animateSegment(1, { durationMs: 300, easing: Easing.inOut(Easing.cubic) })
      greetingPairReveal.value = animateSegment(1, {
        delayMs: 140,
        durationMs: 360,
        easing: Easing.out(Easing.back(0.72))
      })
      greetingReveal.value = animateSegment(1, {
        delayMs: 220,
        durationMs: 280,
        easing: Easing.out(Easing.back(0.76))
      })
    } else {
      setGreetingPairActive(false)
      greetingReveal.value = animateSegment(0, { durationMs: 150, easing: Easing.in(Easing.quad) })
      greetingPairReveal.value = animateSegment(0, { durationMs: 160, easing: Easing.in(Easing.quad) })
      homeExit.value = animateSegment(0, { durationMs: 240, easing: Easing.out(Easing.cubic) })
    }
    return () => {
      if (activationTimer) clearTimeout(activationTimer)
      cancelAnimation(greetingReveal)
      cancelAnimation(homeExit)
      cancelAnimation(greetingPairReveal)
    }
  }, [greetingPairReveal, greetingReveal, homeExit, shouldReduceMotion, showGreetingBubble])

  // The greeting is laid out once at full width and revealed by one clip
  // that grows on the UI thread: no per-letter React render and no bubble
  // jitter while letters arrive (ONB-03).
  useEffect(() => {
    if (!showGreetingBubble) {
      greetingReveal01.value = 0
      return
    }
    if (shouldReduceMotion) {
      greetingReveal01.value = 1
      return
    }
    greetingReveal01.value = 0
    greetingReveal01.value = withDelay(
      GREETING_TYPE_DELAY_MS,
      withTiming(1, {
        duration: Math.max(1, greetingText.length * GREETING_TYPE_MS_PER_CHARACTER),
        easing: Easing.linear
      })
    )
  }, [greetingReveal01, greetingText, shouldReduceMotion, showGreetingBubble])

  useEffect(() => {
    if (!motionPreferenceResolved) return undefined
    if (reduceMotion) {
      scanRows.value = 1
      scanSweep.value = 1
      scanOpacity.value = 0
      brandReveal.value = 1
      characterReveal.value = 1
      charactersStartedRef.current = true
      setCharactersStarted(true)
      captureBeat("scan", false)
      captureBeat("brand", false)
      captureBeat("characters", false)
      captureBeat("actions", false)
      if (!didShowActions.current) {
        didShowActions.current = true
        onActionsVisible()
      }
      if (!didShowSecondaryAction.current) {
        didShowSecondaryAction.current = true
        onSecondaryActionVisible()
      }
      if (!didFinish.current) {
        didFinish.current = true
        capturePerformance(false)
        onFinished()
      }
      return undefined
    }
    if (!motionEnabled || !sceneReady) return undefined

    const elapsed = elapsedMsRef.current
    // Progress comes from the shared clock, not from per-frame value
    // listeners that copied every native frame back to JS (ONB-03).
    const progress = getOnboardingBrandPreludeProgressAtElapsed(elapsed)
    const startedAt = Date.now()
    const timers: ReturnType<typeof setTimeout>[] = []
    const resumed = elapsed > initialElapsedMs + 20

    // The motion runs on the UI thread; only the beats that change React
    // state (mounting the pair, actions, telemetry) are JS timers.
    playBeat(scanRows, { elapsedMs: elapsed, startMs: 0, endMs: timeline.scanRowsComplete, current: progress.scanRows, toValue: 1, easing: Easing.out(Easing.cubic) })
    playBeat(scanSweep, { elapsedMs: elapsed, startMs: timeline.scanSweepStart, endMs: timeline.scanSweepComplete, current: progress.scanSweep, toValue: 1, easing: Easing.inOut(Easing.cubic) })
    playBeat(scanOpacity, { elapsedMs: elapsed, startMs: timeline.scanDissolveStart, endMs: timeline.scanDissolveComplete, current: 1 - progress.scanOpacity, toValue: 0, easing: Easing.out(Easing.cubic) })
    playBeat(brandReveal, { elapsedMs: elapsed, startMs: timeline.brandRevealStart, endMs: timeline.brandRevealComplete, current: progress.brand, toValue: 1, easing: Easing.out(Easing.back(1.04)) })
    playBeat(characterReveal, { elapsedMs: elapsed, startMs: timeline.characterEntranceStart, endMs: timeline.characterEntranceComplete, current: progress.characters, toValue: 1, easing: Easing.out(Easing.back(0.82)) })

    if (!charactersStartedRef.current) {
      timers.push(setTimeout(
        () => {
          charactersStartedRef.current = true
          setCharactersStarted(true)
        },
        Math.max(0, timeline.characterEntranceStart - elapsed)
      ))
    }
    captureBeat("scan", resumed)
    timers.push(setTimeout(
      () => captureBeat("brand", resumed),
      Math.max(0, timeline.brandRevealStart - elapsed)
    ))
    timers.push(setTimeout(
      () => captureBeat("characters", resumed),
      Math.max(0, timeline.characterEntranceStart - elapsed)
    ))
    if (!didShowActions.current) {
      timers.push(setTimeout(() => {
        didShowActions.current = true
        captureBeat("actions", resumed)
        onActionsVisible()
      }, Math.max(0, timeline.primaryCtaStart - elapsed)))
    }
    if (!didShowSecondaryAction.current) {
      timers.push(setTimeout(() => {
        didShowSecondaryAction.current = true
        onSecondaryActionVisible()
      }, Math.max(0, timeline.secondaryCtaStart - elapsed)))
    }
    if (!didFinish.current) {
      timers.push(setTimeout(() => {
        didFinish.current = true
        capturePerformance(resumed)
        onFinished()
      }, Math.max(0, timeline.interactive - elapsed)))
    }

    return () => {
      elapsedMsRef.current = Math.min(timeline.interactive, elapsed + Date.now() - startedAt)
      cancelAnimation(scanRows)
      cancelAnimation(scanSweep)
      cancelAnimation(scanOpacity)
      cancelAnimation(brandReveal)
      cancelAnimation(characterReveal)
      timers.forEach(clearTimeout)
    }
  }, [brandReveal, captureBeat, capturePerformance, characterReveal, initialElapsedMs, motionEnabled, motionPreferenceResolved, onActionsVisible, onFinished, onSecondaryActionVisible, reduceMotion, scanOpacity, scanRows, scanSweep, sceneReady])

  const scanLayerStyle = useAnimatedStyle(() => ({ opacity: scanOpacity.value }))
  const brandStyle = useAnimatedStyle(() => ({
    opacity: brandReveal.value,
    transform: [
      { translateY: interpolate(brandReveal.value, [0, 1], [12, 0]) },
      { scale: interpolate(brandReveal.value, [0, 1], [0.94, 1]) }
    ]
  }))
  const greetingBubbleStyle = useAnimatedStyle(() => ({
    opacity: greetingReveal.value,
    transform: [
      { translateY: interpolate(greetingReveal.value, [0, 1], [10, 0]) },
      { scale: interpolate(greetingReveal.value, [0, 1], [0.96, 1]) }
    ]
  }))
  const pairStageStyle = useAnimatedStyle(() => ({
    opacity: characterReveal.value,
    transform: [
      { translateY: interpolate(characterReveal.value, [0, 0.62, 0.82, 1], [24, -7, 2, 0], Extrapolation.CLAMP) },
      { scale: interpolate(characterReveal.value, [0, 1], [0.9, 1]) }
    ]
  }))
  const homeSceneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(homeExit.value, [0, 1], [1, 0]),
    transform: [
      { translateY: interpolate(homeExit.value, [0, 1], [0, 6]) },
      { scale: interpolate(homeExit.value, [0, 1], [1, 0.985]) }
    ]
  }))
  const greetingPairStyle = useAnimatedStyle(() => ({
    opacity: greetingPairReveal.value,
    transform: [
      { translateY: interpolate(greetingPairReveal.value, [0, 1], [10, 0]) },
      { scale: interpolate(greetingPairReveal.value, [0, 1], [0.975, 1]) }
    ]
  }))

  return (
    <View accessibilityLabel="Blumi" importantForAccessibility="no-hide-descendants" onLayout={handleLayout} pointerEvents="none" style={[styles.root, compact ? styles.rootCompact : null]} testID="onboarding-brand-prelude">
      <Animated.View style={[styles.scanLayer, scanLayerStyle]}>
        <OnboardingScanStage scanRows={scanRows} scanSweep={scanSweep} />
      </Animated.View>

      <Animated.View style={[styles.brandLayer, brandStyle]}>
        <Image accessibilityIgnoresInvertColors fadeDuration={0} resizeMode="contain" source={BLUMI_MARK} style={styles.brandMark} />
        <Text maxFontSizeMultiplier={1.2} style={styles.brandName}>Blumi</Text>
      </Animated.View>

      {showGreetingBubble ? (
        <Animated.View
          style={[styles.greetingBubble, greetingBubbleStyle]}
          testID="onboarding-character-greeting"
        >
          <View>
            <Text
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              onLayout={(event) => setGreetingWidth(Math.ceil(event.nativeEvent.layout.width))}
              style={[styles.greetingText, styles.greetingTextSpacer]}
            >
              {greetingText}
            </Text>
            <Animated.View style={[styles.greetingClip, greetingClipStyle]}>
              <Text
                maxFontSizeMultiplier={1.2}
                numberOfLines={1}
                style={[styles.greetingText, { width: greetingWidth }]}
              >
                {greetingText}
              </Text>
            </Animated.View>
          </View>
          <View style={styles.greetingTail} />
        </Animated.View>
      ) : null}

      <View style={[styles.pairLayer, { opacity: showCharacters ? 1 : 0 }]}>
        <Animated.View style={[styles.pairStage, pairStageStyle]}>
          <Animated.View style={[styles.homeSceneLayer, homeSceneStyle]}>
            <OnboardingWelcomeHomeScene
              compact={compact}
              motionEnabled={motionEnabled}
              motionPreferenceResolved={motionPreferenceResolved}
              reduceMotion={shouldReduceMotion}
            />
          </Animated.View>
          {charactersStarted ? (
            <Animated.View style={[styles.greetingPairLayer, greetingPairStyle]}>
              <View style={styles.pairAura} />
              <OnboardingGreetingPair
                entranceProgress={characterReveal}
                greetingActive={greetingPairActive}
                motionEnabled={motionEnabled}
                motionPreferenceResolved={motionPreferenceResolved}
                onFinished={ignoreFinished}
                reduceMotion={shouldReduceMotion}
              />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  )
}

const ignoreFinished = () => undefined

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  rootCompact: { transform: [{ scale: 0.92 }] },
  scanLayer: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  brandLayer: { position: "absolute", top: "23%", alignItems: "center", gap: 8 },
  brandMark: { width: 62, height: 62 },
  brandName: { ...uiTheme.font.display, color: uiTheme.colors.textPrimary, letterSpacing: -1.5 },
  pairLayer: { width: 382, height: 398, alignItems: "center", justifyContent: "flex-end" },
  pairStage: { width: 374, height: 354, alignItems: "center", justifyContent: "flex-end" },
  homeSceneLayer: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "flex-end" },
  greetingPairLayer: {
    position: "absolute",
    // Match the approved world-flip anchor without moving the flip itself.
    bottom: ONBOARDING_GREETING_PAIR_LAYER_BOTTOM_IN_STAGE,
    width: 320,
    height: 244,
    alignItems: "center",
    justifyContent: "flex-end"
  },
  pairAura: { position: "absolute", bottom: 12, width: 260, height: 172, borderRadius: 130, backgroundColor: "rgba(255,198,218,0.22)" },
  greetingBubble: {
    position: "absolute",
    top: "43%",
    width: 268,
    minWidth: 236,
    maxWidth: 286,
    minHeight: 66,
    paddingHorizontal: 22,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(116,76,99,0.16)",
    backgroundColor: "rgba(255,255,255,0.94)",
    shadowColor: "#7B5268",
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    zIndex: 12
  },
  greetingText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  greetingTextSpacer: { opacity: 0 },
  greetingClip: { position: "absolute", top: 0, bottom: 0, left: 0, overflow: "hidden" },
  greetingTail: {
    position: "absolute",
    bottom: -8,
    width: 16,
    height: 16,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(116,76,99,0.16)",
    transform: [{ rotate: "45deg" }]
  }
})
