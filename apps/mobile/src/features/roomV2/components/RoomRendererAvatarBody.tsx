import { useLayoutEffect, useRef } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle
} from "react-native-reanimated"
import { RoomAvatarRenderer2D } from "../../avatarV2/room/components/RoomAvatarRenderer2D"
import type { RoomV2AvatarMotionState, RoomV2AvatarRenderLayer } from "../roomV2.types"
import type { RoomRendererLiveAvatarPosition } from "./RoomRendererLiveAvatarFrame"
import {
  advanceRoomAvatarStridePhase,
  getRoomAvatarContactShadow,
  getRoomAvatarPoseTransitionDurationMs,
  getRoomAvatarPoseTransitionKind,
  getRoomAvatarPoseTransitionPose,
  getRoomAvatarStrideBob,
  getRoomAvatarStrideGain,
  getRoomAvatarStridePhaseDelta,
  getRoomAvatarWalkPathPx,
  ROOM_AVATAR_POSE_LIFT_BOX_HEIGHTS,
  ROOM_AVATAR_REDUCED_POSE_FADE_FROM_OPACITY,
  ROOM_AVATAR_REDUCED_POSE_FADE_MS,
  ROOM_AVATAR_WALK_BOB_BOX_HEIGHTS
} from "./roomAvatarBodyMotionModel"

const POSE_NONE = 0
const POSE_SIT = 1
const POSE_STAND = 2

/**
 * The room avatar's body: frames from RoomAvatarRenderer2D plus procedural
 * motion on the UI thread (VIS-02/03). A sit or stand plays a short
 * anticipation → drop/rise → settle instead of a frame swap; walk frames
 * follow the distance the live avatar covers, with a stride bob and a
 * contact shadow that answers it. Reduce Motion keeps the avatar still and
 * crossfades a pose change. Nothing here renders React per frame.
 */
export function RoomRendererAvatarBody(props: {
  layers: RoomV2AvatarRenderLayer[]
  state: RoomV2AvatarMotionState
  /** The walk shows animated frames (not the procedural fallback bob). */
  walksWithFrames: boolean
  reduceMotion: boolean
  /** The avatar box's on-screen height. */
  boxHeightPx: number
  stageWidthPx: number
  stageHeightPx: number
  live?: RoomRendererLiveAvatarPosition
  /** The existing idle/gesture motion (breathe, wave, dance, seat offset). */
  motionStyle: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>
}) {
  const { state, reduceMotion, boxHeightPx, stageWidthPx, stageHeightPx, live, walksWithFrames } = props
  const strideWalking = walksWithFrames && state === "walking" && Boolean(live) && !reduceMotion

  // Pose transition: a timeline in ms on the UI thread, read by the style.
  const poseKind = useSharedValue(POSE_NONE)
  const poseElapsed = useSharedValue(0)
  const poseOpacity = useSharedValue(1)
  const previousStateRef = useRef(state)
  useLayoutEffect(() => {
    const kind = getRoomAvatarPoseTransitionKind(previousStateRef.current, state)
    previousStateRef.current = state
    if (!kind) return
    if (reduceMotion) {
      poseKind.value = POSE_NONE
      poseOpacity.value = ROOM_AVATAR_REDUCED_POSE_FADE_FROM_OPACITY
      poseOpacity.value = withTiming(1, {
        duration: ROOM_AVATAR_REDUCED_POSE_FADE_MS,
        reduceMotion: ReduceMotion.Never
      })
      return
    }
    const durationMs = getRoomAvatarPoseTransitionDurationMs(kind)
    poseKind.value = kind === "sit" ? POSE_SIT : POSE_STAND
    poseElapsed.value = 0
    poseElapsed.value = withTiming(durationMs, {
      duration: durationMs,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never
    })
  }, [poseElapsed, poseKind, poseOpacity, reduceMotion, state])

  // Stride phase grows with the distance the live point covers on screen,
  // scaled per walk so it takes whole steps and at least one (a tap right
  // beside the avatar still steps) and ends with a foot planted.
  const strideProgress = useSharedValue(0)
  const strideGain = useSharedValue(1)
  const liveX = live?.x
  const liveY = live?.y
  const walkPath = live?.walkPath
  useAnimatedReaction(
    () => walkPath ? walkPath.value : null,
    (path, previous) => {
      if (!path || path === previous) return
      strideGain.value = getRoomAvatarStrideGain(
        strideProgress.value,
        getRoomAvatarWalkPathPx(path, stageWidthPx, stageHeightPx),
        boxHeightPx
      )
    },
    [boxHeightPx, stageHeightPx, stageWidthPx, walkPath]
  )
  useAnimatedReaction(
    () => liveX && liveY ? { x: liveX.value, y: liveY.value } : null,
    (current, previous) => {
      if (!current || !previous) return
      const distancePx = Math.hypot((current.x - previous.x) * stageWidthPx, (current.y - previous.y) * stageHeightPx)
      if (distancePx === 0) return
      strideProgress.value = advanceRoomAvatarStridePhase(
        strideProgress.value,
        getRoomAvatarStridePhaseDelta(distancePx, boxHeightPx) * strideGain.value
      )
    },
    [boxHeightPx, liveX, liveY, stageHeightPx, stageWidthPx]
  )

  const liftPx = boxHeightPx * ROOM_AVATAR_POSE_LIFT_BOX_HEIGHTS
  const bobPx = boxHeightPx * ROOM_AVATAR_WALK_BOB_BOX_HEIGHTS
  const bodyStyle = useAnimatedStyle(() => {
    const kind = poseKind.value
    const pose = kind === POSE_NONE
      ? null
      : getRoomAvatarPoseTransitionPose(kind === POSE_SIT ? "sit" : "stand", poseElapsed.value, liftPx)
    const bob = strideWalking ? getRoomAvatarStrideBob(strideProgress.value) : 0
    return {
      opacity: poseOpacity.value,
      transform: [
        { translateY: (pose ? pose.translateY : 0) - bob * bobPx },
        { scaleY: pose ? pose.scaleY : 1 }
      ]
    }
  })
  const shadowStyle = useAnimatedStyle(() => {
    const shadow = getRoomAvatarContactShadow(strideWalking ? getRoomAvatarStrideBob(strideProgress.value) : 0)
    return { opacity: shadow.opacity, transform: [{ scale: shadow.scale }] }
  })

  return (
    <View pointerEvents="none" style={styles.root}>
      {state === "sitting" ? null : (
        <Reanimated.View pointerEvents="none" style={[styles.contactShadow, shadowStyle]} />
      )}
      <Reanimated.View style={[styles.body, bodyStyle]}>
        <Reanimated.View style={[styles.fill, props.motionStyle]}>
          <RoomAvatarRenderer2D
            layers={props.layers}
            strideProgress={strideWalking ? strideProgress : undefined}
          />
        </Reanimated.View>
      </Reanimated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    height: "100%",
    zIndex: 2
  },
  body: {
    width: "100%",
    height: "100%",
    // Squash and stretch grow from the feet (foot contact ≈ 89% of the canvas).
    transformOrigin: "50% 89%"
  },
  fill: {
    width: "100%",
    height: "100%"
  },
  contactShadow: {
    position: "absolute",
    left: "32%",
    width: "36%",
    top: "86.5%",
    height: "4.5%",
    borderRadius: 999,
    backgroundColor: "rgba(32, 22, 42, 0.16)"
  }
})
