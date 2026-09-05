import { useIsFocused } from "@react-navigation/native"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  AppState,
  Animated,
  Easing,
  Pressable,
  Text,
  View,
  type AppStateStatus
} from "react-native"
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
  const impactTimeline = useRef(new Animated.Value(
    shouldReduceMotion ? ONBOARDING_INTRO_TIMELINE_MS.landingComplete : 0
  )).current
  const {
    globeRise,
    globeImpact,
    avatarFlight,
    arrivalProgress,
    landingReaction,
    compositionLift
  } = useMemo(() => ({
    globeRise: impactTimeline.interpolate({
      inputRange: [...IMPACT_VISUAL_CLOCK_INPUT_RANGE],
      outputRange: [...GLOBE_RISE_OUTPUT_RANGE],
      extrapolate: "clamp"
    }),
    globeImpact: impactTimeline.interpolate({
      inputRange: [...IMPACT_VISUAL_CLOCK_INPUT_RANGE],
      outputRange: [...GLOBE_IMPACT_OUTPUT_RANGE],
      extrapolate: "clamp"
    }),
    avatarFlight: impactTimeline.interpolate({
      inputRange: [...IMPACT_VISUAL_CLOCK_INPUT_RANGE],
      outputRange: [...AVATAR_FLIGHT_OUTPUT_RANGE],
      extrapolate: "clamp"
    }),
    arrivalProgress: impactTimeline.interpolate({
      inputRange: [
        ONBOARDING_INTRO_TIMELINE_MS.impact - ONBOARDING_ARRIVAL_PREROLL_MS,
        ONBOARDING_INTRO_TIMELINE_MS.landingComplete
      ],
      outputRange: [0, 1],
      extrapolate: "clamp"
    }),
    landingReaction: impactTimeline.interpolate({
      inputRange: [...IMPACT_VISUAL_CLOCK_INPUT_RANGE],
      outputRange: [...LANDING_REACTION_OUTPUT_RANGE],
      extrapolate: "clamp"
    }),
    compositionLift: impactTimeline.interpolate({
      inputRange: [
        0,
        ...ONBOARDING_WORLD_COMPOSITION_LIFT.inputRange.map(
          (progress) => ONBOARDING_INTRO_TIMELINE_MS.impact +
            progress * (
              ONBOARDING_INTRO_TIMELINE_MS.landingComplete -
              ONBOARDING_INTRO_TIMELINE_MS.impact
            )
        )
      ],
      outputRange: [0, ...ONBOARDING_WORLD_COMPOSITION_LIFT.translateY],
      extrapolate: "clamp"
    })
  }), [impactTimeline])
  const populationReveal = useRef(new Animated.Value(shouldReduceMotion ? 1 : 0)).current
  const chase = useRef(new Animated.Value(shouldReduceMotion ? 1 : 0)).current
  const catchReaction = useRef(new Animated.Value(shouldReduceMotion ? 1 : 0)).current
  const preludeOpacity = useRef(new Animated.Value(1)).current
  const worldReveal = useRef(new Animated.Value(shouldReduceMotion ? 1 : 0)).current
  const handoff = useRef(new Animated.Value(0)).current
  const rotation = useRef(new Animated.Value(0)).current
  const runnerOrbit = useRef(new Animated.Value(0)).current
  const progressRefs = useRef({
    impactTimeline: shouldReduceMotion ? ONBOARDING_INTRO_TIMELINE_MS.landingComplete : 0,
    populationReveal: shouldReduceMotion ? 1 : 0,
    chase: shouldReduceMotion ? 1 : 0,
    catchReaction: shouldReduceMotion ? 1 : 0,
    handoff: 0,
    rotation: 0,
    runnerOrbit: 0
  })
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

  useEffect(() => {
    const subscriptions = [
      impactTimeline.addListener(({ value }) => { progressRefs.current.impactTimeline = value }),
      populationReveal.addListener(({ value }) => { progressRefs.current.populationReveal = value }),
      chase.addListener(({ value }) => { progressRefs.current.chase = value }),
      catchReaction.addListener(({ value }) => { progressRefs.current.catchReaction = value }),
      handoff.addListener(({ value }) => { progressRefs.current.handoff = value }),
      rotation.addListener(({ value }) => { progressRefs.current.rotation = value }),
      runnerOrbit.addListener(({ value }) => { progressRefs.current.runnerOrbit = value })
    ]
    return () => {
      impactTimeline.removeListener(subscriptions[0])
      populationReveal.removeListener(subscriptions[1])
      chase.removeListener(subscriptions[2])
      catchReaction.removeListener(subscriptions[3])
      handoff.removeListener(subscriptions[4])
      rotation.removeListener(subscriptions[5])
      runnerOrbit.removeListener(subscriptions[6])
    }
  }, [
    catchReaction,
    chase,
    handoff,
    impactTimeline,
    populationReveal,
    rotation,
    runnerOrbit
  ])

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
      preludeOpacity.stopAnimation()
      worldReveal.stopAnimation()
      preludeOpacity.setValue(isPrelude ? 1 : 0)
      worldReveal.setValue(isPrelude ? 0 : 1)
      return undefined
    }

    if (isPrelude) {
      preludeOpacity.stopAnimation()
      worldReveal.stopAnimation()
      impactHapticPlayedRef.current = false
      landingHapticPlayedRef.current = false
      preludeOpacity.setValue(1)
      worldReveal.setValue(0)
      return undefined
    }

    const transition = Animated.parallel([
      Animated.timing(preludeOpacity, {
        toValue: 0,
        duration: ONBOARDING_SCENE_HANDOFF_MS.preludeExit,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
        isInteraction: false
      }),
      Animated.timing(worldReveal, {
        toValue: 1,
        duration: ONBOARDING_SCENE_HANDOFF_MS.worldReveal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false
      })
    ])
    transition.start()
    return () => transition.stop()
  }, [isPrelude, preludeOpacity, shouldReduceMotion, worldReveal])

  useEffect(() => {
    if (!shouldReduceMotion) return
    impactTimeline.setValue(ONBOARDING_INTRO_TIMELINE_MS.landingComplete)
    populationReveal.setValue(sceneProgress.population)
    chase.setValue(sceneProgress.chase)
    catchReaction.setValue(sceneProgress.chase)
    handoff.setValue(0)
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
      impactTimeline.setValue(ONBOARDING_INTRO_TIMELINE_MS.landingComplete)
      populationReveal.setValue(sceneProgress.population)
      chase.setValue(sceneProgress.chase)
      catchReaction.setValue(sceneProgress.chase)
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
      handoff.stopAnimation()
      const fadeOut = Animated.timing(handoff, {
        toValue: 1,
        duration: getRemainingDuration(
          HANDOFF_DURATION_MS,
          progressRefs.current.handoff
        ),
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false
      })
      fadeOut.start()
      return () => fadeOut.stop()
    }
    if (progressRefs.current.handoff <= 0) return
    const rollback = Animated.timing(handoff, {
      toValue: 0,
      duration: Math.max(
        1,
        Math.round(HANDOFF_ROLLBACK_DURATION_MS * progressRefs.current.handoff)
      ),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false
    })
    rollback.start()
    return () => rollback.stop()
  }, [handoff, handoffActive, shouldReduceMotion])

  useEffect(() => {
    if (shouldReduceMotion) return
    if (!impactSequenceActive) {
      if (impactSequenceSettled) {
        impactTimeline.setValue(ONBOARDING_INTRO_TIMELINE_MS.landingComplete)
      }
      return
    }
    if (!canAnimate) return

    const elapsedMs = Math.max(0, Math.min(
      ONBOARDING_INTRO_TIMELINE_MS.landingComplete,
      progressRefs.current.impactTimeline
    ))
    impactTimeline.setValue(elapsedMs)
    const animation = Animated.timing(impactTimeline, {
      toValue: ONBOARDING_INTRO_TIMELINE_MS.landingComplete,
      duration: Math.max(
        1,
        ONBOARDING_INTRO_TIMELINE_MS.landingComplete - elapsedMs
      ),
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false
    })
    animation.start()
    return () => animation.stop()
  }, [
    canAnimate,
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
    let animation: Animated.CompositeAnimation | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

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
        populationReveal.setValue(
          Math.max(0, Math.min(1, elapsedBeforeRun / POPULATION_PHASE_DURATION_MS))
        )
        animation = Animated.timing(populationReveal, {
          toValue: 1,
          duration: Math.max(
            1,
            remainingPhaseDuration -
              ONBOARDING_POPULATION_COUNTER_TIMING_MS.finalHold
          ),
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        })
        timeoutId = setTimeout(() => {
          onEvent({ type: "population-finished" })
        }, remainingPhaseDuration)
        animation.start()
        break
      }
      case "chasing": {
        animation = Animated.timing(chase, {
          toValue: 1,
          duration: remainingPhaseDuration,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        })
        timeoutId = setTimeout(() => {
          onEvent({ type: "chase-finished" })
        }, remainingPhaseDuration)
        animation.start()
        break
      }
      case "catching": {
        animation = Animated.timing(catchReaction, {
          toValue: 1,
          duration: remainingPhaseDuration,
          easing: Easing.out(Easing.back(1.08)),
          useNativeDriver: true
        })
        timeoutId = setTimeout(() => {
          onEvent({ type: "catch-finished" })
        }, remainingPhaseDuration)
        animation.start()
        break
      }
      default:
        break
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      animation?.stop()
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
      rotation.stopAnimation()
      return
    }

    rotation.setValue(progressRefs.current.rotation)
    const firstTurn = Animated.timing(rotation, {
      toValue: 1,
      duration: getRemainingDuration(
        ONBOARDING_GLOBE_LOOP_DURATION_MS,
        progressRefs.current.rotation
      ),
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false
    })
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: ONBOARDING_GLOBE_LOOP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false
      }),
      { resetBeforeIteration: true }
    )

    firstTurn.start(({ finished }) => {
      if (!finished) return
      rotation.setValue(0)
      progressRefs.current.rotation = 0
      loop.start()
    })

    return () => {
      firstTurn.stop()
      loop.stop()
      rotation.stopAnimation()
    }
  }, [rotation, shouldRunContinuousMotion])

  useEffect(() => {
    if (!shouldRunRunnerOrbit) {
      runnerOrbit.stopAnimation()
      runnerOrbit.setValue(0)
      progressRefs.current.runnerOrbit = 0
      return
    }

    runnerOrbit.setValue(progressRefs.current.runnerOrbit)
    const firstCycle = Animated.timing(runnerOrbit, {
      toValue: 1,
      duration: getRemainingDuration(
        ONBOARDING_RUNNER_ORBIT_DURATION_MS,
        progressRefs.current.runnerOrbit
      ),
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: true,
      isInteraction: false
    })
    const loop = Animated.loop(
      Animated.timing(runnerOrbit, {
        toValue: 1,
        duration: ONBOARDING_RUNNER_ORBIT_DURATION_MS,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
        isInteraction: false
      }),
      { resetBeforeIteration: true }
    )

    firstCycle.start(({ finished }) => {
      if (!finished) return
      runnerOrbit.setValue(0)
      progressRefs.current.runnerOrbit = 0
      loop.start()
    })

    return () => {
      firstCycle.stop()
      loop.stop()
      runnerOrbit.stopAnimation()
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
  const sceneHandoffStyle = {
    opacity: handoff.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0]
    }),
    transform: [
      {
        translateY: handoff.interpolate({
          inputRange: [0, 1],
          outputRange: [sceneLift, sceneLift - 14]
        })
      },
      {
        scale: handoff.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.984]
        })
      }
    ]
  }

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
          style={[styles.worldComposition, { opacity: worldReveal }]}
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
          style={[styles.preludeOverlay, { opacity: preludeOpacity }]}
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
