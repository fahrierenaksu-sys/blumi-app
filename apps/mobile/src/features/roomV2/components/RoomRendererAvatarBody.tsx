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
import { AvatarLive } from "../../avatar/components/AvatarLive"
import type { RoomAvatar25dBodyProps, RoomAvatar25dSpec } from "../../avatar/roomAvatarSeamContract"
import type { RoomV2AvatarMotionState } from "../roomV2.types"
import type { RoomRendererLiveAvatarPosition } from "./RoomRendererLiveAvatarFrame"
import {
  advanceRoomAvatarStridePhase,
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
 * The room avatar's body: the 2.5D AvatarLive drawing plus procedural
 * motion on the UI thread (VIS-02/03). A sit or stand plays a short
 * anticipation → drop/rise → settle instead of a frame swap; walk frames
 * follow the distance the live avatar covers, with a stride bob. No shadow
 * is drawn under the character (owner decision, 2026-10-02). Reduce Motion keeps the avatar still and
 * crossfades a pose change. Nothing here renders React per frame.
 */
export function RoomRendererAvatarBody(props: {
  /** The 2.5D avatar to draw; unset only where the room seam is not installed (plain Node tests): nothing is drawn. */
  avatar25d?: RoomAvatar25dSpec
  /** The motion style already flips the avatar horizontally. */
  outerMirrored?: boolean
  /** The motion style's seated drop and the seat's own height (px), for the 2.5D body's seated placement. */
  seatPlacement?: RoomAvatar25dBodyProps["seatPlacement"]
  /** Room calibration: the 2.5D figure's height (px), soles on the floor point. */
  calibratedFigureHeightPx?: number
  state: RoomV2AvatarMotionState
  /** The walk shows animated frames (not the procedural fallback bob). */
  walksWithFrames: boolean
  reduceMotion: boolean
  /** The avatar box's on-screen height. */
  boxHeightPx: number
  stageWidthPx: number
  stageHeightPx: number
  live?: RoomRendererLiveAvatarPosition
  /** The existing idle/gesture motion (breathe, wave, seat offset). */
  motionStyle: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>
  /** Every layer of the avatar is on screen (the live avatar surface, AvatarLive). */
  onAllLayersShown?: () => void
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

  const stageWidth = useSharedValue(stageWidthPx)
  const stageHeight = useSharedValue(stageHeightPx)
  useLayoutEffect(() => {
    stageWidth.value = stageWidthPx
    stageHeight.value = stageHeightPx
  }, [stageHeight, stageHeightPx, stageWidth, stageWidthPx])

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

  return (
    <View pointerEvents="none" style={styles.root}>
      <Reanimated.View style={[styles.body, bodyStyle]}>
        <Reanimated.View style={[styles.fill, props.motionStyle]}>
          {props.avatar25d ? (
            <AvatarLive
              spec={props.avatar25d}
              liveScope="screen"
              live={live}
              stageWidthPx={stageWidth}
              stageHeightPx={stageHeight}
              outerMirrored={props.outerMirrored}
              seatPlacement={props.seatPlacement}
              calibratedFigureHeightPx={props.calibratedFigureHeightPx}
              reduceMotion={reduceMotion}
              boxHeightPx={boxHeightPx}
              onDrawn={props.onAllLayersShown}
            />
          ) : null}
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
  }
})
