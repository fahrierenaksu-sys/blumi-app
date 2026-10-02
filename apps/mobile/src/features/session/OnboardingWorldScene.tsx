import { useIsFocused } from "@react-navigation/native"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  AppState,
  Pressable,
  Text,
  View,
  type AppStateStatus
} from "react-native"
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
import { animateSegment, animateSequence, repeatForever } from "../../ui/motion"
import type { AuthEntryCopy } from "./authEntryCopy"
import {
  getOnboardingImpactVisualProgressAtElapsed,
  getOnboardingIntroAnimationProgress,
  ONBOARDING_GLOBE_LOOP_DURATION_MS,
  ONBOARDING_INTRO_TIMELINE_MS,
  ONBOARDING_RUNNER_ORBIT_DURATION_MS,
  ONBOARDING_WHOAA_REVEAL_LEAD_MS,
  ONBOARDING_SCENE_HANDOFF_MS,
  type OnboardingIntroEvent,
  type OnboardingIntroPhase,
  type OnboardingIntroState,
  shouldInitializeOnboardingImpactSettled,
  shouldRunOnboardingIntroMotion,
  shouldRunOnboardingRunnerOrbit,
  shouldShowOnboardingPopulationCard,
  shouldShowOnboardingRunners
} from "./onboardingIntroModel"
import { OnboardingBrandPrelude } from "./OnboardingBrandPrelude"
import { OnboardingWorldHero } from "./OnboardingWorldHero"
import {
  ONBOARDING_WORLD_COMPOSITION_LIFT,
  ONBOARDING_WORLD_SCENE_LIFT
} from "./onboardingWorldCompositionModel"
import { ONBOARDING_ARRIVAL_PREROLL_MS } from "./onboardingArrivalMotionModel"
import {
  getClampedClockProgress,
  getLoopingClockProgress,
  getRewindClockProgress
} from "./onboardingWorldClockModel"
import {
  ONBOARDING_POPULATION_COUNTER_TIMING_MS
} from "./onboardingPopulationCounterModel"
import { hapticLight, hapticMedium } from "../../ui/haptics"
import { onboardingWorldSceneStyles as styles } from "./onboardingWorldSceneStyles"

const SKIPPABLE_WORLD_PHASES = new Set<OnboardingIntroPhase>([
  "population-counting",
  "chasing",
  "catching"
])
const IMPACT_PHASE_DURATION_MS =
  ONBOARDING_INTRO_TIMELINE_MS.globeLaunchComplete -
  ONBOARDING_INTRO_TIMELINE_MS.impact
const AIRBORNE_PHASE_DURATION_MS =
  ONBOARDING_INTRO_TIMELINE_MS.airborneComplete -
  ONBOARDING_INTRO_TIMELINE_MS.globeLaunchComplete
const LANDING_PHASE_DURATION_MS =
  ONBOARDING_INTRO_TIMELINE_MS.landingComplete -
  ONBOARDING_INTRO_TIMELINE_MS.airborneComplete
const POPULATION_PHASE_DURATION_MS =
  ONBOARDING_INTRO_TIMELINE_MS.populationComplete -
  ONBOARDING_INTRO_TIMELINE_MS.landingComplete
const CHASE_PHASE_DURATION_MS =
  ONBOARDING_INTRO_TIMELINE_MS.chaseComplete -
  ONBOARDING_INTRO_TIMELINE_MS.populationComplete
const CATCH_PHASE_DURATION_MS =
  ONBOARDING_INTRO_TIMELINE_MS.catchComplete -
  ONBOARDING_INTRO_TIMELINE_MS.chaseComplete
const HANDOFF_DURATION_MS = ONBOARDING_INTRO_TIMELINE_MS.handoffDuration
const HANDOFF_ROLLBACK_DURATION_MS = 160
const IMPACT_VISUAL_CLOCK_INPUT_RANGE = [
  0,
  80,
  160,
  240,
  ONBOARDING_INTRO_TIMELINE_MS.impact,
  440,
  ONBOARDING_INTRO_TIMELINE_MS.globeLaunchComplete,
  ONBOARDING_INTRO_TIMELINE_MS.airborneComplete,
  ONBOARDING_INTRO_TIMELINE_MS.landingComplete
] as const
const IMPACT_VISUAL_CLOCK_SAMPLES = IMPACT_VISUAL_CLOCK_INPUT_RANGE.map(
  getOnboardingImpactVisualProgressAtElapsed
)
const GLOBE_RISE_OUTPUT_RANGE = IMPACT_VISUAL_CLOCK_SAMPLES.map(
  (sample) => sample.globeRise
)
const GLOBE_IMPACT_OUTPUT_RANGE = IMPACT_VISUAL_CLOCK_SAMPLES.map(
  (sample) => sample.globeImpact
)
const AVATAR_FLIGHT_OUTPUT_RANGE = IMPACT_VISUAL_CLOCK_SAMPLES.map(
  (sample) => sample.avatarFlight
)
const LANDING_REACTION_OUTPUT_RANGE = IMPACT_VISUAL_CLOCK_SAMPLES.map(
  (sample) => sample.landingReaction
)
const IMPACT_VISUAL_CLOCK_INPUT = [...IMPACT_VISUAL_CLOCK_INPUT_RANGE]
const ARRIVAL_CLOCK_INPUT = [
  ONBOARDING_INTRO_TIMELINE_MS.impact - ONBOARDING_ARRIVAL_PREROLL_MS,
  ONBOARDING_INTRO_TIMELINE_MS.landingComplete
]
const COMPOSITION_LIFT_INPUT = [
  0,
  ...ONBOARDING_WORLD_COMPOSITION_LIFT.inputRange.map(
    (progress) => ONBOARDING_INTRO_TIMELINE_MS.impact +
      progress * (
        ONBOARDING_INTRO_TIMELINE_MS.landingComplete -
        ONBOARDING_INTRO_TIMELINE_MS.impact
      )
  )
]
const COMPOSITION_LIFT_OUTPUT = [0, ...ONBOARDING_WORLD_COMPOSITION_LIFT.translateY]
interface OnboardingWorldSceneProps {
  copy: AuthEntryCopy
  introState: OnboardingIntroState
  reduceMotion: boolean
  compact: boolean
  onEvent: (event: OnboardingIntroEvent) => void
  onPreludeActionsVisible: () => void
  onPreludeSecondaryActionVisible: () => void
  onGreetingFinished: () => void
  onWhoaVisible: () => void
  motionPreferenceResolved: boolean
}

function getRemainingDuration(totalDuration: number, progress: number): number {
  return Math.max(1, Math.round(totalDuration * Math.max(0, 1 - progress)))
}

function getOnboardingPhaseDurationMs(
  phase: OnboardingIntroPhase
): number | null {
  switch (phase) {
    case "globe-launching":
      return ONBOARDING_INTRO_TIMELINE_MS.globeLaunchComplete
    case "impact":
      return IMPACT_PHASE_DURATION_MS
    case "airborne":
      return AIRBORNE_PHASE_DURATION_MS
    case "landing":
      return LANDING_PHASE_DURATION_MS
    case "population-counting":
      return POPULATION_PHASE_DURATION_MS
    case "chasing":
      return CHASE_PHASE_DURATION_MS
    case "catching":
      return CATCH_PHASE_DURATION_MS
    default:
      return null
  }
}

export function OnboardingWorldScene({
  copy,
  introState,
  reduceMotion,
  compact,
  onEvent,
  onPreludeActionsVisible,
  onPreludeSecondaryActionVisible,
  onGreetingFinished,
  onWhoaVisible,
  motionPreferenceResolved
}: OnboardingWorldSceneProps) {
  const isFocused = useIsFocused()
  const shouldReduceMotion = shouldInitializeOnboardingImpactSettled(
    motionPreferenceResolved,
    reduceMotion
  )
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState)
  // Milliseconds into the impact sequence: the globe, the flight and the
  // arrival frames all read this one UI-thread clock.
  const impactTimeline = useSharedValue(
    shouldReduceMotion ? ONBOARDING_INTRO_TIMELINE_MS.landingComplete : 0
  )
  const globeRise = useDerivedValue(() => interpolate(
    impactTimeline.value, IMPACT_VISUAL_CLOCK_INPUT, GLOBE_RISE_OUTPUT_RANGE, Extrapolation.CLAMP
  ))
  const globeImpact = useDerivedValue(() => interpolate(
    impactTimeline.value, IMPACT_VISUAL_CLOCK_INPUT, GLOBE_IMPACT_OUTPUT_RANGE, Extrapolation.CLAMP
  ))
  const avatarFlight = useDerivedValue(() => interpolate(
    impactTimeline.value, IMPACT_VISUAL_CLOCK_INPUT, AVATAR_FLIGHT_OUTPUT_RANGE, Extrapolation.CLAMP
  ))
  const arrivalProgress = useDerivedValue(() => interpolate(
    impactTimeline.value, ARRIVAL_CLOCK_INPUT, [0, 1], Extrapolation.CLAMP
  ))
  const landingReaction = useDerivedValue(() => interpolate(
    impactTimeline.value, IMPACT_VISUAL_CLOCK_INPUT, LANDING_REACTION_OUTPUT_RANGE, Extrapolation.CLAMP
  ))
  const compositionLift = useDerivedValue(() => interpolate(
    impactTimeline.value, COMPOSITION_LIFT_INPUT, COMPOSITION_LIFT_OUTPUT, Extrapolation.CLAMP
  ))
  const populationReveal = useSharedValue(shouldReduceMotion ? 1 : 0)
  const chase = useSharedValue(shouldReduceMotion ? 1 : 0)
  const catchReaction = useSharedValue(shouldReduceMotion ? 1 : 0)
  const preludeOpacity = useSharedValue(1)
  const worldReveal = useSharedValue(shouldReduceMotion ? 1 : 0)
  const handoff = useSharedValue(0)
  const rotation = useSharedValue(0)
  const runnerOrbit = useSharedValue(0)
  // Where each resumable clock stopped, read from wall time (no listeners).
  const progressRefs = useRef({
    impactTimeline: shouldReduceMotion ? ONBOARDING_INTRO_TIMELINE_MS.landingComplete : 0,
    handoff: 0,
    rotation: 0,
    runnerOrbit: 0
  })
  const clocks = progressRefs.current
  const impactHapticPlayedRef = useRef(false)
  const landingHapticPlayedRef = useRef(false)
  const phaseClockRef = useRef<{
    phase: OnboardingIntroPhase
    elapsedMs: number
    startedAtMs: number | null
  }>({
    phase: introState.phase,
    elapsedMs: 0,
    startedAtMs: null
  })

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState)
    return () => subscription.remove()
  }, [])

  const canAnimate =
    motionPreferenceResolved && !reduceMotion && !introState.isPaused &&
    isFocused &&
    appState === "active"
  const impactSequenceActive =
    introState.phase === "globe-launching" ||
    introState.phase === "impact" ||
    introState.phase === "airborne" ||
    introState.phase === "landing"
  const impactSequenceSettled =
    introState.phase === "population-counting" ||
    introState.phase === "chasing" ||
    introState.phase === "catching" ||
    introState.phase === "world-ready" ||
    introState.phase === "handoff"
  const shouldRunContinuousMotion = shouldRunOnboardingIntroMotion({
    phase: introState.phase,
    isPaused: introState.isPaused,
    reduceMotion,
    isFocused,
    appState: appState === "active"
      ? "active"
      : appState === "inactive"
        ? "inactive"
        : appState === "background"
          ? "background"
          : "unknown"
  })
  const shouldRunRunnerOrbit = shouldRunOnboardingRunnerOrbit({
    phase: introState.phase,
    isPaused: introState.isPaused,
    reduceMotion,
    isFocused,
    appState: appState === "active"
      ? "active"
      : appState === "inactive"
        ? "inactive"
        : appState === "background"
          ? "background"
          : "unknown"
  })

  useEffect(() => {
    if (
      !canAnimate ||
      (introState.phase !== "population-counting" && introState.phase !== "chasing")
    ) return undefined
    const phaseStartMs = introState.phase === "population-counting"
      ? ONBOARDING_INTRO_TIMELINE_MS.landingComplete
      : ONBOARDING_INTRO_TIMELINE_MS.populationComplete
    const phaseDurationMs = introState.phase === "population-counting"
      ? POPULATION_PHASE_DURATION_MS
      : CHASE_PHASE_DURATION_MS
    const elapsedBeforeRun = Math.min(
      phaseDurationMs,
      phaseClockRef.current.phase === introState.phase
        ? phaseClockRef.current.elapsedMs
        : 0
    )
    const revealAtMs =
      ONBOARDING_INTRO_TIMELINE_MS.catchComplete -
      ONBOARDING_WHOAA_REVEAL_LEAD_MS
    const whoaDelay = Math.max(
      1,
      revealAtMs - phaseStartMs - elapsedBeforeRun
    )
    const timeoutId = setTimeout(onWhoaVisible, whoaDelay)
    return () => clearTimeout(timeoutId)
  }, [canAnimate, introState.phase, onWhoaVisible])

  const sceneProgress = getOnboardingIntroAnimationProgress(
    introState.phase,
    shouldReduceMotion
  )
  const showPopulationCard = shouldShowOnboardingPopulationCard(introState.phase)
  const showRunners = shouldShowOnboardingRunners(introState.phase)
  const isGreeting = introState.phase === "greeting"
  const isCharacterGreeting = introState.phase === "character-greeting"
  const isPrelude = isGreeting || isCharacterGreeting
  const preludeOwnsLaunchCharacters =
    isPrelude || introState.phase === "globe-launching"
  const worldIsReady = introState.phase === "world-ready"
  const handoffActive = introState.phase === "handoff"
  const showHeroCharacter =
    introState.phase === "globe-launching" ||
    introState.phase === "impact" ||
    introState.phase === "airborne" ||
    introState.phase === "landing" ||
    introState.phase === "population-counting"

  useLayoutEffect(() => {
    if (shouldReduceMotion) {
      cancelAnimation(preludeOpacity)
      cancelAnimation(worldReveal)
      preludeOpacity.value = isPrelude ? 1 : 0
      worldReveal.value = isPrelude ? 0 : 1
      return undefined
    }

    if (isPrelude) {
      cancelAnimation(preludeOpacity)
      cancelAnimation(worldReveal)
      impactHapticPlayedRef.current = false
      landingHapticPlayedRef.current = false
      preludeOpacity.value = 1
      worldReveal.value = 0
      return undefined
    }

    preludeOpacity.value = animateSegment(0, {
      durationMs: ONBOARDING_SCENE_HANDOFF_MS.preludeExit,
      easing: Easing.out(Easing.quad)
    })
    worldReveal.value = animateSegment(1, {
      durationMs: ONBOARDING_SCENE_HANDOFF_MS.worldReveal,
      easing: Easing.out(Easing.cubic)
    })
    return () => {
      cancelAnimation(preludeOpacity)
      cancelAnimation(worldReveal)
    }
  }, [isPrelude, preludeOpacity, shouldReduceMotion, worldReveal])

  useEffect(() => {
    if (!shouldReduceMotion) return
    impactTimeline.value = ONBOARDING_INTRO_TIMELINE_MS.landingComplete
    populationReveal.value = sceneProgress.population
    chase.value = sceneProgress.chase
    catchReaction.value = sceneProgress.chase
    handoff.value = 0
    onEvent({ type: "motion-reduced" })
  }, [
    catchReaction,
    chase,
    handoff,
    impactTimeline,
    onEvent,
    populationReveal,
    shouldReduceMotion,
    sceneProgress.chase,
    sceneProgress.population
  ])

  useEffect(() => {
    if (shouldReduceMotion) return
    if (worldIsReady) {
      impactTimeline.value = ONBOARDING_INTRO_TIMELINE_MS.landingComplete
      populationReveal.value = sceneProgress.population
      chase.value = sceneProgress.chase
      catchReaction.value = sceneProgress.chase
    }
  }, [
    catchReaction,
    chase,
    impactTimeline,
    populationReveal,
    shouldReduceMotion,
    sceneProgress.chase,
    sceneProgress.population,
    worldIsReady
  ])

  useEffect(() => {
    if (shouldReduceMotion) return
    if (handoffActive) {
      cancelAnimation(handoff)
      const run = { startProgress: progressRefs.current.handoff, startedAtMs: Date.now(), durationMs: HANDOFF_DURATION_MS }
      handoff.value = animateSegment(1, {
        durationMs: getRemainingDuration(
          HANDOFF_DURATION_MS,
          progressRefs.current.handoff
        ),
        easing: Easing.in(Easing.cubic)
      })
      return () => {
        cancelAnimation(handoff)
        clocks.handoff = getClampedClockProgress(run, Date.now())
      }
    }
    if (progressRefs.current.handoff <= 0) return
    const rewind = { startProgress: progressRefs.current.handoff, startedAtMs: Date.now(), durationMs: HANDOFF_ROLLBACK_DURATION_MS }
    handoff.value = animateSegment(0, {
      durationMs: Math.max(
        1,
        Math.round(HANDOFF_ROLLBACK_DURATION_MS * progressRefs.current.handoff)
      ),
      easing: Easing.out(Easing.cubic)
    })
    return () => {
      cancelAnimation(handoff)
      clocks.handoff = getRewindClockProgress(rewind, Date.now())
    }
  }, [clocks, handoff, handoffActive, shouldReduceMotion])

  useEffect(() => {
    if (shouldReduceMotion) return
    if (!impactSequenceActive) {
      if (impactSequenceSettled) {
        impactTimeline.value = ONBOARDING_INTRO_TIMELINE_MS.landingComplete
      }
      return
    }
    if (!canAnimate) return

    const elapsedMs = Math.max(0, Math.min(
      ONBOARDING_INTRO_TIMELINE_MS.landingComplete,
      progressRefs.current.impactTimeline
    ))
    impactTimeline.value = elapsedMs
    impactTimeline.value = animateSegment(ONBOARDING_INTRO_TIMELINE_MS.landingComplete, {
      durationMs: Math.max(1, ONBOARDING_INTRO_TIMELINE_MS.landingComplete - elapsedMs)
    })
    const run = {
      startProgress: elapsedMs / ONBOARDING_INTRO_TIMELINE_MS.landingComplete,
      startedAtMs: Date.now(),
      durationMs: ONBOARDING_INTRO_TIMELINE_MS.landingComplete
    }
    return () => {
      cancelAnimation(impactTimeline)
      clocks.impactTimeline =
        getClampedClockProgress(run, Date.now()) * ONBOARDING_INTRO_TIMELINE_MS.landingComplete
    }
  }, [
    canAnimate,
    clocks,
    impactSequenceActive,
    impactSequenceSettled,
    impactTimeline,
    shouldReduceMotion
  ])

  useEffect(() => {
    const phaseDurationMs = getOnboardingPhaseDurationMs(introState.phase)
    if (!canAnimate || phaseDurationMs === null) return

    if (phaseClockRef.current.phase !== introState.phase) {
      phaseClockRef.current = {
        phase: introState.phase,
        elapsedMs: 0,
        startedAtMs: null
      }
    }
    const elapsedBeforeRun = Math.min(
      phaseDurationMs,
      phaseClockRef.current.elapsedMs
    )
    const remainingPhaseDuration = Math.max(1, phaseDurationMs - elapsedBeforeRun)
    phaseClockRef.current.startedAtMs = Date.now()
    let animated: SharedValue<number> | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    // The phase machine advances on JS timers (each step is a React event);
    // the motion inside a phase runs on the UI thread.
    switch (introState.phase) {
      case "globe-launching": {
        timeoutId = setTimeout(() => {
          onEvent({ type: "globe-impact" })
        }, Math.max(1, ONBOARDING_INTRO_TIMELINE_MS.impact - elapsedBeforeRun))
        break
      }
      case "impact": {
        if (!impactHapticPlayedRef.current) {
          impactHapticPlayedRef.current = true
          hapticMedium()
        }
        timeoutId = setTimeout(() => {
          onEvent({ type: "launch-finished" })
        }, remainingPhaseDuration)
        break
      }
      case "airborne": {
        timeoutId = setTimeout(() => {
          onEvent({ type: "landing-started" })
        }, remainingPhaseDuration)
        break
      }
      case "landing": {
        if (!landingHapticPlayedRef.current) {
          landingHapticPlayedRef.current = true
          hapticLight()
        }
        timeoutId = setTimeout(() => {
          onEvent({ type: "landing-finished" })
        }, remainingPhaseDuration)
        break
      }
      case "population-counting": {
        // The counter and its reveal share one clock. Resetting to the
        // resumed phase position prevents a stale/final value from flashing
        // before the first population tick is rendered.
        populationReveal.value =
          Math.max(0, Math.min(1, elapsedBeforeRun / POPULATION_PHASE_DURATION_MS))
        populationReveal.value = animateSegment(1, {
          durationMs: Math.max(
            1,
            remainingPhaseDuration -
              ONBOARDING_POPULATION_COUNTER_TIMING_MS.finalHold
          ),
          easing: Easing.inOut(Easing.cubic)
        })
        animated = populationReveal
        timeoutId = setTimeout(() => {
          onEvent({ type: "population-finished" })
        }, remainingPhaseDuration)
        break
      }
      case "chasing": {
        chase.value = animateSegment(1, {
          durationMs: remainingPhaseDuration,
          easing: Easing.inOut(Easing.cubic)
        })
        animated = chase
        timeoutId = setTimeout(() => {
          onEvent({ type: "chase-finished" })
        }, remainingPhaseDuration)
        break
      }
      case "catching": {
        catchReaction.value = animateSegment(1, {
          durationMs: remainingPhaseDuration,
          easing: Easing.out(Easing.back(1.08))
        })
        animated = catchReaction
        timeoutId = setTimeout(() => {
          onEvent({ type: "catch-finished" })
        }, remainingPhaseDuration)
        break
      }
      default:
        break
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (animated) cancelAnimation(animated)
      if (phaseClockRef.current.startedAtMs !== null) {
        phaseClockRef.current.elapsedMs = Math.min(
          phaseDurationMs,
          elapsedBeforeRun + (Date.now() - phaseClockRef.current.startedAtMs)
        )
        phaseClockRef.current.startedAtMs = null
      }
    }
  }, [
    canAnimate,
    catchReaction,
    chase,
    introState.phase,
    onEvent,
    populationReveal
  ])

  useEffect(() => {
    if (!shouldRunContinuousMotion) {
      cancelAnimation(rotation)
      return
    }

    const turn = { startProgress: progressRefs.current.rotation, startedAtMs: Date.now(), durationMs: ONBOARDING_GLOBE_LOOP_DURATION_MS }
    // Finish the turn in progress, then turn from 0 forever.
    rotation.value = progressRefs.current.rotation
    rotation.value = animateSequence(
      animateSegment(1, {
        durationMs: getRemainingDuration(
          ONBOARDING_GLOBE_LOOP_DURATION_MS,
          progressRefs.current.rotation
        )
      }),
      animateSegment(0, { durationMs: 0 }),
      repeatForever(animateSegment(1, { durationMs: ONBOARDING_GLOBE_LOOP_DURATION_MS }))
    )

    return () => {
      cancelAnimation(rotation)
      clocks.rotation = getLoopingClockProgress(turn, Date.now())
    }
  }, [clocks, rotation, shouldRunContinuousMotion])

  useEffect(() => {
    if (!shouldRunRunnerOrbit) {
      cancelAnimation(runnerOrbit)
      runnerOrbit.value = 0
      progressRefs.current.runnerOrbit = 0
      return
    }

    const easing = Easing.inOut(Easing.sin)
    runnerOrbit.value = progressRefs.current.runnerOrbit
    runnerOrbit.value = animateSequence(
      animateSegment(1, {
        durationMs: getRemainingDuration(
          ONBOARDING_RUNNER_ORBIT_DURATION_MS,
          progressRefs.current.runnerOrbit
        ),
        easing
      }),
      animateSegment(0, { durationMs: 0 }),
      repeatForever(animateSegment(1, { durationMs: ONBOARDING_RUNNER_ORBIT_DURATION_MS, easing }))
    )

    return () => {
      cancelAnimation(runnerOrbit)
    }
  }, [runnerOrbit, shouldRunRunnerOrbit])

  const sceneAccessibilityLabel = isPrelude
    ? copy.introGreeting
    : showRunners
    ? copy.worldSceneAccessibilityLabel
    : copy.worldArrivalAccessibilityLabel
  const skipWorldAnimation = copy.skipWorldAnimation
  const sceneLift = compact
    ? ONBOARDING_WORLD_SCENE_LIFT.compact
    : ONBOARDING_WORLD_SCENE_LIFT.regular
  const sceneHandoffStyle = useAnimatedStyle(() => ({
    opacity: interpolate(handoff.value, [0, 1], [1, 0]),
    transform: [
      { translateY: interpolate(handoff.value, [0, 1], [sceneLift, sceneLift - 14]) },
      { scale: interpolate(handoff.value, [0, 1], [1, 0.984]) }
    ]
  }))
  const worldRevealStyle = useAnimatedStyle(() => ({ opacity: worldReveal.value }))
  const preludeStyle = useAnimatedStyle(() => ({ opacity: preludeOpacity.value }))

  return (
    <View
      style={[styles.scene, compact ? styles.sceneCompact : null]}
      testID="onboarding-world-scene"
    >
      <Animated.View
        accessible
        accessibilityLabel={sceneAccessibilityLabel}
        accessibilityState={{ busy: !isPrelude && !worldIsReady }}
        style={[styles.sceneContent, sceneHandoffStyle]}
        testID="onboarding-world-scene-content"
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.worldComposition, worldRevealStyle]}
        >
          <OnboardingWorldHero
            arrivalProgress={arrivalProgress}
            avatarFlight={avatarFlight}
            catchProgress={catchReaction}
            chaseProgress={chase}
            compact={compact}
            compositionLift={compositionLift}
            copy={copy}
            globeImpact={globeImpact}
            globeRise={globeRise}
            landingReaction={landingReaction}
            motionEnabled={canAnimate}
            phase={introState.phase}
            populationReveal={populationReveal}
            populationValue={copy.worldPopulationValue}
            rotation={rotation}
            runnerOrbit={runnerOrbit}
            showHeroCharacter={showHeroCharacter}
            showPopulationStat={showPopulationCard}
            showRunners={showRunners}
          />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden={!isPrelude}
          importantForAccessibility={isPrelude ? "yes" : "no-hide-descendants"}
          style={[styles.preludeOverlay, preludeStyle]}
        >
          <OnboardingBrandPrelude
            compact={compact}
            greetingText={copy.introGreeting}
            motionEnabled={canAnimate && isPrelude}
            motionPreferenceResolved={motionPreferenceResolved}
            onActionsVisible={onPreludeActionsVisible}
            onSecondaryActionVisible={onPreludeSecondaryActionVisible}
            onFinished={onGreetingFinished}
            reduceMotion={reduceMotion}
            showCharacters={preludeOwnsLaunchCharacters}
            showGreetingBubble={isCharacterGreeting}
          />
        </Animated.View>
      </Animated.View>

      {!isPrelude &&
      !shouldReduceMotion &&
      !worldIsReady &&
      !handoffActive &&
      SKIPPABLE_WORLD_PHASES.has(introState.phase) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={skipWorldAnimation}
          hitSlop={8}
          onPress={() => onEvent({ type: "motion-reduced" })}
          style={({ pressed }) => [styles.skipButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.skipText}>{skipWorldAnimation}</Text>
        </Pressable>
      ) : null}

    </View>
  )
}
