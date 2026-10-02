import { Image, StyleSheet, type ImageSourcePropType } from "react-native"
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue
} from "react-native-reanimated"
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

interface OnboardingArrivalCharacterProps {
  enabled: boolean
  fallbackSource: ImageSourcePropType
  /** The arrival clock, 0 → 1 (derived from the impact timeline). */
  progress: SharedValue<number>
  /** Extra opacity for the arrival rig: a fade-in while the globe rises. */
  revealProgress?: SharedValue<number> | number
  role: OnboardingArrivalRole
  frameWidth?: number
  frameHeight?: number
}

const FRAME_CUT_WINDOW = 0.0005
const VISIBILITY_RANGE = [
  0,
  ONBOARDING_ARRIVAL_FRAME_VISIBILITY_START_PROGRESS - FRAME_CUT_WINDOW,
  ONBOARDING_ARRIVAL_FRAME_VISIBILITY_START_PROGRESS
]

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

  return (
    <ArrivalRig
      atlasCellHeight={atlasCellHeight}
      fallbackSource={fallbackSource}
      frameHeight={frameHeight}
      frameWidth={frameWidth}
      progress={progress}
      revealProgress={revealProgress}
      role={role}
    />
  )
}

function ArrivalRig({
  atlasCellHeight,
  fallbackSource,
  frameHeight,
  frameWidth,
  progress,
  revealProgress,
  role
}: {
  atlasCellHeight: number
  fallbackSource: ImageSourcePropType
  frameHeight: number
  frameWidth: number
  progress: SharedValue<number>
  revealProgress?: SharedValue<number> | number
  role: OnboardingArrivalRole
}) {
  const frameSize = { width: frameWidth, height: frameHeight }
  const track = getOnboardingArrivalTrack(role)
  const inputRange = track.inputRange
  const translateX = track.translateX
  const translateY = track.translateY
  const scale = track.scale
  const rotate = track.rotate.map((degrees) => Number.parseFloat(degrees))
  const impactStart = getOnboardingArrivalImpactStartProgress(role)
  const atlasX = buildAtlasOffsetTrack(frameWidth, "column")
  const atlasY = buildAtlasOffsetTrack(atlasCellHeight, "row")

  const fallbackStyle = useAnimatedStyle(() => ({
    opacity: 1 - interpolate(progress.value, VISIBILITY_RANGE, [0, 0, 1], Extrapolation.CLAMP)
  }))
  const rigStyle = useAnimatedStyle(() => {
    const gate = interpolate(progress.value, VISIBILITY_RANGE, [0, 0, 1], Extrapolation.CLAMP)
    const reveal = revealProgress === undefined
      ? 1
      : typeof revealProgress === "number"
        ? revealProgress
        : revealProgress.value
    const display = interpolate(progress.value, [0, 1], [impactStart, 1], Extrapolation.CLAMP)
    return {
      opacity: gate * reveal,
      transform: [
        { translateX: interpolate(display, inputRange, translateX) },
        { translateY: interpolate(display, inputRange, translateY) },
        { scale: interpolate(display, inputRange, scale) },
        { rotate: `${interpolate(display, inputRange, rotate)}deg` }
      ]
    }
  })
  const atlasStyle = useAnimatedStyle(() => {
    const display = interpolate(progress.value, [0, 1], [impactStart, 1], Extrapolation.CLAMP)
    return {
      transform: [
        { translateX: interpolate(display, atlasX.inputRange, atlasX.outputRange) },
        { translateY: interpolate(display, atlasY.inputRange, atlasY.outputRange) }
      ]
    }
  })

  return (
    <Animated.View style={[styles.stage, frameSize]}>
      <Animated.Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        resizeMode="contain"
        source={fallbackSource}
        style={[styles.frame, frameSize, fallbackStyle]}
      />
      <Animated.View style={[styles.rig, frameSize, rigStyle]}>
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
                height: atlasCellHeight * ONBOARDING_ARRIVAL_ATLAS_GRID.rows
              },
              atlasStyle
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
