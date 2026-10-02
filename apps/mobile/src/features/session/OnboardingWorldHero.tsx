import { useEffect } from "react"
import { Image, Text, View, useWindowDimensions } from "react-native"
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue
} from "react-native-reanimated"
import { animateSegment, repeatForever } from "../../ui/motion"
import type { AuthEntryCopy } from "./authEntryCopy"
import type { OnboardingIntroPhase } from "./onboardingIntroModel"
import {
  ONBOARDING_RUNNER_FRAME_COUNT,
  RUNNER_FRAME_DURATION_MS,
  OnboardingRunner
} from "./OnboardingRunner"
import { OnboardingArrivalCharacter } from "./OnboardingArrivalCharacter"
import { OnboardingPopulationCounter } from "./OnboardingPopulationCounter"
import {
  ONBOARDING_RUN_ASSET_MODE,
  shouldUseOnboardingArrivalAssets
} from "./onboardingRunAssetGate"
import {
  ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS,
  shouldShowOnboardingRunnerCrownMask,
  shouldUseOnboardingArrivalFrames
} from "./onboardingArrivalMotionModel"
import {
  ONBOARDING_HERO_FRAME,
  ONBOARDING_MALE_HERO_FRAME
} from "./OnboardingGreetingPair"
import {
  ONBOARDING_SHARED_CHARACTER_HEIGHT,
  ONBOARDING_SHARED_CHARACTER_STAGE_OFFSET,
  ONBOARDING_SHARED_CHARACTER_WIDTH,
  ONBOARDING_WORLD_FLIGHT,
  ONBOARDING_WORLD_GLOBE_ENTRY_OFFSET_MULTIPLIER,
  ONBOARDING_WORLD_GLOBE_INITIAL_OPACITY,
  ONBOARDING_WORLD_HERO_BOTTOM_IN_STAGE,
  ONBOARDING_RUNNER_SURFACE_EMBED,
  getOnboardingWorldLayout,
  getOnboardingWorldRunnerPlacement
} from "./onboardingWorldCompositionModel"
import {
  ONBOARDING_GLOBE_SIZE,
  ONBOARDING_TEXTURE_WIDTH,
  onboardingWorldSceneStyles as styles
} from "./onboardingWorldSceneStyles"

const WORLD_TEXTURE = require("./assets/blumi_world_intro_texture_v1.webp")
const HERO_PAIR_HEIGHT = ONBOARDING_SHARED_CHARACTER_HEIGHT
const HERO_PAIR_WIDTH = 232
const FLIGHT_INPUT = [...ONBOARDING_WORLD_FLIGHT.inputRange]
const FLIGHT = {
  male: {
    translateX: [...ONBOARDING_WORLD_FLIGHT.male.translateX],
    translateY: [...ONBOARDING_WORLD_FLIGHT.male.translateY],
    scale: [...ONBOARDING_WORLD_FLIGHT.male.scale],
    rotate: ONBOARDING_WORLD_FLIGHT.male.rotate.map((degrees) => Number.parseFloat(degrees))
  },
  female: {
    translateX: [...ONBOARDING_WORLD_FLIGHT.female.translateX],
    translateY: [...ONBOARDING_WORLD_FLIGHT.female.translateY],
    scale: [...ONBOARDING_WORLD_FLIGHT.female.scale],
    rotate: ONBOARDING_WORLD_FLIGHT.female.rotate.map((degrees) => Number.parseFloat(degrees))
  }
}
const ARRIVAL_REVEAL_INPUT = [
  0,
  ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS.start,
  ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS.complete
]

interface OnboardingWorldHeroProps {
  copy: AuthEntryCopy
  phase: OnboardingIntroPhase
  compact: boolean
  populationValue: string
  showPopulationStat: boolean
  showHeroCharacter: boolean
  showRunners: boolean
  motionEnabled: boolean
  compositionLift: SharedValue<number>
  arrivalProgress: SharedValue<number>
  globeRise: SharedValue<number>
  globeImpact: SharedValue<number>
  avatarFlight: SharedValue<number>
  landingReaction: SharedValue<number>
  populationReveal: SharedValue<number>
  chaseProgress: SharedValue<number>
  catchProgress: SharedValue<number>
  rotation: SharedValue<number>
  runnerOrbit: SharedValue<number>
}

export function OnboardingWorldHero({
  copy,
  phase,
  compact,
  populationValue,
  showPopulationStat,
  showHeroCharacter,
  showRunners,
  motionEnabled,
  compositionLift,
  arrivalProgress,
  globeRise,
  globeImpact,
  avatarFlight,
  landingReaction,
  populationReveal,
  chaseProgress,
  catchProgress,
  rotation,
  runnerOrbit
}: OnboardingWorldHeroProps) {
  const { width, height } = useWindowDimensions()
  // One run cycle clock for both runners (0 → frame count, looping).
  const runnerFrameClock = useSharedValue(0)
  const layout = getOnboardingWorldLayout({ width, height, compact })
  const stageScale = layout.globeSize / ONBOARDING_GLOBE_SIZE
  const leaderPlacement = getOnboardingWorldRunnerPlacement("leader", 1)
  const chaserPlacement = getOnboardingWorldRunnerPlacement("chaser", 1)
  const counting = phase === "population-counting"
  const arrivalAssetsEnabled = shouldUseOnboardingArrivalAssets(
    ONBOARDING_RUN_ASSET_MODE
  )
  const arrivalFramesEnabled =
    arrivalAssetsEnabled && shouldUseOnboardingArrivalFrames(phase)
  const globeLaunching = phase === "globe-launching"
  const impactPhase = phase === "impact"
  const showRunnerCrownMask = shouldShowOnboardingRunnerCrownMask(phase)
  const unifiedActorOpacityHeld = arrivalAssetsEnabled
    ? globeLaunching
      ? 0
      : showHeroCharacter || showRunners
        ? 1
        : 0
    : null
  // Warm the shared run clock as feet meet the globe. Waiting for the
  // population phase leaves the final landing pose visibly frozen.
  const shouldAnimateRunners = showRunners || phase === "landing"

  useEffect(() => {
    cancelAnimation(runnerFrameClock)
    runnerFrameClock.value = 0
    if (!motionEnabled || !shouldAnimateRunners) return undefined

    runnerFrameClock.value = repeatForever(animateSegment(ONBOARDING_RUNNER_FRAME_COUNT, {
      durationMs: RUNNER_FRAME_DURATION_MS * ONBOARDING_RUNNER_FRAME_COUNT
    }))
    return () => {
      cancelAnimation(runnerFrameClock)
    }
  }, [motionEnabled, runnerFrameClock, shouldAnimateRunners])

  const arrivalReveal = useDerivedValue(() => globeLaunching
    ? interpolate(globeRise.value, ARRIVAL_REVEAL_INPUT, [0, 0, 1], Extrapolation.CLAMP)
    : 1)
  const heroOpacity = (reveal: number) => {
    "worklet"
    return counting
      ? interpolate(reveal, [0, 0.04, 0.1], [1, 0.45, 0], Extrapolation.CLAMP)
      : showHeroCharacter ? 1 : 0
  }

  const populationStyle = useAnimatedStyle(() => ({
    opacity: counting
      ? interpolate(populationReveal.value, [0, 0.22, 1], [0, 0.78, 1])
      : showPopulationStat ? 1 : 0,
    transform: [{ translateY: counting ? interpolate(populationReveal.value, [0, 1], [12, 0]) : 0 }]
  }))
  const stageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: compositionLift.value }, { scale: stageScale }]
  }))
  const auraStyle = useAnimatedStyle(() => ({
    opacity: interpolate(globeRise.value, [0, 0.35, 1], [0, 0.12, 1]),
    transform: [{ scale: interpolate(globeRise.value, [0, 1], [0.72, 1]) }]
  }))
  const impactRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(globeImpact.value, [0, 0.18, 0.62, 1], [0, 0.58, 0.18, 0]),
    transform: [{ scale: interpolate(globeImpact.value, [0, 1], [0.76, 1.18]) }]
  }))
  const globeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(globeRise.value, [0, 0.04, 1], [ONBOARDING_WORLD_GLOBE_INITIAL_OPACITY, 1, 1]),
    transform: [
      {
        translateY: interpolate(globeRise.value, [0, 1], [
          ONBOARDING_GLOBE_SIZE * ONBOARDING_WORLD_GLOBE_ENTRY_OFFSET_MULTIPLIER,
          0
        ])
      },
      { translateY: interpolate(globeImpact.value, [0, 0.42, 1], [0, -10, 0]) },
      { scale: interpolate(globeRise.value, [0, 1], [0.86, 1]) },
      { scale: interpolate(globeImpact.value, [0, 0.42, 1], [1, 1.025, 1]) }
    ]
  }))
  // The texture scrolls one full width per turn; the runners' crown mask
  // scrolls the same texture in step.
  const textureStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(rotation.value, [0, 1], [0, -ONBOARDING_TEXTURE_WIDTH]) }]
  }))
  const crownTextureStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(rotation.value, [0, 1], [0, -ONBOARDING_TEXTURE_WIDTH]) }]
  }))
  const heroPairStyle = useAnimatedStyle(() => ({
    opacity: arrivalAssetsEnabled
      ? globeLaunching
        ? heroOpacity(populationReveal.value)
        : impactPhase
          ? interpolate(globeImpact.value, [0, 0.08, 0.18], [1, 0.42, 0], Extrapolation.CLAMP)
          : 0
      : heroOpacity(populationReveal.value)
  }))
  const maleFlightStyle = useAnimatedStyle(() => {
    if (arrivalAssetsEnabled) return { transform: [] }
    const flight = avatarFlight.value
    return {
      transform: [
        { translateY: interpolate(globeImpact.value, [0, 0.44, 1], [0, -12, -6]) },
        { translateY: interpolate(flight, FLIGHT_INPUT, FLIGHT.male.translateY) },
        { translateY: interpolate(landingReaction.value, [0, 1], [-10, 0]) },
        { translateX: interpolate(flight, FLIGHT_INPUT, FLIGHT.male.translateX) },
        { scale: interpolate(flight, FLIGHT_INPUT, FLIGHT.male.scale) },
        { rotate: `${interpolate(flight, FLIGHT_INPUT, FLIGHT.male.rotate)}deg` }
      ]
    }
  })
  const femaleFlightStyle = useAnimatedStyle(() => {
    if (arrivalAssetsEnabled) return { transform: [] }
    const flight = avatarFlight.value
    return {
      transform: [
        { translateY: interpolate(globeImpact.value, [0, 0.44, 1], [0, -14, -7]) },
        { translateY: interpolate(flight, FLIGHT_INPUT, FLIGHT.female.translateY) },
        { translateY: interpolate(landingReaction.value, [0, 1], [-12, 0]) },
        { translateX: interpolate(flight, FLIGHT_INPUT, FLIGHT.female.translateX) },
        { scale: interpolate(flight, FLIGHT_INPUT, FLIGHT.female.scale) },
        { rotate: `${interpolate(flight, FLIGHT_INPUT, FLIGHT.female.rotate)}deg` }
      ]
    }
  })
  const runnersStyle = useAnimatedStyle(() => ({
    opacity: unifiedActorOpacityHeld !== null
      ? unifiedActorOpacityHeld
      : counting
        ? interpolate(populationReveal.value, [0, 0.04, 0.1], [0, 0.55, 1], Extrapolation.CLAMP)
        : showRunners ? 1 : 0
  }))
  const crownMaskStyle = useAnimatedStyle(() => ({
    opacity: counting
      ? interpolate(populationReveal.value, [0, 0.2, 0.45, 1], [0, 0, 1, 1])
      : 1
  }))

  return (
    <View style={styles.worldComposition}>
      <Animated.View
        accessible={showPopulationStat}
        accessibilityElementsHidden={!showPopulationStat}
        accessibilityLabel={copy.worldPopulationAccessibilityLabel}
        importantForAccessibility={showPopulationStat ? "yes" : "no-hide-descendants"}
        pointerEvents="none"
        style={[
          styles.populationStat,
          compact ? styles.populationStatCompact : null,
          { top: layout.statTop },
          populationStyle
        ]}
      >
        <Text maxFontSizeMultiplier={1.2} style={styles.populationLead}>
          {copy.worldPopulationLead}
        </Text>
        <OnboardingPopulationCounter
          compact={compact}
          progress={populationReveal}
          value={populationValue}
        />
        <Text maxFontSizeMultiplier={1.3} style={styles.populationTail}>
          {copy.worldPopulationTail}
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.worldStage,
          compact ? styles.worldStageCompact : null,
          {
            top: "50%",
            marginTop: ONBOARDING_SHARED_CHARACTER_STAGE_OFFSET,
            transformOrigin: "top center"
          },
          stageStyle
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.worldAura, auraStyle]} />
        <Animated.View pointerEvents="none" style={[styles.impactRing, impactRingStyle]} />
        <Animated.View style={[styles.globeWrap, globeStyle]}>
          <View style={styles.globeClip}>
            <Animated.View style={[styles.textureTrack, textureStyle]}>
              <Image source={WORLD_TEXTURE} resizeMode="cover" style={styles.texture} />
              <Image source={WORLD_TEXTURE} resizeMode="cover" style={styles.texture} />
            </Animated.View>
            <View pointerEvents="none" style={styles.globeHighlight} />
            <View pointerEvents="none" style={styles.globeShade} />
            <View pointerEvents="none" style={styles.globeAtmosphereEdge} />
          </View>
        </Animated.View>

        <View pointerEvents="none" style={styles.pairRig}>
          <Animated.View
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[
              styles.heroPair,
              {
                width: HERO_PAIR_WIDTH,
                height: HERO_PAIR_HEIGHT,
                bottom: ONBOARDING_WORLD_HERO_BOTTOM_IN_STAGE
              },
              heroPairStyle
            ]}
          >
            <Animated.View style={[styles.heroCharacter, styles.heroMale, maleFlightStyle]}>
              <OnboardingArrivalCharacter
                enabled={arrivalAssetsEnabled}
                fallbackSource={ONBOARDING_MALE_HERO_FRAME}
                progress={arrivalProgress}
                revealProgress={arrivalReveal}
                role="male"
                frameHeight={ONBOARDING_SHARED_CHARACTER_HEIGHT}
                frameWidth={ONBOARDING_SHARED_CHARACTER_WIDTH}
              />
            </Animated.View>
            <Animated.View style={[styles.heroCharacter, styles.heroFemale, femaleFlightStyle]}>
              <OnboardingArrivalCharacter
                enabled={arrivalAssetsEnabled}
                fallbackSource={ONBOARDING_HERO_FRAME}
                progress={arrivalProgress}
                revealProgress={arrivalReveal}
                role="female"
                frameHeight={ONBOARDING_SHARED_CHARACTER_HEIGHT}
                frameWidth={ONBOARDING_SHARED_CHARACTER_WIDTH}
              />
            </Animated.View>
          </Animated.View>

          <Animated.View
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[styles.runners, runnersStyle]}
          >
            <OnboardingRunner
              arrivalEnabled={arrivalAssetsEnabled}
              arrivalFallbackSource={ONBOARDING_MALE_HERO_FRAME}
              arrivalProgress={arrivalProgress}
              arrivalRevealProgress={arrivalReveal}
              arrivalVisible={arrivalFramesEnabled}
              anchorBottom={ONBOARDING_GLOBE_SIZE - chaserPlacement.surfaceY - ONBOARDING_RUNNER_SURFACE_EMBED}
              anchorX={chaserPlacement.footX}
              catchProgress={catchProgress}
              chaseProgress={chaseProgress}
              motionEnabled={motionEnabled}
              orbitProgress={runnerOrbit}
              sharedFrameClock={runnerFrameClock}
              phase={phase}
              role="chaser"
              size={ONBOARDING_SHARED_CHARACTER_WIDTH}
            />
            <OnboardingRunner
              arrivalEnabled={arrivalAssetsEnabled}
              arrivalFallbackSource={ONBOARDING_HERO_FRAME}
              arrivalProgress={arrivalProgress}
              arrivalRevealProgress={arrivalReveal}
              arrivalVisible={arrivalFramesEnabled}
              anchorBottom={ONBOARDING_GLOBE_SIZE - leaderPlacement.surfaceY - ONBOARDING_RUNNER_SURFACE_EMBED}
              anchorX={leaderPlacement.footX}
              catchProgress={catchProgress}
              chaseProgress={chaseProgress}
              motionEnabled={motionEnabled}
              orbitProgress={runnerOrbit}
              sharedFrameClock={runnerFrameClock}
              phase={phase}
              role="leader"
              size={ONBOARDING_SHARED_CHARACTER_WIDTH}
            />
            {showRunnerCrownMask ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.runnerCrownMask, crownMaskStyle]}
              >
                <View style={styles.runnerCrownCircle}>
                  <Animated.View style={[styles.runnerCrownTextureTrack, crownTextureStyle]}>
                    <Image source={WORLD_TEXTURE} resizeMode="cover" style={styles.runnerCrownTexture} />
                    <Image source={WORLD_TEXTURE} resizeMode="cover" style={styles.runnerCrownTexture} />
                  </Animated.View>
                  <View pointerEvents="none" style={styles.runnerCrownRim} />
                </View>
              </Animated.View>
            ) : null}
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  )
}
