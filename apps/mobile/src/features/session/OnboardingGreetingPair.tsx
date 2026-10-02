import { useEffect, useRef, useState } from "react"
import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native"
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { animateSegment, animateSequence, repeatForever } from "../../ui/motion"
import { ONBOARDING_RUN_ASSET_MODE } from "./onboardingRunAssetGate"
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
  /** Entrance clock, 0 → 1. Settled (1) when omitted. */
  entranceProgress?: SharedValue<number>
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

const LAST_FEMALE_FRAME = FEMALE_WAVE_FRAMES.length - 1
const LAST_MALE_FRAME = MALE_WAVE_FRAMES.length - 1
const LAST_WAVE_POSITION = ONBOARDING_GREETING_WAVE_SEQUENCE.length - 1
/** The greeting wave clock ends once both characters have held their last frame. */
const GREETING_WAVE_END_MS = Math.max(
  getOnboardingWaveFrameTimestampMs({
    frameIndex: LAST_WAVE_POSITION,
    frameDurationMs: WAVE_FRAME_DURATION_MS
  }),
  getOnboardingWaveFrameTimestampMs({
    frameIndex: LAST_WAVE_POSITION,
    frameDurationMs: WAVE_FRAME_DURATION_MS,
    startOffsetMs: MALE_WAVE_OFFSET_MS
  })
) + WAVE_FRAME_DURATION_MS
const AMBIENT_WAVE_MS = ONBOARDING_GREETING_WAVE_SEQUENCE.length * WAVE_FRAME_DURATION_MS
/** An ambient clock below zero rests on the last (idle) frame. */
const AMBIENT_RESTING = -1
const FEMALE_AMBIENT = { initialDelayMs: 2_600, repeatDelayMs: 7_100 } as const
const MALE_AMBIENT = { initialDelayMs: 4_300, repeatDelayMs: 8_300 } as const

/**
 * An idle wave every so often: rest on the idle frame for `initialDelayMs`,
 * then play the wave and rest `repeatDelayMs`, forever. One UI-thread clock
 * per character replaces the per-frame JS timers (ONBV-03).
 */
function playAmbientWave(
  clock: SharedValue<number>,
  timing: { initialDelayMs: number; repeatDelayMs: number }
): void {
  const cycleMs = AMBIENT_WAVE_MS + timing.repeatDelayMs
  clock.value = AMBIENT_RESTING
  clock.value = animateSequence(
    animateSegment(AMBIENT_RESTING, { durationMs: timing.initialDelayMs }),
    repeatForever(animateSequence(
      animateSegment(0, { durationMs: 0 }),
      animateSegment(cycleMs, { durationMs: cycleMs })
    ))
  )
}

/** Breathing: up and down on a sine, after `delayMs`, forever. */
function playBreath(value: SharedValue<number>, delayMs: number): void {
  const easing = Easing.inOut(Easing.sin)
  value.value = 0
  value.value = repeatForever(animateSequence(
    animateSegment(1, { delayMs, durationMs: ONBOARDING_IDLE_BREATH_DURATION_MS / 2, easing }),
    animateSegment(0, { durationMs: ONBOARDING_IDLE_BREATH_DURATION_MS / 2, easing })
  ))
}

/** A slow weight shift onto one foot and back, after `delayMs`, forever. */
function playWeightShift(value: SharedValue<number>, delayMs: number): void {
  const easing = Easing.inOut(Easing.cubic)
  value.value = 0
  value.value = repeatForever(animateSequence(
    animateSegment(1, { delayMs, durationMs: ONBOARDING_IDLE_WEIGHT_DURATION_MS * 0.32, easing }),
    animateSegment(0, { delayMs: 620, durationMs: ONBOARDING_IDLE_WEIGHT_DURATION_MS * 0.28, easing }),
    animateSegment(0, { durationMs: 1_100 })
  ))
}

type FrameMode = "static" | "wave" | "ambient"

export function OnboardingGreetingPair({
  ambientOnly = false,
  entranceVariant = "default",
  entranceProgress,
  greetingActive,
  motionEnabled,
  motionPreferenceResolved,
  reduceMotion,
  onFinished
}: OnboardingGreetingPairProps) {
  const [isIdle, setIsIdle] = useState(reduceMotion || ambientOnly)
  const femaleIdle = useSharedValue(0)
  const maleIdle = useSharedValue(0)
  const femaleWeightShift = useSharedValue(0)
  const maleWeightShift = useSharedValue(0)
  // Milliseconds into the greeting wave; both characters read it (the male
  // a beat later), so their frames can never drift apart.
  const waveClock = useSharedValue(0)
  const femaleAmbient = useSharedValue(AMBIENT_RESTING)
  const maleAmbient = useSharedValue(AMBIENT_RESTING)
  const waveElapsedMsRef = useRef(0)
  const previousGreetingActive = useRef(greetingActive)
  const frameMode: FrameMode = reduceMotion || ambientOnly
    ? "static"
    : isIdle ? "ambient" : "wave"

  useEffect(() => {
    const greetingJustOpened = greetingActive && !previousGreetingActive.current
    previousGreetingActive.current = greetingActive
    if (!greetingJustOpened || reduceMotion || ambientOnly) return
    waveElapsedMsRef.current = 0
    cancelAnimation(waveClock)
    waveClock.value = 0
    setIsIdle(false)
  }, [ambientOnly, greetingActive, reduceMotion, waveClock])

  useEffect(() => {
    if (!motionPreferenceResolved) return undefined
    if (reduceMotion || ambientOnly) {
      setIsIdle(true)
      const finishedId = setTimeout(onFinished, 0)
      return () => clearTimeout(finishedId)
    }
    if (!motionEnabled) return undefined

    const startedAt = Date.now()
    const elapsedMs = Math.min(GREETING_WAVE_END_MS, waveElapsedMsRef.current)
    const finishWave = () => {
      setIsIdle(true)
      onFinished()
    }
    waveClock.value = elapsedMs
    waveClock.value = animateSegment(
      GREETING_WAVE_END_MS,
      { durationMs: GREETING_WAVE_END_MS - elapsedMs },
      (finished) => {
        "worklet"
        if (finished) scheduleOnRN(finishWave)
      }
    )
    return () => {
      waveElapsedMsRef.current += Date.now() - startedAt
      cancelAnimation(waveClock)
    }
  }, [ambientOnly, greetingActive, motionEnabled, motionPreferenceResolved, onFinished, reduceMotion, waveClock])

  useEffect(() => {
    if (ambientOnly || !motionEnabled || reduceMotion || !isIdle) return undefined
    playAmbientWave(femaleAmbient, FEMALE_AMBIENT)
    playAmbientWave(maleAmbient, MALE_AMBIENT)
    return () => {
      cancelAnimation(femaleAmbient)
      cancelAnimation(maleAmbient)
    }
  }, [ambientOnly, femaleAmbient, isIdle, maleAmbient, motionEnabled, reduceMotion])

  useEffect(() => {
    if (!motionEnabled || reduceMotion || !isIdle) {
      cancelAnimation(femaleIdle)
      cancelAnimation(maleIdle)
      cancelAnimation(femaleWeightShift)
      cancelAnimation(maleWeightShift)
      return undefined
    }
    playBreath(femaleIdle, 0)
    playBreath(maleIdle, ONBOARDING_IDLE_PHASE_OFFSET_MS)
    playWeightShift(femaleWeightShift, 540)
    playWeightShift(maleWeightShift, 1_180)
    return () => {
      cancelAnimation(femaleIdle)
      cancelAnimation(maleIdle)
      cancelAnimation(femaleWeightShift)
      cancelAnimation(maleWeightShift)
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

  const femaleFrame = useDerivedValue(() => {
    if (frameMode === "static") return LAST_FEMALE_FRAME
    if (frameMode === "wave") {
      return getOnboardingWaveAssetFrameAtElapsed({
        elapsedMs: waveClock.value,
        frameDurationMs: WAVE_FRAME_DURATION_MS
      })
    }
    const ambient = femaleAmbient.value
    return ambient < 0
      ? LAST_FEMALE_FRAME
      : getOnboardingWaveAssetFrameAtElapsed({ elapsedMs: ambient, frameDurationMs: WAVE_FRAME_DURATION_MS })
  })
  const maleFrame = useDerivedValue(() => {
    if (frameMode === "static") return LAST_MALE_FRAME
    if (frameMode === "wave") {
      return getOnboardingWaveAssetFrameAtElapsed({
        elapsedMs: waveClock.value,
        frameDurationMs: WAVE_FRAME_DURATION_MS,
        startOffsetMs: MALE_WAVE_OFFSET_MS
      })
    }
    const ambient = maleAmbient.value
    return ambient < 0
      ? LAST_MALE_FRAME
      : getOnboardingWaveAssetFrameAtElapsed({ elapsedMs: ambient, frameDurationMs: WAVE_FRAME_DURATION_MS })
  })

  const doorway = entranceVariant === "doorway"
  const maleStyle = useAnimatedStyle(() => {
    const entrance = interpolate(entranceProgress ? entranceProgress.value : 1, [0, 0.3, 1], [0, 0, 1], Extrapolation.CLAMP)
    const idle = maleIdle.value
    const weight = maleWeightShift.value
    return {
      opacity: entrance,
      transform: [
        {
          translateX: doorway
            ? interpolate(entrance, [0, 0.38, 0.74, 1], [18, -12, -3, 0])
            : interpolate(entrance, [0, 0.68, 1], [48, -4, 0])
        },
        { translateX: interpolate(weight, [0, 1], [0, -1.8]) },
        {
          translateY: doorway
            ? interpolate(entrance, [0, 0.4, 0.76, 1], [18, -12, -2, 0])
            : interpolate(entrance, [0, 0.62, 0.82, 1], [34, -6, 2, 0])
        },
        {
          scale: doorway
            ? interpolate(entrance, [0, 0.4, 0.76, 1], [0.72, 1.045, 1.01, 1])
            : interpolate(entrance, [0, 0.62, 0.82, 1], [0.76, 1.035, 0.992, 1])
        },
        { translateY: interpolate(idle, [0, 1], [0, -3.2]) },
        {
          rotate: `${doorway
            ? interpolate(entrance, [0, 0.36, 0.78, 1], [5, -2.2, -0.4, 0])
            : interpolate(entrance, [0, 0.72, 1], [-4, 0.8, 0])}deg`
        },
        { rotate: `${interpolate(idle, [0, 1], [0, -0.7])}deg` },
        { rotate: `${interpolate(weight, [0, 1], [0, -1.15])}deg` }
      ]
    }
  })
  const femaleStyle = useAnimatedStyle(() => {
    const entrance = interpolate(entranceProgress ? entranceProgress.value : 1, [0, 0.12, 1], [0, 0, 1], Extrapolation.CLAMP)
    const idle = femaleIdle.value
    const weight = femaleWeightShift.value
    return {
      opacity: entrance,
      transform: [
        {
          translateX: doorway
            ? interpolate(entrance, [0, 0.32, 0.7, 1], [-14, 14, 4, 0])
            : interpolate(entrance, [0, 0.68, 1], [-48, 4, 0])
        },
        { translateX: interpolate(weight, [0, 1], [0, 1.7]) },
        {
          translateY: doorway
            ? interpolate(entrance, [0, 0.34, 0.72, 1], [20, -11, -2, 0])
            : interpolate(entrance, [0, 0.62, 0.82, 1], [34, -6, 2, 0])
        },
        {
          scale: doorway
            ? interpolate(entrance, [0, 0.34, 0.72, 1], [0.7, 1.052, 1.012, 1])
            : interpolate(entrance, [0, 0.62, 0.82, 1], [0.76, 1.035, 0.992, 1])
        },
        { translateY: interpolate(idle, [0, 1], [0, -3.6]) },
        {
          rotate: `${doorway
            ? interpolate(entrance, [0, 0.34, 0.7, 1], [-5, 2.6, 0.4, 0])
            : interpolate(entrance, [0, 0.72, 1], [4, -0.8, 0])}deg`
        },
        { rotate: `${interpolate(idle, [0, 1], [0, 0.75])}deg` },
        { rotate: `${interpolate(weight, [0, 1], [0, 1.1])}deg` }
      ]
    }
  })

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.pair}
      testID="onboarding-greeting-pair"
    >
      <Animated.View style={maleStyle}>
        <WaveSprite
          frame={maleFrame}
          frames={MALE_WAVE_FRAMES}
          stacked={frameMode !== "static"}
          style={styles.male}
          testID="onboarding-greeting-male"
        />
      </Animated.View>
      <Animated.View style={femaleStyle}>
        <WaveSprite
          frame={femaleFrame}
          frames={FEMALE_WAVE_FRAMES}
          stacked={frameMode !== "static"}
          style={styles.female}
          testID="onboarding-greeting-female"
        />
      </Animated.View>
    </View>
  )
}

/**
 * One character's wave. While it can move, every frame is mounted and
 * decoded at its drawn size and the UI thread shows one by opacity, so a
 * frame swap never waits on React or shows an empty frame (ONB-04). A
 * character that cannot move (Reduce Motion, ambient-only) mounts only its
 * idle frame.
 */
function WaveSprite({
  frame,
  frames,
  stacked,
  style,
  testID
}: {
  frame: SharedValue<number>
  frames: readonly ImageSourcePropType[]
  stacked: boolean
  style: { marginLeft?: number; marginRight?: number }
  testID: string
}) {
  if (!stacked) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        resizeMode="contain"
        source={frames[frames.length - 1]}
        style={[styles.character, style]}
        testID={testID}
      />
    )
  }
  return (
    <View style={[styles.character, style]} testID={testID}>
      {frames.map((source, index) => (
        <WaveFrame frame={frame} index={index} key={index} source={source} />
      ))}
    </View>
  )
}

function WaveFrame({
  frame,
  index,
  source
}: {
  frame: SharedValue<number>
  index: number
  source: ImageSourcePropType
}) {
  const visibility = useAnimatedStyle(() => ({ opacity: frame.value === index ? 1 : 0 }))
  return (
    <Animated.Image
      accessibilityIgnoresInvertColors
      fadeDuration={0}
      resizeMode="contain"
      source={source}
      style={[styles.frame, visibility]}
    />
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
  frame: { position: "absolute", left: 0, top: 0, width: 108, height: 178 },
  male: { marginRight: -8 },
  female: { marginLeft: -8 }
})
