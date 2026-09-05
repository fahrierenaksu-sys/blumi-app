import { useEffect, useRef } from "react"
import { Animated, Easing, Image, Text, View, useWindowDimensions } from "react-native"
import type { AuthEntryCopy } from "./authEntryCopy"
import type { OnboardingIntroPhase } from "./onboardingIntroModel"
import {
  ONBOARDING_RUNNER_FRAME_COUNT,
  RUNNER_FRAME_DURATION_MS,
  OnboardingRunner
} from "./OnboardingRunner"
import { OnboardingArrivalCharacter } from "./OnboardingArrivalCharacter"
import { OnboardingPopulationCounter } from "./OnboardingPopulationCounter"
import { ONBOARDING_RUN_ASSET_MODE } from "../../config/env"
import { shouldUseOnboardingArrivalAssets } from "./onboardingRunAssetGate"
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
type MotionProgress = Animated.Value | Animated.AnimatedInterpolation<number>

interface OnboardingWorldHeroProps {
  copy: AuthEntryCopy
  phase: OnboardingIntroPhase
  compact: boolean
  populationValue: string
  showPopulationStat: boolean
  showHeroCharacter: boolean
  showRunners: boolean
  motionEnabled: boolean
  compositionLift: MotionProgress
  arrivalProgress: MotionProgress
  globeRise: MotionProgress
  globeImpact: MotionProgress
  avatarFlight: MotionProgress
  landingReaction: MotionProgress
  populationReveal: Animated.Value
  chaseProgress: Animated.Value
  catchProgress: Animated.Value
  rotation: Animated.Value
  runnerOrbit: Animated.Value
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
  const runnerFrameClock = useRef(new Animated.Value(0)).current
  const layout = getOnboardingWorldLayout({ width, height, compact })
  const stageScale = layout.globeSize / ONBOARDING_GLOBE_SIZE
  const leaderPlacement = getOnboardingWorldRunnerPlacement("leader", 1)
  const chaserPlacement = getOnboardingWorldRunnerPlacement("chaser", 1)
  const populationOpacity = phase === "population-counting"
    ? populationReveal.interpolate({
        inputRange: [0, 0.22, 1],
        outputRange: [0, 0.78, 1]
      })
    : showPopulationStat
      ? 1
      : 0
  const heroOpacity = phase === "population-counting"
    ? populationReveal.interpolate({
        inputRange: [0, 0.04, 0.1],
        outputRange: [1, 0.45, 0],
        extrapolate: "clamp"
      })
    : showHeroCharacter
      ? 1
      : 0
  const runnerOpacity = phase === "population-counting"
    ? populationReveal.interpolate({
        inputRange: [0, 0.04, 0.1],
        outputRange: [0, 0.55, 1],
        extrapolate: "clamp"
      })
    : showRunners
      ? 1
      : 0
  const textureTranslateX = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -ONBOARDING_TEXTURE_WIDTH]
  })
  const flight = ONBOARDING_WORLD_FLIGHT
  const populationLift = phase === "population-counting"
    ? populationReveal.interpolate({
        inputRange: [0, 1],
        outputRange: [12, 0]
      })
    : 0
  const arrivalAssetsEnabled = shouldUseOnboardingArrivalAssets(
    ONBOARDING_RUN_ASSET_MODE
  )
  const arrivalFramesEnabled =
    arrivalAssetsEnabled && shouldUseOnboardingArrivalFrames(phase)
  const arrivalReveal = phase === "globe-launching"
    ? globeRise.interpolate({
        inputRange: [
          0,
          ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS.start,
          ONBOARDING_ARRIVAL_PRELOAD_GLOBE_PROGRESS.complete
        ],
        outputRange: [0, 0, 1],
        extrapolate: "clamp"
      })
    : 1
  const showRunnerCrownMask = shouldShowOnboardingRunnerCrownMask(phase)
  const crownMaskOpacity = phase === "population-counting"
    ? populationReveal.interpolate({
        inputRange: [0, 0.2, 0.45, 1],
        outputRange: [0, 0, 1, 1]
      })
    : 1
  const pairOpacity = arrivalAssetsEnabled
    ? phase === "globe-launching"
      ? heroOpacity
      : phase === "impact"
        ? globeImpact.interpolate({
            inputRange: [0, 0.08, 0.18],
            outputRange: [1, 0.42, 0],
            extrapolate: "clamp"
          })
        : 0
    : heroOpacity
  const actorOpacity = runnerOpacity
  const unifiedActorOpacity = arrivalAssetsEnabled
    ? phase === "globe-launching"
      ? 0
      : showHeroCharacter || showRunners
        ? 1
        : 0
    : actorOpacity
  // Warm the shared run clock as feet meet the globe. Waiting for the
  // population phase leaves the final landing pose visibly frozen.
  const shouldAnimateRunners = showRunners || phase === "landing"

  useEffect(() => {
    runnerFrameClock.stopAnimation()
    runnerFrameClock.setValue(0)
    if (!motionEnabled || !shouldAnimateRunners) return undefined

    const animation = Animated.loop(
      Animated.timing(runnerFrameClock, {
        toValue: ONBOARDING_RUNNER_FRAME_COUNT,
        duration: RUNNER_FRAME_DURATION_MS * ONBOARDING_RUNNER_FRAME_COUNT,
        easing: Easing.linear,
        useNativeDriver: true
      }),
      { resetBeforeIteration: true }
    )
    animation.start()
    return () => {
      animation.stop()
    }
  }, [motionEnabled, runnerFrameClock, shouldAnimateRunners])

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
          {
            top: layout.statTop,
            opacity: populationOpacity,
            transform: [{ translateY: populationLift }]
          }
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
            transformOrigin: "top center",
            transform: [
              {
                translateY: compositionLift
              },
              { scale: stageScale }
            ]
          }
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.worldAura,
            {
              opacity: globeRise.interpolate({
                inputRange: [0, 0.35, 1],
                outputRange: [0, 0.12, 1]
              }),
              transform: [{
                scale: globeRise.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.72, 1]
                })
              }]
            }
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.impactRing,
            {
              opacity: globeImpact.interpolate({
                inputRange: [0, 0.18, 0.62, 1],
                outputRange: [0, 0.58, 0.18, 0]
              }),
              transform: [{
                scale: globeImpact.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.76, 1.18]
                })
              }]
            }
          ]}
        />
        <Animated.View
          style={[
            styles.globeWrap,
            {
              opacity: globeRise.interpolate({
                inputRange: [0, 0.04, 1],
                outputRange: [ONBOARDING_WORLD_GLOBE_INITIAL_OPACITY, 1, 1]
              }),
              transform: [
                {
                  translateY: globeRise.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      ONBOARDING_GLOBE_SIZE *
                        ONBOARDING_WORLD_GLOBE_ENTRY_OFFSET_MULTIPLIER,
                      0
                    ]
                  })
                },
                {
                  translateY: globeImpact.interpolate({
                    inputRange: [0, 0.42, 1],
                    outputRange: [0, -10, 0]
                  })
                },
                {
                  scale: globeRise.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.86, 1]
                  })
                },
                {
                  scale: globeImpact.interpolate({
                    inputRange: [0, 0.42, 1],
                    outputRange: [1, 1.025, 1]
                  })
                }
              ]
            }
          ]}
        >
          <View style={styles.globeClip}>
            <Animated.View
              style={[
                styles.textureTrack,
                { transform: [{ translateX: textureTranslateX }] }
              ]}
            >
              <Animated.Image source={WORLD_TEXTURE} resizeMode="cover" style={styles.texture} />
              <Animated.Image source={WORLD_TEXTURE} resizeMode="cover" style={styles.texture} />
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
                opacity: pairOpacity,
                width: HERO_PAIR_WIDTH,
                height: HERO_PAIR_HEIGHT,
                bottom: ONBOARDING_WORLD_HERO_BOTTOM_IN_STAGE
              }
            ]}
          >
            <Animated.View
              style={[
                styles.heroCharacter,
                styles.heroMale,
                {
                  transform: arrivalAssetsEnabled ? [] : [
                    {
                      translateY: globeImpact.interpolate({
                        inputRange: [0, 0.44, 1],
                        outputRange: [0, -12, -6]
                      })
                    },
                    {
                      translateY: avatarFlight.interpolate({
                        inputRange: [...flight.inputRange],
                        outputRange: [...flight.male.translateY]
                      })
                    },
                    {
                      translateY: landingReaction.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-10, 0]
                      })
                    },
                    {
                      translateX: avatarFlight.interpolate({
                        inputRange: [...flight.inputRange],
                        outputRange: [...flight.male.translateX]
                      })
                    },
                    {
                      scale: avatarFlight.interpolate({
                        inputRange: [...flight.inputRange],
                        outputRange: [...flight.male.scale]
                      })
                    },
                    {
                      rotate: avatarFlight.interpolate({
                        inputRange: [...flight.inputRange],
                        outputRange: [...flight.male.rotate]
                      })
                    }
                  ]
                }
              ]}
            >
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
            <Animated.View
              style={[
                styles.heroCharacter,
                styles.heroFemale,
                {
                  transform: arrivalAssetsEnabled ? [] : [
                    {
                      translateY: globeImpact.interpolate({
                        inputRange: [0, 0.44, 1],
                        outputRange: [0, -14, -7]
                      })
                    },
                    {
                      translateY: avatarFlight.interpolate({
                        inputRange: [...flight.inputRange],
                        outputRange: [...flight.female.translateY]
                      })
                    },
                    {
                      translateY: landingReaction.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-12, 0]
                      })
                    },
                    {
                      translateX: avatarFlight.interpolate({
                        inputRange: [...flight.inputRange],
                        outputRange: [...flight.female.translateX]
                      })
                    },
                    {
                      scale: avatarFlight.interpolate({
                        inputRange: [...flight.inputRange],
                        outputRange: [...flight.female.scale]
                      })
                    },
                    {
                      rotate: avatarFlight.interpolate({
                        inputRange: [...flight.inputRange],
                        outputRange: [...flight.female.rotate]
                      })
                    }
                  ]
                }
              ]}
            >
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
            style={[styles.runners, { opacity: unifiedActorOpacity }]}
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
                style={[styles.runnerCrownMask, { opacity: crownMaskOpacity }]}
              >
                <View style={styles.runnerCrownCircle}>
                  <Animated.View
                    style={[
                      styles.runnerCrownTextureTrack,
                      { transform: [{ translateX: textureTranslateX }] }
                    ]}
                  >
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
