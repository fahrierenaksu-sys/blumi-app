import { Animated, Image, StyleSheet, type ImageSourcePropType } from "react-native"
import {
  ONBOARDING_ARRIVAL_ATLAS_ASSETS,
  ONBOARDING_ARRIVAL_ATLAS_GRID
} from "./onboardingArrivalAssetCatalog"
import {
  getOnboardingArrivalImpactStartProgress,
  getOnboardingArrivalTrack,
  ONBOARDING_ARRIVAL_FRAME_COUNT,
  ONBOARDING_ARRIVAL_FRAME_VISIBILITY_START_PROGRESS,
  type OnboardingArrivalRole
} from "./onboardingArrivalMotionModel"

type MotionProgress =
  | Animated.Value
  | Animated.AnimatedInterpolation<number>

type RevealProgress =
  | Animated.Value
  | Animated.AnimatedInterpolation<number>
  | Animated.AnimatedInterpolation<string | number>
  | number

interface OnboardingArrivalCharacterProps {
  enabled: boolean
  fallbackSource: ImageSourcePropType
  progress: MotionProgress
  revealProgress?: RevealProgress
  role: OnboardingArrivalRole
  frameWidth?: number
  frameHeight?: number
}

const FRAME_CUT_WINDOW = 0.0005

function buildAtlasOffsetTrack(
  cellSize: number,
  axis: "column" | "row"
): { inputRange: number[]; outputRange: number[] } {
  const inputRange = [0]
  const outputRange = [0]
  for (let nextFrame = 1; nextFrame < ONBOARDING_ARRIVAL_FRAME_COUNT; nextFrame += 1) {
    const boundary = nextFrame / ONBOARDING_ARRIVAL_FRAME_COUNT
    const previousFrame = nextFrame - 1
    const previousCell = axis === "column"
      ? previousFrame % ONBOARDING_ARRIVAL_ATLAS_GRID.columns
      : Math.floor(previousFrame / ONBOARDING_ARRIVAL_ATLAS_GRID.columns)
    const nextCell = axis === "column"
      ? nextFrame % ONBOARDING_ARRIVAL_ATLAS_GRID.columns
      : Math.floor(nextFrame / ONBOARDING_ARRIVAL_ATLAS_GRID.columns)
    inputRange.push(boundary - FRAME_CUT_WINDOW, boundary)
    outputRange.push(-previousCell * cellSize, -nextCell * cellSize)
  }
  inputRange.push(1)
  const finalFrame = ONBOARDING_ARRIVAL_FRAME_COUNT - 1
  const finalCell = axis === "column"
    ? finalFrame % ONBOARDING_ARRIVAL_ATLAS_GRID.columns
    : Math.floor(finalFrame / ONBOARDING_ARRIVAL_ATLAS_GRID.columns)
  outputRange.push(-finalCell * cellSize)
  return { inputRange, outputRange }
}

export function OnboardingArrivalCharacter({
  enabled,
  fallbackSource,
  progress,
  revealProgress,
  role,
  frameWidth = 88,
  frameHeight = 138
}: OnboardingArrivalCharacterProps) {
  const track = getOnboardingArrivalTrack(role)
  const frameSize = { width: frameWidth, height: frameHeight }
  const atlasCellHeight = Math.min(
    frameHeight,
    frameWidth * (
      ONBOARDING_ARRIVAL_ATLAS_GRID.frameHeight /
      ONBOARDING_ARRIVAL_ATLAS_GRID.frameWidth
    )
  )

  if (!enabled) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        resizeMode="contain"
        source={fallbackSource}
        style={[styles.frame, frameSize]}
      />
    )
  }

  const visibilityGate = progress.interpolate({
    inputRange: [
      0,
      ONBOARDING_ARRIVAL_FRAME_VISIBILITY_START_PROGRESS - FRAME_CUT_WINDOW,
      ONBOARDING_ARRIVAL_FRAME_VISIBILITY_START_PROGRESS
    ],
    outputRange: [0, 0, 1],
    extrapolate: "clamp"
  })
  const arrivalOpacity = revealProgress !== undefined
    ? typeof revealProgress === "number"
      ? visibilityGate.interpolate({
        inputRange: [0, 1],
        outputRange: [0, revealProgress],
        extrapolate: "clamp"
      })
      : Animated.multiply(revealProgress, visibilityGate)
    : visibilityGate
  const fallbackOpacity = visibilityGate.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
    extrapolate: "clamp"
  })
  const displayProgress = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [getOnboardingArrivalImpactStartProgress(role), 1],
    extrapolate: "clamp"
  })
  const atlasX = buildAtlasOffsetTrack(frameWidth, "column")
  const atlasY = buildAtlasOffsetTrack(atlasCellHeight, "row")

  return (
    <Animated.View style={[styles.stage, frameSize]}>
      <Animated.Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        resizeMode="contain"
        source={fallbackSource}
        style={[styles.frame, frameSize, { opacity: fallbackOpacity }]}
      />
      <Animated.View
        style={[
          styles.rig,
          frameSize,
          {
            opacity: arrivalOpacity,
            transform: [
              { translateX: displayProgress.interpolate({ inputRange: track.inputRange, outputRange: track.translateX }) },
              { translateY: displayProgress.interpolate({ inputRange: track.inputRange, outputRange: track.translateY }) },
              { scale: displayProgress.interpolate({ inputRange: track.inputRange, outputRange: track.scale }) },
              { rotate: displayProgress.interpolate({ inputRange: track.inputRange, outputRange: track.rotate }) }
            ]
          }
        ]}
      >
        <Animated.View
          style={[
            styles.viewport,
            {
              width: frameWidth,
              height: atlasCellHeight,
              top: (frameHeight - atlasCellHeight) / 2
            }
          ]}
        >
          <Animated.Image
            accessibilityIgnoresInvertColors
            fadeDuration={0}
            resizeMode="stretch"
            source={ONBOARDING_ARRIVAL_ATLAS_ASSETS[role]}
            style={[
              styles.atlas,
              {
                width: frameWidth * ONBOARDING_ARRIVAL_ATLAS_GRID.columns,
                height: atlasCellHeight * ONBOARDING_ARRIVAL_ATLAS_GRID.rows,
                transform: [
                  { translateX: displayProgress.interpolate(atlasX) },
                  { translateY: displayProgress.interpolate(atlasY) }
                ]
              }
            ]}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  stage: { position: "absolute", left: 0, bottom: 0 },
  rig: { position: "absolute", left: 0, bottom: 0 },
  frame: { position: "absolute", left: 0, bottom: 0 },
  viewport: { position: "absolute", left: 0, overflow: "hidden" },
  atlas: { position: "absolute", left: 0, top: 0 }
})
