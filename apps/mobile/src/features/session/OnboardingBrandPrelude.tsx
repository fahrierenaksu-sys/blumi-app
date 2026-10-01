import { useCallback, useEffect, useRef, useState } from "react"
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native"
import Reanimated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming
} from "react-native-reanimated"
import { blumiEntryTheme as uiTheme } from "../../ui/theme"
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
  const scanRows = useRef(new Animated.Value(initialProgress.scanRows)).current
  const scanSweep = useRef(new Animated.Value(initialProgress.scanSweep)).current
  const scanOpacity = useRef(new Animated.Value(initialProgress.scanOpacity)).current
  const brandReveal = useRef(new Animated.Value(initialProgress.brand)).current
  const characterReveal = useRef(new Animated.Value(initialProgress.characters)).current
  const greetingReveal = useRef(new Animated.Value(showGreetingBubble ? 1 : 0)).current
  const homeExit = useRef(new Animated.Value(showGreetingBubble ? 1 : 0)).current
  const greetingPairReveal = useRef(new Animated.Value(showGreetingBubble ? 1 : 0)).current
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
    greetingReveal.stopAnimation()
    homeExit.stopAnimation()
    greetingPairReveal.stopAnimation()
    if (shouldReduceMotion) {
      greetingReveal.setValue(showGreetingBubble ? 1 : 0)
      homeExit.setValue(showGreetingBubble ? 1 : 0)
      greetingPairReveal.setValue(showGreetingBubble ? 1 : 0)
      setGreetingPairActive(showGreetingBubble)
      return undefined
    }
    let activationTimer: ReturnType<typeof setTimeout> | undefined
    if (showGreetingBubble) {
      setGreetingPairActive(false)
      activationTimer = setTimeout(() => setGreetingPairActive(true), 140)
    } else {
      setGreetingPairActive(false)
    }
    const animation = showGreetingBubble
      ? Animated.parallel([
          Animated.timing(homeExit, {
            toValue: 1,
            duration: 300,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
            isInteraction: false
          }),
          Animated.sequence([
            Animated.delay(140),
            Animated.timing(greetingPairReveal, {
              toValue: 1,
              duration: 360,
              easing: Easing.out(Easing.back(0.72)),
              useNativeDriver: true,
              isInteraction: false
            })
          ]),
          Animated.sequence([
            Animated.delay(220),
            Animated.timing(greetingReveal, {
              toValue: 1,
              duration: 280,
              easing: Easing.out(Easing.back(0.76)),
              useNativeDriver: true,
              isInteraction: false
            })
          ])
        ])
      : Animated.parallel([
          Animated.timing(greetingReveal, {
            toValue: 0,
            duration: 150,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
            isInteraction: false
          }),
          Animated.timing(greetingPairReveal, {
            toValue: 0,
            duration: 160,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
            isInteraction: false
          }),
          Animated.timing(homeExit, {
            toValue: 0,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
            isInteraction: false
          })
        ])
    animation.start()
    return () => {
      if (activationTimer) clearTimeout(activationTimer)
      animation.stop()
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
        easing: ReanimatedEasing.linear
      })
    )
  }, [greetingReveal01, greetingText, shouldReduceMotion, showGreetingBubble])

  useEffect(() => {
    if (!motionPreferenceResolved) return undefined
    if (reduceMotion) {
      scanRows.setValue(1)
      scanSweep.setValue(1)
      scanOpacity.setValue(0)
      brandReveal.setValue(1)
      characterReveal.setValue(1)
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
    const delayedTiming = (
      value: Animated.Value,
      startMs: number,
      endMs: number,
      current: number,
      toValue: number,
      easing: (value: number) => number
    ) => Animated.sequence([
      Animated.delay(Math.max(0, startMs - elapsed)),
      Animated.timing(value, {
        toValue,
        duration: remainingDuration(endMs - startMs, current),
        easing,
        useNativeDriver: true,
        isInteraction: false
      })
    ])

    const animation = Animated.parallel([
      delayedTiming(scanRows, 0, timeline.scanRowsComplete, progress.scanRows, 1, Easing.out(Easing.cubic)),
      delayedTiming(scanSweep, timeline.scanSweepStart, timeline.scanSweepComplete, progress.scanSweep, 1, Easing.inOut(Easing.cubic)),
      delayedTiming(scanOpacity, timeline.scanDissolveStart, timeline.scanDissolveComplete, 1 - progress.scanOpacity, 0, Easing.out(Easing.cubic)),
      delayedTiming(brandReveal, timeline.brandRevealStart, timeline.brandRevealComplete, progress.brand, 1, Easing.out(Easing.back(1.04))),
      delayedTiming(characterReveal, timeline.characterEntranceStart, timeline.characterEntranceComplete, progress.characters, 1, Easing.out(Easing.back(0.82)))
    ])

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

    animation.start()
    return () => {
      elapsedMsRef.current = Math.min(timeline.interactive, elapsed + Date.now() - startedAt)
      animation.stop()
      timers.forEach(clearTimeout)
    }
  }, [brandReveal, captureBeat, capturePerformance, characterReveal, initialElapsedMs, motionEnabled, motionPreferenceResolved, onActionsVisible, onFinished, onSecondaryActionVisible, reduceMotion, scanOpacity, scanRows, scanSweep, sceneReady])

  const pairLift = characterReveal.interpolate({
    inputRange: [0, 0.62, 0.82, 1],
    outputRange: [24, -7, 2, 0],
    extrapolate: "clamp"
  })

  return (
    <View accessibilityLabel="Blumi" importantForAccessibility="no-hide-descendants" onLayout={handleLayout} pointerEvents="none" style={[styles.root, compact ? styles.rootCompact : null]} testID="onboarding-brand-prelude">
      <Animated.View style={[styles.scanLayer, { opacity: scanOpacity }]}>
        <OnboardingScanStage scanRows={scanRows} scanSweep={scanSweep} />
      </Animated.View>

      <Animated.View style={[styles.brandLayer, { opacity: brandReveal, transform: [
        { translateY: brandReveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        { scale: brandReveal.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }
      ] }]}>
        <Image accessibilityIgnoresInvertColors fadeDuration={0} resizeMode="contain" source={BLUMI_MARK} style={styles.brandMark} />
        <Text maxFontSizeMultiplier={1.2} style={styles.brandName}>Blumi</Text>
      </Animated.View>

      {showGreetingBubble ? (
        <Animated.View
          style={[
            styles.greetingBubble,
            {
              opacity: greetingReveal,
              transform: [
                { translateY: greetingReveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                { scale: greetingReveal.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }
              ]
            }
          ]}
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
            <Reanimated.View style={[styles.greetingClip, greetingClipStyle]}>
              <Text
                maxFontSizeMultiplier={1.2}
                numberOfLines={1}
                style={[styles.greetingText, { width: greetingWidth }]}
              >
                {greetingText}
              </Text>
            </Reanimated.View>
          </View>
          <View style={styles.greetingTail} />
        </Animated.View>
      ) : null}

      <View style={[styles.pairLayer, { opacity: showCharacters ? 1 : 0 }]}>
        <Animated.View style={[styles.pairStage, { opacity: characterReveal, transform: [
          { translateY: pairLift },
          { scale: characterReveal.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }
        ] }]}>
          <Animated.View style={[styles.homeSceneLayer, {
            opacity: homeExit.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0]
            }),
            transform: [
              {
                translateY: homeExit.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 6]
                })
              },
              {
                scale: homeExit.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.985]
                })
              }
            ]
          }]}>
            <OnboardingWelcomeHomeScene
              compact={compact}
              motionEnabled={motionEnabled}
              motionPreferenceResolved={motionPreferenceResolved}
              reduceMotion={shouldReduceMotion}
            />
          </Animated.View>
          {charactersStarted ? (
            <Animated.View style={[styles.greetingPairLayer, {
              opacity: greetingPairReveal,
              transform: [
                {
                  translateY: greetingPairReveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0]
                  })
                },
                {
                  scale: greetingPairReveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.975, 1]
                  })
                }
              ]
            }]}>
              <View style={styles.pairAura} />
              <OnboardingGreetingPair
                entranceProgress={characterReveal}
                greetingActive={greetingPairActive}
                motionEnabled={motionEnabled}
                motionPreferenceResolved={motionPreferenceResolved}
                onFinished={() => undefined}
                reduceMotion={shouldReduceMotion}
              />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  )
}

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
