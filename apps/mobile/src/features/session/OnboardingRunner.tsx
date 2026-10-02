import { StyleSheet, type ImageSourcePropType } from "react-native"
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue
} from "react-native-reanimated"
import { ONBOARDING_RUN_ASSET_MODE } from "./onboardingRunAssetGate"
import {
  ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS,
  ONBOARDING_RUNNER_CATCH_X_OFFSETS,
  getOnboardingRunnerMotionTrack,
  getOnboardingRunnerOrbitTrack,
  getOnboardingRunnerPose,
  type OnboardingIntroPhase,
  type OnboardingRunnerRole
} from "./onboardingIntroModel"
import { APPROVED_ONBOARDING_RUN_ASSETS } from "./onboardingRunApprovedAssetCatalog"
import { getOnboardingRunAssetSet } from "./onboardingRunAssetCatalog"
import { OnboardingArrivalCharacter } from "./OnboardingArrivalCharacter"
import {
  ONBOARDING_ARRIVAL_BEATS,
  getOnboardingRunHandoffFrameIndex
} from "./onboardingArrivalMotionModel"
import {
  ONBOARDING_SHARED_CHARACTER_HEIGHT,
  ONBOARDING_SHARED_CHARACTER_WIDTH,
  ONBOARDING_WORLD_RUNNER_PROGRESS,
  getOnboardingWorldRunnerPlacement,
  getOnboardingWorldSurfaceY
} from "./onboardingWorldCompositionModel"

interface OnboardingRunnerProps {
  role: OnboardingRunnerRole
  phase: OnboardingIntroPhase
  chaseProgress: SharedValue<number>
  catchProgress: SharedValue<number>
  orbitProgress: SharedValue<number>
  /** The run cycle clock both runners share: 0 → frame count, looping. */
  sharedFrameClock: SharedValue<number>
  motionEnabled: boolean
  size: number
  anchorBottom: number
  anchorX: number
  arrivalEnabled?: boolean
  arrivalFallbackSource?: ImageSourcePropType
  arrivalProgress?: SharedValue<number>
  arrivalRevealProgress?: SharedValue<number> | number
  arrivalVisible?: boolean
}

const SELECTED_ONBOARDING_RUN_ASSETS =
  ONBOARDING_RUN_ASSET_MODE === "candidate"
    ? getOnboardingRunAssetSet("candidate")
    : APPROVED_ONBOARDING_RUN_ASSETS
const AUTHORED_RUN_FRAMES = SELECTED_ONBOARDING_RUN_ASSETS.run
const AUTHORED_JOG_FRAMES = AUTHORED_RUN_FRAMES

export const ONBOARDING_RUNNER_FRAMES = AUTHORED_RUN_FRAMES

// Both roles use six authored poses held for two ticks on the same clock.
export const RUNNER_FRAME_DURATION_MS = 60
export const RUNNER_JOG_FRAME_DURATION_MS = 60
export const ONBOARDING_RUNNER_FRAME_COUNT = 12
const LEADER_RUNNER_FRAME_CLOCK_POSITIONS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
] as const
// Sprite frames include soft transparent edge pixels. Keep transitions crisp
// so two silhouettes can never create a pale duplicate over the world.
const FRAME_CROSSFADE = 0.0005
const RUN_HANDOFF_START_PROGRESS = ONBOARDING_ARRIVAL_BEATS.landingSquash
const RUN_HANDOFF_COMPLETE_PROGRESS = 0.94

const AUTHORED_FRAME_BASELINE_OFFSETS = {
  // The female master keeps its approved six poses, each held for two ticks.
  leader: [13, 13, 22, 22, 16, 16, 5, 5, 17, 17, 15, 15],
  chaser: [13, 13, 22, 22, 16, 16, 5, 5, 17, 17, 15, 15]
} as const

/** Opacity keyframes of one run frame on the shared frame clock. */
function getFrameOpacityTrack(
  frameIndex: number,
  frameClockPositions: readonly number[]
): { inputRange: number[]; outputRange: number[] } | null {
  const frameCount = frameClockPositions.length - 1
  if (frameCount <= 1) return null
  const frameStart = frameClockPositions[frameIndex]
  const frameEnd = frameClockPositions[frameIndex + 1]
  const clockEnd = frameClockPositions[frameCount]
  if (frameStart === undefined || frameEnd === undefined || clockEnd === undefined) {
    throw new Error(`Missing onboarding frame clock position for frame ${frameIndex}`)
  }
  if (frameIndex === 0) {
    return {
      inputRange: [0, frameEnd - FRAME_CROSSFADE, frameEnd, clockEnd - FRAME_CROSSFADE, clockEnd],
      outputRange: [1, 1, 0, 0, 1]
    }
  }
  if (frameIndex === frameCount - 1) {
    return {
      inputRange: [
        0,
        frameStart - FRAME_CROSSFADE,
        frameStart,
        clockEnd - FRAME_CROSSFADE,
        clockEnd
      ],
      outputRange: [0, 0, 1, 1, 0]
    }
  }
  return {
    inputRange: [
      0,
      frameStart - FRAME_CROSSFADE,
      frameStart,
      frameEnd - FRAME_CROSSFADE,
      frameEnd,
      clockEnd
    ],
    outputRange: [0, 0, 1, 1, 0, 0]
  }
}

function RunnerFrame({
  frameClock,
  height,
  opacityTrack,
  source,
  staticOpacity,
  translateY,
  width
}: {
  frameClock: SharedValue<number>
  height: number
  opacityTrack: { inputRange: number[]; outputRange: number[] } | null
  source: ImageSourcePropType
  /** A held pose: this frame's fixed opacity instead of the clock. */
  staticOpacity: number | null
  translateY: number
  width: number
}) {
  const clockStyle = useAnimatedStyle(() => ({
    opacity: staticOpacity !== null
      ? staticOpacity
      : opacityTrack === null
        ? 1
        : interpolate(frameClock.value, opacityTrack.inputRange, opacityTrack.outputRange, Extrapolation.CLAMP)
  }))
  return (
    <Animated.Image
      accessibilityIgnoresInvertColors
      fadeDuration={0}
      resizeMode="contain"
      source={source}
      style={[styles.frame, { width, height, transform: [{ translateY }] }, clockStyle]}
    />
  )
}

function getSourceBaselineOffset(
  role: OnboardingRunnerRole,
  frameIndex: number
): number {
  const offset = AUTHORED_FRAME_BASELINE_OFFSETS[role][frameIndex]
  if (offset === undefined) {
    throw new Error(`Missing onboarding runner baseline for ${role} frame ${frameIndex}`)
  }
  return offset
}

export function OnboardingRunner({
  role,
  phase,
  chaseProgress,
  catchProgress,
  orbitProgress,
  sharedFrameClock,
  motionEnabled,
  size,
  anchorBottom,
  anchorX,
  arrivalEnabled = false,
  arrivalFallbackSource,
  arrivalProgress,
  arrivalRevealProgress,
  arrivalVisible = false
}: OnboardingRunnerProps) {
  const track = getOnboardingRunnerMotionTrack(role)
  const orbitTrack = getOnboardingRunnerOrbitTrack(role)
  const pose = getOnboardingRunnerPose(role, phase)
  const hasAnimatedPose =
    pose.animationState === "running" ||
    pose.animationState === "reacting" ||
    pose.animationState === "orbit-chase"
  const arrivalRole = role === "leader" ? "female" : "male"
  const handoffFrameIndex = getOnboardingRunHandoffFrameIndex(arrivalRole)
  // Start the shared run clock during ground contact and crossfade from the
  // matching authored pose so the character cannot freeze after landing.
  const isArrivalRunWarmup = arrivalEnabled && phase === "landing"
  const isRunning = motionEnabled && (hasAnimatedPose || isArrivalRunWarmup)
  const staticFrameIndex = isRunning
    ? null
    : isArrivalRunWarmup
      ? handoffFrameIndex
      : 0
  const catchLift = role === "leader" ? -7 : 0
  const catchTiltDeg = role === "leader" ? -3 : 0
  const frameSet = pose.animationState === "orbit-chase"
    ? AUTHORED_JOG_FRAMES[role]
    : ONBOARDING_RUNNER_FRAMES[role]
  const frameHeight = Math.round(
    size * (ONBOARDING_SHARED_CHARACTER_HEIGHT / ONBOARDING_SHARED_CHARACTER_WIDTH)
  )
  // This handoff deliberately depends on arrivalProgress, which is derived
  // from the uninterrupted UI-thread impact clock. It must not wait for the
  // later JS phase transition: that was the visible freeze after landing.
  const arrivalHandoff = arrivalVisible && arrivalProgress ? arrivalProgress : null
  const arrivalLayerStyle = useAnimatedStyle(() => ({
    opacity: arrivalHandoff
      ? interpolate(
          arrivalHandoff.value,
          [0, RUN_HANDOFF_START_PROGRESS, RUN_HANDOFF_COMPLETE_PROGRESS, 1],
          [1, 1, 0, 0],
          Extrapolation.CLAMP
        )
      : 0
  }))
  const runLayerStyle = useAnimatedStyle(() => ({
    opacity: arrivalHandoff
      ? interpolate(
          arrivalHandoff.value,
          [0, RUN_HANDOFF_START_PROGRESS, RUN_HANDOFF_COMPLETE_PROGRESS, 1],
          [0, 0, 1, 1],
          Extrapolation.CLAMP
        )
      : 1
  }))
  const readyPlacement = getOnboardingWorldRunnerPlacement(role, 1)
  const chaseInput = [...ONBOARDING_WORLD_RUNNER_PROGRESS]
  const chasePlacements = ONBOARDING_WORLD_RUNNER_PROGRESS.map((progress) =>
    getOnboardingWorldRunnerPlacement(role, progress)
  )
  const chaseTranslateX = chasePlacements.map(
    (placement) => placement.footX - readyPlacement.footX
  )
  const chaseTranslateY = chasePlacements.map(
    (placement) => placement.surfaceY - readyPlacement.surfaceY
  )
  const isOrbiting = pose.animationState === "orbit-chase"
  const orbitInput = [...orbitTrack.inputRange]
  const orbitTranslateX = isOrbiting ? [...orbitTrack.translateX] : [0, 0, 0, 0, 0]
  const orbitTranslateY = isOrbiting
    ? orbitTrack.translateX.map((translateX) =>
        getOnboardingWorldSurfaceY(readyPlacement.footX + translateX) -
        readyPlacement.surfaceY
      )
    : [0, 0, 0, 0, 0]
  const orbitScale = isOrbiting ? [...orbitTrack.scale] : [1, 1, 1, 1, 1]
  const orbitRotate = isOrbiting ? [...orbitTrack.rotate] : [0, 0, 0, 0, 0]
  const trackInput = [...track.inputRange]
  const trackScale = [...track.scale]
  const trackRotate = [...track.rotate]
  const catchInput = [0, ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS, 1]
  const catchX = [0, ONBOARDING_RUNNER_CATCH_X_OFFSETS[role], 0]
  const catchY = [0, catchLift, 0]
  const catchScale = [1, role === "leader" ? 1.03 : 1, 1]
  const catchRotate = [0, catchTiltDeg, 0]

  const rootStyle = useAnimatedStyle(() => {
    const chase = chaseProgress.value
    const caught = catchProgress.value
    const orbit = orbitProgress.value
    return {
      transform: [
        { translateX: anchorX },
        { translateX: interpolate(chase, chaseInput, chaseTranslateX) },
        { translateY: interpolate(chase, chaseInput, chaseTranslateY) },
        { translateX: interpolate(caught, catchInput, catchX) },
        { translateY: interpolate(caught, catchInput, catchY) },
        { scale: interpolate(chase, trackInput, trackScale) },
        { scale: interpolate(caught, catchInput, catchScale) },
        { rotate: `${interpolate(chase, trackInput, trackRotate)}deg` },
        { rotate: `${interpolate(caught, catchInput, catchRotate)}deg` },
        { translateX: interpolate(orbit, orbitInput, orbitTranslateX) },
        { translateY: interpolate(orbit, orbitInput, orbitTranslateY) },
        { scale: interpolate(orbit, orbitInput, orbitScale) },
        { rotate: `${interpolate(orbit, orbitInput, orbitRotate)}deg` }
      ]
    }
  })

  const runFrames = frameSet.map((_source, frameIndex) => {
    // Both characters are driven by one clock. Role-specific source rotation
    // preserves the authored landing handoff without creating a second timer.
    const sourceFrameIndex = (frameIndex + handoffFrameIndex) % frameSet.length
    const sourceFrame = frameSet[sourceFrameIndex]
    const sourceBaselineOffset = getSourceBaselineOffset(role, sourceFrameIndex)
    const frameBaselineOffset = Math.round(
      sourceBaselineOffset * (frameHeight / 384)
    )
    return (
      <RunnerFrame
        frameClock={sharedFrameClock}
        height={frameHeight}
        key={`${role}-${sourceFrameIndex}`}
        opacityTrack={getFrameOpacityTrack(frameIndex, LEADER_RUNNER_FRAME_CLOCK_POSITIONS)}
        source={sourceFrame}
        staticOpacity={staticFrameIndex === null ? null : sourceFrameIndex === staticFrameIndex ? 1 : 0}
        translateY={frameBaselineOffset}
        width={size}
      />
    )
  })

  return (
    <Animated.View
      style={[
        styles.root,
        role === "leader" ? styles.leader : styles.chaser,
        {
          width: Math.round(size * 1.06),
          height: Math.round(size * 1.48),
          bottom: anchorBottom,
          marginLeft: -Math.round(size * 0.53)
        },
        rootStyle,
        role === "chaser" ? styles.chaserDepth : null
      ]}
    >
      <Animated.View style={{ width: size, height: frameHeight }}>
        {arrivalEnabled && arrivalProgress ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.arrivalLayer, arrivalLayerStyle]}
          >
            <OnboardingArrivalCharacter
              enabled
              fallbackSource={arrivalFallbackSource ?? frameSet[0]}
              frameHeight={frameHeight}
              frameWidth={size}
              progress={arrivalProgress}
              revealProgress={arrivalRevealProgress}
              role={arrivalRole}
            />
          </Animated.View>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[styles.runLayer, runLayerStyle]}
        >
          {runFrames}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: "50%",
    alignItems: "center",
    justifyContent: "flex-end"
  },
  leader: { zIndex: 4 },
  chaser: { zIndex: 3 },
  chaserDepth: { opacity: 0.98 },
  frame: { position: "absolute", left: 0, bottom: 0 },
  arrivalLayer: { position: "absolute", inset: 0 },
  runLayer: { position: "absolute", inset: 0 }
})
