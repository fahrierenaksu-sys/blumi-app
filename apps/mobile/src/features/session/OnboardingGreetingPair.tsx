import { useEffect, useRef, useState } from "react"
import { Animated, Easing, Image, StyleSheet, View } from "react-native"
import { ONBOARDING_RUN_ASSET_MODE } from "../../config/env"
import { ONBOARDING_BRAND_PRELUDE_TIMELINE_MS } from "./onboardingBrandPreludeModel"
import { APPROVED_ONBOARDING_RUN_ASSETS } from "./onboardingRunApprovedAssetCatalog"
import { getOnboardingRunAssetSet } from "./onboardingRunAssetCatalog"
import {
  ONBOARDING_GREETING_WAVE_SEQUENCE,
  getOnboardingWaveAssetFrameAtElapsed,
  getOnboardingWaveFrameTimestampMs
} from "./onboardingGreetingPairModel"

interface OnboardingGreetingPairProps {
  ambientOnly?: boolean
  entranceVariant?: "default" | "doorway"
  entranceProgress?: Animated.Value | Animated.AnimatedInterpolation<number>
  interactionProgress?: Animated.Value | Animated.AnimatedInterpolation<number>
  greetingActive: boolean
  motionEnabled: boolean
  motionPreferenceResolved: boolean
  reduceMotion: boolean
  onFinished: () => void
}

const SELECTED_ONBOARDING_RUN_ASSETS =
  ONBOARDING_RUN_ASSET_MODE === "candidate"
    ? getOnboardingRunAssetSet("candidate")
    : APPROVED_ONBOARDING_RUN_ASSETS
const FEMALE_WAVE_FRAMES = SELECTED_ONBOARDING_RUN_ASSETS.wave.female
const MALE_WAVE_FRAMES = SELECTED_ONBOARDING_RUN_ASSETS.wave.male
const WAVE_FRAME_DURATION_MS = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.waveFrameDuration
export const MALE_WAVE_OFFSET_MS = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.maleWaveOffset
export const ONBOARDING_IDLE_PHASE_OFFSET_MS = 360
export const ONBOARDING_IDLE_BREATH_DURATION_MS = 2_800
export const ONBOARDING_IDLE_WEIGHT_DURATION_MS = 7_600
export const ONBOARDING_HERO_FRAME = FEMALE_WAVE_FRAMES.at(-1)!
export const ONBOARDING_MALE_HERO_FRAME = MALE_WAVE_FRAMES.at(-1)!
export const ONBOARDING_SCAN_FRAMES = [
  MALE_WAVE_FRAMES[0],
  FEMALE_WAVE_FRAMES[0],
  MALE_WAVE_FRAMES[2],
  FEMALE_WAVE_FRAMES[2],
  MALE_WAVE_FRAMES[5],
  FEMALE_WAVE_FRAMES[5]
] as const

function scheduleAmbientSpriteLoop(input: {
  initialDelayMs: number
  repeatDelayMs: number
  showFrame: (assetFrame: number) => void
}): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const cycleDurationMs = ONBOARDING_GREETING_WAVE_SEQUENCE.length * WAVE_FRAME_DURATION_MS
  let cancelled = false

  const schedule = (callback: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (!cancelled) callback()
    }, delayMs)
    timers.add(timer)
  }

  const play = () => {
    ONBOARDING_GREETING_WAVE_SEQUENCE.forEach((assetFrame, sequencePosition) => {
      schedule(
        () => input.showFrame(assetFrame),
        sequencePosition * WAVE_FRAME_DURATION_MS
      )
    })
    schedule(play, cycleDurationMs + input.repeatDelayMs)
  }

  schedule(play, input.initialDelayMs)
  return () => {
    cancelled = true
    timers.forEach(clearTimeout)
    timers.clear()
  }
}

export function OnboardingGreetingPair({
  ambientOnly = false,
  entranceVariant = "default",
  entranceProgress,
  interactionProgress,
  greetingActive,
  motionEnabled,
  motionPreferenceResolved,
  reduceMotion,
  onFinished
}: OnboardingGreetingPairProps) {
  const [femaleWaveFrame, setFemaleWaveFrame] = useState(
    reduceMotion || ambientOnly ? FEMALE_WAVE_FRAMES.length - 1 : 0
  )
  const [maleWaveFrame, setMaleWaveFrame] = useState(
    reduceMotion || ambientOnly ? MALE_WAVE_FRAMES.length - 1 : 0
  )
  const [isIdle, setIsIdle] = useState(reduceMotion || ambientOnly)
  const femaleIdle = useRef(new Animated.Value(0)).current
  const maleIdle = useRef(new Animated.Value(0)).current
  const femaleWeightShift = useRef(new Animated.Value(0)).current
  const maleWeightShift = useRef(new Animated.Value(0)).current
  const settledEntrance = useRef(new Animated.Value(1)).current
  const settledInteraction = useRef(new Animated.Value(0)).current
  const femaleWaveFrameRef = useRef(femaleWaveFrame)
  const maleWaveFrameRef = useRef(maleWaveFrame)
  const waveElapsedMsRef = useRef(0)
  const previousGreetingActive = useRef(greetingActive)

  const showFemaleFrame = (index: number) => {
    femaleWaveFrameRef.current = index
    setFemaleWaveFrame(index)
  }
  const showMaleFrame = (index: number) => {
    maleWaveFrameRef.current = index
    setMaleWaveFrame(index)
  }

  useEffect(() => {
    const greetingJustOpened = greetingActive && !previousGreetingActive.current
    previousGreetingActive.current = greetingActive
    if (!greetingJustOpened || reduceMotion || ambientOnly) return
    waveElapsedMsRef.current = 0
    showFemaleFrame(0)
    showMaleFrame(0)
    setIsIdle(false)
  }, [ambientOnly, greetingActive, reduceMotion])

  useEffect(() => {
    if (!motionPreferenceResolved) return undefined
    if (reduceMotion || ambientOnly) {
      showFemaleFrame(FEMALE_WAVE_FRAMES.length - 1)
      showMaleFrame(MALE_WAVE_FRAMES.length - 1)
      setIsIdle(true)
      const finishedId = setTimeout(onFinished, 0)
      return () => clearTimeout(finishedId)
    }
    if (!motionEnabled) return undefined

    const timers: ReturnType<typeof setTimeout>[] = []
    const startedAt = Date.now()
    const elapsedMs = waveElapsedMsRef.current
    const femaleElapsedFrame = getOnboardingWaveAssetFrameAtElapsed({
      elapsedMs,
      frameDurationMs: WAVE_FRAME_DURATION_MS
    })
    const maleElapsedFrame = getOnboardingWaveAssetFrameAtElapsed({
      elapsedMs,
      frameDurationMs: WAVE_FRAME_DURATION_MS,
      startOffsetMs: MALE_WAVE_OFFSET_MS
    })
    if (femaleElapsedFrame !== femaleWaveFrameRef.current) {
      showFemaleFrame(femaleElapsedFrame)
    }
    if (maleElapsedFrame !== maleWaveFrameRef.current) {
      showMaleFrame(maleElapsedFrame)
    }

    ONBOARDING_GREETING_WAVE_SEQUENCE.forEach((assetFrame, sequencePosition) => {
      if (sequencePosition === 0) return
      const cueAtMs = getOnboardingWaveFrameTimestampMs({
        frameIndex: sequencePosition,
        frameDurationMs: WAVE_FRAME_DURATION_MS
      })
      if (cueAtMs <= elapsedMs) return
      timers.push(setTimeout(
        () => showFemaleFrame(assetFrame),
        cueAtMs - elapsedMs
      ))
    })
    ONBOARDING_GREETING_WAVE_SEQUENCE.forEach((assetFrame, sequencePosition) => {
      if (sequencePosition === 0) return
      const cueAtMs = getOnboardingWaveFrameTimestampMs({
        frameIndex: sequencePosition,
        frameDurationMs: WAVE_FRAME_DURATION_MS,
        startOffsetMs: MALE_WAVE_OFFSET_MS
      })
      if (cueAtMs <= elapsedMs) return
      timers.push(setTimeout(
        () => showMaleFrame(assetFrame),
        cueAtMs - elapsedMs
      ))
    })
    const femaleRemaining = getOnboardingWaveFrameTimestampMs({
      frameIndex: ONBOARDING_GREETING_WAVE_SEQUENCE.length - 1,
      frameDurationMs: WAVE_FRAME_DURATION_MS
    })
    const maleRemaining = getOnboardingWaveFrameTimestampMs({
      frameIndex: ONBOARDING_GREETING_WAVE_SEQUENCE.length - 1,
      frameDurationMs: WAVE_FRAME_DURATION_MS,
      startOffsetMs: MALE_WAVE_OFFSET_MS
    })
    timers.push(setTimeout(() => {
      setIsIdle(true)
      onFinished()
    }, Math.max(0, Math.max(femaleRemaining, maleRemaining) + WAVE_FRAME_DURATION_MS - elapsedMs)))
    return () => {
      waveElapsedMsRef.current += Date.now() - startedAt
      timers.forEach(clearTimeout)
    }
  }, [ambientOnly, greetingActive, motionEnabled, motionPreferenceResolved, onFinished, reduceMotion])

  useEffect(() => {
    if (ambientOnly || !motionEnabled || reduceMotion || !isIdle) return undefined
    const stopFemaleAmbient = scheduleAmbientSpriteLoop({
      initialDelayMs: 2_600,
      repeatDelayMs: 7_100,
      showFrame: showFemaleFrame
    })
    const stopMaleAmbient = scheduleAmbientSpriteLoop({
      initialDelayMs: 4_300,
      repeatDelayMs: 8_300,
      showFrame: showMaleFrame
    })
    return () => {
      stopFemaleAmbient()
      stopMaleAmbient()
    }
  }, [ambientOnly, isIdle, motionEnabled, reduceMotion])

  useEffect(() => {
    if (!motionEnabled || reduceMotion || !isIdle) {
      femaleIdle.stopAnimation()
      maleIdle.stopAnimation()
      femaleWeightShift.stopAnimation()
      maleWeightShift.stopAnimation()
      return undefined
    }
    const breath = (value: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration: ONBOARDING_IDLE_BREATH_DURATION_MS / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: ONBOARDING_IDLE_BREATH_DURATION_MS / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false
        })
      ])
    )
    const femaleLoop = breath(femaleIdle, 0)
    const maleLoop = breath(maleIdle, ONBOARDING_IDLE_PHASE_OFFSET_MS)
    const weightShift = (value: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration: ONBOARDING_IDLE_WEIGHT_DURATION_MS * 0.32,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false
        }),
        Animated.delay(620),
        Animated.timing(value, {
          toValue: 0,
          duration: ONBOARDING_IDLE_WEIGHT_DURATION_MS * 0.28,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false
        }),
        Animated.delay(1_100)
      ])
    )
    const femaleWeightLoop = weightShift(femaleWeightShift, 540)
    const maleWeightLoop = weightShift(maleWeightShift, 1_180)
    femaleLoop.start()
    maleLoop.start()
    femaleWeightLoop.start()
    maleWeightLoop.start()
    return () => {
      femaleLoop.stop()
      maleLoop.stop()
      femaleWeightLoop.stop()
      maleWeightLoop.stop()
    }
  }, [
    femaleIdle,
    femaleWeightShift,
    isIdle,
    maleIdle,
    maleWeightShift,
    motionEnabled,
    reduceMotion
  ])

  const femaleSource = FEMALE_WAVE_FRAMES[femaleWaveFrame]
  const maleSource = MALE_WAVE_FRAMES[maleWaveFrame]
  const entrance = entranceProgress ?? settledEntrance
  const interaction = interactionProgress ?? settledInteraction
  const useDoorwayEntrance = entranceVariant === "doorway"
  const femaleEntrance = entrance.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 0, 1],
    extrapolate: "clamp"
  })
  const maleEntrance = entrance.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0, 1],
    extrapolate: "clamp"
  })

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.pair}
    >
      <Animated.View style={{ opacity: maleEntrance, transform: [
        {
          translateX: maleEntrance.interpolate({
            inputRange: useDoorwayEntrance ? [0, 0.38, 0.74, 1] : [0, 0.68, 1],
            outputRange: useDoorwayEntrance ? [18, -12, -3, 0] : [48, -4, 0]
          })
        },
        { translateX: maleWeightShift.interpolate({ inputRange: [0, 1], outputRange: [0, -1.8] }) },
        { translateX: interaction.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
        {
          translateY: maleEntrance.interpolate({
            inputRange: useDoorwayEntrance ? [0, 0.4, 0.76, 1] : [0, 0.62, 0.82, 1],
            outputRange: useDoorwayEntrance ? [18, -12, -2, 0] : [34, -6, 2, 0]
          })
        },
        {
          scale: maleEntrance.interpolate({
            inputRange: useDoorwayEntrance ? [0, 0.4, 0.76, 1] : [0, 0.62, 0.82, 1],
            outputRange: useDoorwayEntrance ? [0.72, 1.045, 1.01, 1] : [0.76, 1.035, 0.992, 1]
          })
        },
        { translateY: maleIdle.interpolate({ inputRange: [0, 1], outputRange: [0, -3.2] }) },
        { translateY: interaction.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0, 5, 4] }) },
        {
          rotate: maleEntrance.interpolate({
            inputRange: useDoorwayEntrance ? [0, 0.36, 0.78, 1] : [0, 0.72, 1],
            outputRange: useDoorwayEntrance ? ["5deg", "-2.2deg", "-0.4deg", "0deg"] : ["-4deg", "0.8deg", "0deg"]
          })
        },
        { rotate: maleIdle.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-0.7deg"] }) },
        { rotate: maleWeightShift.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-1.15deg"] }) }
        ,{ rotate: interaction.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "2deg"] }) }
      ] }}>
        <Image accessibilityIgnoresInvertColors fadeDuration={0} resizeMode="contain" source={maleSource} style={[styles.character, styles.male]} />
      </Animated.View>
      <Animated.View style={{ opacity: femaleEntrance, transform: [
        {
          translateX: femaleEntrance.interpolate({
            inputRange: useDoorwayEntrance ? [0, 0.32, 0.7, 1] : [0, 0.68, 1],
            outputRange: useDoorwayEntrance ? [-14, 14, 4, 0] : [-48, 4, 0]
          })
        },
        { translateX: femaleWeightShift.interpolate({ inputRange: [0, 1], outputRange: [0, 1.7] }) },
        { translateX: interaction.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) },
        {
          translateY: femaleEntrance.interpolate({
            inputRange: useDoorwayEntrance ? [0, 0.34, 0.72, 1] : [0, 0.62, 0.82, 1],
            outputRange: useDoorwayEntrance ? [20, -11, -2, 0] : [34, -6, 2, 0]
          })
        },
        {
          scale: femaleEntrance.interpolate({
            inputRange: useDoorwayEntrance ? [0, 0.34, 0.72, 1] : [0, 0.62, 0.82, 1],
            outputRange: useDoorwayEntrance ? [0.7, 1.052, 1.012, 1] : [0.76, 1.035, 0.992, 1]
          })
        },
        { translateY: femaleIdle.interpolate({ inputRange: [0, 1], outputRange: [0, -3.6] }) },
        { translateY: interaction.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0, 5, 4] }) },
        {
          rotate: femaleEntrance.interpolate({
            inputRange: useDoorwayEntrance ? [0, 0.34, 0.7, 1] : [0, 0.72, 1],
            outputRange: useDoorwayEntrance ? ["-5deg", "2.6deg", "0.4deg", "0deg"] : ["4deg", "-0.8deg", "0deg"]
          })
        },
        { rotate: femaleIdle.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "0.75deg"] }) },
        { rotate: femaleWeightShift.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "1.1deg"] }) }
        ,{ rotate: interaction.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-2deg"] }) }
      ] }}>
        <Image accessibilityIgnoresInvertColors fadeDuration={0} resizeMode="contain" source={femaleSource} style={[styles.character, styles.female]} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  pair: {
    position: "absolute",
    bottom: 2,
    width: 232,
    height: 198,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center"
  },
  character: { width: 108, height: 178 },
  male: { marginRight: -8 },
  female: { marginLeft: -8 }
})
