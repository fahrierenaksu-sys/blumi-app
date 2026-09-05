import {
  Animated,
  StyleSheet,
  type ImageSourcePropType
} from "react-native"
import { ONBOARDING_RUN_ASSET_MODE } from "../../config/env"
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

type MotionProgress = Animated.Value | Animated.AnimatedInterpolation<number>

interface OnboardingRunnerProps {
  role: OnboardingRunnerRole
  phase: OnboardingIntroPhase
  chaseProgress: Animated.Value
  catchProgress: Animated.Value
  orbitProgress: Animated.Value
  sharedFrameClock: Animated.Value
  motionEnabled: boolean
  size: number
  anchorBottom: number
  anchorX: number
  arrivalEnabled?: boolean
  arrivalFallbackSource?: ImageSourcePropType
  arrivalProgress?: MotionProgress
  arrivalRevealProgress?: MotionProgress | Animated.AnimatedInterpolation<string | number> | number
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

function getFrameOpacity(
  frameClock: Animated.Value,
  frameIndex: number,
  frameClockPositions: readonly number[]
) {
  const frameCount = frameClockPositions.length - 1
  if (frameCount <= 1) return 1
  const frameStart = frameClockPositions[frameIndex]
  const frameEnd = frameClockPositions[frameIndex + 1]
  const clockEnd = frameClockPositions[frameCount]
  if (frameStart === undefined || frameEnd === undefined || clockEnd === undefined) {
    throw new Error(`Missing onboarding frame clock position for frame ${frameIndex}`)
  }
  if (frameIndex === 0) {
    return frameClock.interpolate({
      inputRange: [0, frameEnd - FRAME_CROSSFADE, frameEnd, clockEnd - FRAME_CROSSFADE, clockEnd],
      outputRange: [1, 1, 0, 0, 1],
      extrapolate: "clamp"
    })
  }
  if (frameIndex === frameCount - 1) {
    return frameClock.interpolate({
      inputRange: [
        0,
        frameStart - FRAME_CROSSFADE,
        frameStart,
        clockEnd - FRAME_CROSSFADE,
        clockEnd
      ],
      outputRange: [0, 0, 1, 1, 0],
      extrapolate: "clamp"
    })
  }
  return frameClock.interpolate({
    inputRange: [
      0,
      frameStart - FRAME_CROSSFADE,
      frameStart,
      frameEnd - FRAME_CROSSFADE,
      frameEnd,
      clockEnd
    ],
    outputRange: [0, 0, 1, 1, 0, 0],
    extrapolate: "clamp"
  })
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
  const catchTilt = role === "leader" ? "-3deg" : "0deg"
  const frameSet = pose.animationState === "orbit-chase"
    ? AUTHORED_JOG_FRAMES[role]
    : ONBOARDING_RUNNER_FRAMES[role]
  const frameHeight = Math.round(
    size * (ONBOARDING_SHARED_CHARACTER_HEIGHT / ONBOARDING_SHARED_CHARACTER_WIDTH)
  )
  // This handoff deliberately depends on arrivalProgress, which is derived
  // from the uninterrupted native impact clock. It must not wait for the
  // later JS phase transition: that was the visible freeze after landing.
  const arrivalLayerOpacity = arrivalVisible && arrivalProgress
    ? arrivalProgress.interpolate({
        inputRange: [0, RUN_HANDOFF_START_PROGRESS, RUN_HANDOFF_COMPLETE_PROGRESS, 1],
        outputRange: [1, 1, 0, 0],
        extrapolate: "clamp"
      })
    : 0
  const runLayerOpacity = arrivalVisible && arrivalProgress
    ? arrivalProgress.interpolate({
        inputRange: [0, RUN_HANDOFF_START_PROGRESS, RUN_HANDOFF_COMPLETE_PROGRESS, 1],
        outputRange: [0, 0, 1, 1],
        extrapolate: "clamp"
      })
    : 1
  const readyPlacement = getOnboardingWorldRunnerPlacement(role, 1)
  const chasePlacements = ONBOARDING_WORLD_RUNNER_PROGRESS.map((progress) =>
    getOnboardingWorldRunnerPlacement(role, progress)
  )
  const chaseTranslateX = chasePlacements.map(
    (placement) => placement.footX - readyPlacement.footX
  )
  const chaseTranslateY = chasePlacements.map(
    (placement) => placement.surfaceY - readyPlacement.surfaceY
  )
  const orbitTranslateY = orbitTrack.translateX.map((translateX) =>
    getOnboardingWorldSurfaceY(readyPlacement.footX + translateX) -
    readyPlacement.surfaceY
  )
  const runFrames = frameSet.map((_source, frameIndex) => {
    // Both characters are driven by one clock. Role-specific source rotation
    // preserves the authored landing handoff without creating a second timer.
    const sourceFrameIndex = (frameIndex + handoffFrameIndex) % frameSet.length
    const sourceFrame = frameSet[sourceFrameIndex]
    const sourceBaselineOffset = getSourceBaselineOffset(role, sourceFrameIndex)
    const frameBaselineOffset = Math.round(
      sourceBaselineOffset * (frameHeight / 384)
    )
    const frameClockPositions = LEADER_RUNNER_FRAME_CLOCK_POSITIONS

    return (
      <Animated.Image
        accessibilityIgnoresInvertColors
        fadeDuration={0}
        key={`${role}-${sourceFrameIndex}`}
        resizeMode="contain"
        source={sourceFrame}
        style={[
          styles.frame,
          {
            width: size,
            height: frameHeight,
            opacity: staticFrameIndex === null
              ? getFrameOpacity(sharedFrameClock, frameIndex, frameClockPositions)
              : sourceFrameIndex === staticFrameIndex ? 1 : 0,
            transform: [{ translateY: frameBaselineOffset }]
          }
        ]}
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
          marginLeft: -Math.round(size * 0.53),
          transform: [
            { translateX: anchorX },
            {
              translateX: chaseProgress.interpolate({
                inputRange: [...ONBOARDING_WORLD_RUNNER_PROGRESS],
                outputRange: chaseTranslateX
              })
            },
            {
              translateY: chaseProgress.interpolate({
                inputRange: [...ONBOARDING_WORLD_RUNNER_PROGRESS],
                outputRange: chaseTranslateY
              })
            },
            {
              translateX: catchProgress.interpolate({
                inputRange: [0, ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS, 1],
                outputRange: [0, ONBOARDING_RUNNER_CATCH_X_OFFSETS[role], 0]
              })
            },
            {
              translateY: catchProgress.interpolate({
                inputRange: [0, ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS, 1],
                outputRange: [0, catchLift, 0]
              })
            },
            {
              scale: chaseProgress.interpolate({
                inputRange: [...track.inputRange],
                outputRange: [...track.scale]
              })
            },
            {
              scale: catchProgress.interpolate({
                inputRange: [0, ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS, 1],
                outputRange: [1, role === "leader" ? 1.03 : 1, 1]
              })
            },
            {
              rotate: chaseProgress.interpolate({
                inputRange: [...track.inputRange],
                outputRange: track.rotate.map((degrees) => `${degrees}deg`)
              })
            },
            {
              rotate: catchProgress.interpolate({
                inputRange: [0, ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS, 1],
                outputRange: ["0deg", catchTilt, "0deg"]
              })
            },
            {
              translateX: orbitProgress.interpolate({
                inputRange: [...orbitTrack.inputRange],
                outputRange: pose.animationState === "orbit-chase"
                  ? [...orbitTrack.translateX]
                  : [0, 0, 0, 0, 0]
              })
            },
            {
              translateY: orbitProgress.interpolate({
                inputRange: [...orbitTrack.inputRange],
                outputRange: pose.animationState === "orbit-chase"
                  ? orbitTranslateY
                  : [0, 0, 0, 0, 0]
              })
            },
            {
              scale: orbitProgress.interpolate({
                inputRange: [...orbitTrack.inputRange],
                outputRange: pose.animationState === "orbit-chase"
                  ? [...orbitTrack.scale]
                  : [1, 1, 1, 1, 1]
              })
            },
            {
              rotate: orbitProgress.interpolate({
                inputRange: [...orbitTrack.inputRange],
                outputRange: pose.animationState === "orbit-chase"
                  ? orbitTrack.rotate.map((degrees) => `${degrees}deg`)
                  : ["0deg", "0deg", "0deg", "0deg", "0deg"]
              })
            }
          ]
        },
        role === "chaser" ? styles.chaserDepth : null
      ]}
    >
      {pose.showGroundShadow ? (
        <Animated.View
              style={[
                styles.groundShadow,
                {
                  width: Math.round(size * 0.48),
                  height: Math.max(7, Math.round(size * 0.08)),
                  borderRadius: Math.round(size * 0.24),
              opacity: catchProgress.interpolate({
                inputRange: [0, ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS, 1],
                outputRange: [0.07, 0.045, 0.07]
              }),
              transform: [
                {
                  scaleX: catchProgress.interpolate({
                    inputRange: [0, ONBOARDING_RUNNER_CATCH_KEYFRAME_PROGRESS, 1],
                    outputRange: role === "leader" ? [1, 0.78, 1] : [1, 1, 1]
                  })
                },
                    {
                  scaleX: orbitProgress.interpolate({
                    inputRange: [...orbitTrack.inputRange],
                        outputRange: pose.animationState === "orbit-chase"
                          ? role === "leader"
                            ? [1, 0.92, 0.8, 0.88, 1]
                            : [0.92, 0.8, 0.66, 0.78, 0.92]
                          : [1, 1, 1, 1, 1]
                      })
                    }
              ]
            }
          ]}
        />
      ) : null}
      <Animated.View style={{ width: size, height: frameHeight }}>
        {arrivalEnabled && arrivalProgress ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.arrivalLayer, { opacity: arrivalLayerOpacity }]}
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
          style={[styles.runLayer, { opacity: runLayerOpacity }]}
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
  runLayer: { position: "absolute", inset: 0 },
  groundShadow: {
    position: "absolute",
    bottom: 3,
    backgroundColor: "rgba(31,96,115,0.16)",
    shadowColor: "#2F8CAA",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  }
})
