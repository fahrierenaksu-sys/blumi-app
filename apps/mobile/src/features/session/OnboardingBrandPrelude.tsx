import { useEffect, useRef, useState } from "react"
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native"
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
  recordOnboardingFrameSample
} from "./onboardingIntroTelemetry"

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
  const typingNudge = useRef(new Animated.Value(0)).current
  const typingGlyphReveal = useRef(new Animated.Value(1)).current
  const elapsedMsRef = useRef(initialElapsedMs)
  const progressRef = useRef({ ...initialProgress })
  const didShowActions = useRef(false)
  const didShowSecondaryAction = useRef(false)
  const didFinish = useRef(false)
  const [hasLaidOut, setHasLaidOut] = useState(shouldReduceMotion)
  const [sceneReady, setSceneReady] = useState(shouldReduceMotion)
  const [visibleGreetingText, setVisibleGreetingText] = useState(
    shouldReduceMotion && showGreetingBubble ? greetingText : ""
  )
  const [charactersStarted, setCharactersStarted] = useState(
    shouldReduceMotion || initialElapsedMs >= timeline.characterEntranceStart
  )
  const [greetingPairActive, setGreetingPairActive] = useState(
    shouldReduceMotion && showGreetingBubble
  )

  const captureBeat = (
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
  }

  const capturePerformance = (resumed: boolean) => {
    const nowMs = Date.now()
    const event = getOnboardingIntroPerformanceEvent(telemetry, {
      nowMs,
      reduceMotion: shouldReduceMotion,
      resumed,
      coldStartMs: nowMs - telemetry.startedAtMs
    })
    captureProductEvent(event.name, event.properties)
  }

  const handleLayout = () => {
    setHasLaidOut(true)
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

  // Keep the greeting legible while giving the pair a small, human-feeling
  // introduction. This is deliberately a short, deterministic cue rather
  // than a layout animation: the bubble keeps its width and never reflows the
  // action area while letters arrive.
  useEffect(() => {
    if (!showGreetingBubble) {
      setVisibleGreetingText("")
      typingNudge.stopAnimation()
      typingNudge.setValue(0)
      typingGlyphReveal.stopAnimation()
      typingGlyphReveal.setValue(1)
      return undefined
    }
    if (shouldReduceMotion) {
      setVisibleGreetingText(greetingText)
      typingNudge.setValue(0)
      typingGlyphReveal.setValue(1)
      return undefined
    }

    let index = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    setVisibleGreetingText("")
    typingGlyphReveal.setValue(1)
    const typeNext = () => {
      index += 1
      setVisibleGreetingText(greetingText.slice(0, index))
      typingNudge.stopAnimation()
      typingNudge.setValue(0)
      typingGlyphReveal.setValue(0.78)
      Animated.parallel([
        Animated.sequence([
          Animated.timing(typingNudge, {
            toValue: 1,
            duration: 34,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
            isInteraction: false
          }),
          Animated.timing(typingNudge, {
            toValue: -1,
            duration: 46,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
            isInteraction: false
          }),
          Animated.timing(typingNudge, {
            toValue: 0,
            duration: 64,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
            isInteraction: false
          })
        ]),
        Animated.timing(typingGlyphReveal, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false
        })
      ]).start()
      if (index < greetingText.length) {
        timer = setTimeout(typeNext, 38)
      }
    }
    timer = setTimeout(typeNext, 360)
    return () => {
      if (timer) clearTimeout(timer)
      typingNudge.stopAnimation()
      typingGlyphReveal.stopAnimation()
    }
  }, [greetingText, shouldReduceMotion, showGreetingBubble, typingGlyphReveal, typingNudge])

  useEffect(() => {
    if (sceneReady || !hasLaidOut) return undefined
    const readyId = requestAnimationFrame(() => setSceneReady(true))
    return () => cancelAnimationFrame(readyId)
  }, [hasLaidOut, sceneReady])

  useEffect(() => {
    if (!sceneReady || shouldReduceMotion || !motionEnabled) return undefined
    let frameId = 0
    const sample = () => {
      if (didFinish.current) return
      recordOnboardingFrameSample(telemetry, Date.now())
      frameId = requestAnimationFrame(sample)
    }
    frameId = requestAnimationFrame(sample)
    return () => cancelAnimationFrame(frameId)
  }, [motionEnabled, sceneReady, shouldReduceMotion, telemetry])

  useEffect(() => {
    const subscriptions = [
      scanRows.addListener(({ value }) => { progressRef.current.scanRows = value }),
      scanSweep.addListener(({ value }) => { progressRef.current.scanSweep = value }),
      scanOpacity.addListener(({ value }) => { progressRef.current.scanOpacity = value }),
      brandReveal.addListener(({ value }) => { progressRef.current.brand = value }),
      characterReveal.addListener(({ value }) => { progressRef.current.characters = value })
    ]
    return () => {
      scanRows.removeListener(subscriptions[0])
      scanSweep.removeListener(subscriptions[1])
      scanOpacity.removeListener(subscriptions[2])
      brandReveal.removeListener(subscriptions[3])
      characterReveal.removeListener(subscriptions[4])
    }
  }, [brandReveal, characterReveal, scanOpacity, scanRows, scanSweep])

  useEffect(() => {
    if (!motionPreferenceResolved) return undefined
    if (reduceMotion) {
      scanRows.setValue(1)
      scanSweep.setValue(1)
      scanOpacity.setValue(0)
      brandReveal.setValue(1)
      characterReveal.setValue(1)
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
      delayedTiming(scanRows, 0, timeline.scanRowsComplete, progressRef.current.scanRows, 1, Easing.out(Easing.cubic)),
      delayedTiming(scanSweep, timeline.scanSweepStart, timeline.scanSweepComplete, progressRef.current.scanSweep, 1, Easing.inOut(Easing.cubic)),
      delayedTiming(scanOpacity, timeline.scanDissolveStart, timeline.scanDissolveComplete, 1 - progressRef.current.scanOpacity, 0, Easing.out(Easing.cubic)),
      delayedTiming(brandReveal, timeline.brandRevealStart, timeline.brandRevealComplete, progressRef.current.brand, 1, Easing.out(Easing.back(1.04))),
      delayedTiming(characterReveal, timeline.characterEntranceStart, timeline.characterEntranceComplete, progressRef.current.characters, 1, Easing.out(Easing.back(0.82)))
    ])

    if (!charactersStarted) {
      timers.push(setTimeout(
        () => setCharactersStarted(true),
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
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [brandReveal, characterReveal, charactersStarted, initialElapsedMs, motionEnabled, motionPreferenceResolved, onActionsVisible, onFinished, onSecondaryActionVisible, reduceMotion, scanOpacity, scanRows, scanSweep, sceneReady])

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
                { scale: greetingReveal.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                { translateX: typingNudge.interpolate({ inputRange: [-1, 0, 1], outputRange: [-0.7, 0, 0.7] }) },
                { rotate: typingNudge.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-0.25deg", "0deg", "0.25deg"] }) }
              ]
            }
          ]}
          testID="onboarding-character-greeting"
        >
          <Animated.Text maxFontSizeMultiplier={1.2} style={[styles.greetingText, { opacity: typingGlyphReveal }]}>{visibleGreetingText}</Animated.Text>
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
