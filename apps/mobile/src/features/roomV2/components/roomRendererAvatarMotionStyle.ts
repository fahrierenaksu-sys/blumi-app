import type { Animated } from "react-native"
import type { RoomV2AvatarRenderItem } from "../roomV2.types"
import {
  getRenderableRoomV2AvatarMotionProfile,
  getRoomV2AvatarSittingTranslateY
} from "../roomV2AvatarMotion"

// Native-driver interpolations for the room avatar's procedural motion
// (walk bob, idle breathe, wave and dance gestures), split out of
// RoomRenderer2D so the renderer stays under its size cap.

export type RoomRendererAvatarMotion = ReturnType<typeof getRenderableRoomV2AvatarMotionProfile>

export function getAvatarMotionTranslateY(
  motion: RoomRendererAvatarMotion,
  breatheRef: Animated.Value,
  walkRef: Animated.Value,
  gestureRef: Animated.Value,
  usesIdleBreathe: boolean,
  seatRig?: RoomV2AvatarRenderItem["seatRig"],
  stageHeightPx?: number
): Animated.AnimatedInterpolation<string | number> | number {
  if (motion.state === "walking" && motion.usesRuntimeLocomotion) {
    return walkRef.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -3]
    })
  }
  if (motion.state === "sitting") {
    return getRoomV2AvatarSittingTranslateY(seatRig, stageHeightPx)
  }
  if (motion.state === "dancing" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -5]
    })
  }
  if (motion.state === "waving" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -2]
    })
  }
  if (motion.usesAnimatedAssets || !usesIdleBreathe) return 0
  return breatheRef.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1.5]
  })
}

export function getAvatarMotionScaleY(
  motion: RoomRendererAvatarMotion,
  breatheRef: Animated.Value,
  gestureRef: Animated.Value,
  usesIdleBreathe: boolean
): Animated.AnimatedInterpolation<string | number> | number {
  if (motion.state === "sitting") return 1
  if (motion.usesAnimatedAssets) return 1
  if (motion.state === "dancing" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.045]
    })
  }
  if (!usesIdleBreathe) return 1
  return breatheRef.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018]
  })
}

export function getAvatarMotionRotate(
  motion: RoomRendererAvatarMotion,
  gestureRef: Animated.Value
): Animated.AnimatedInterpolation<string | number> | string {
  if (motion.usesAnimatedAssets) return "0deg"
  if (motion.state === "dancing" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: ["-4deg", "4deg"]
    })
  }
  if (motion.state === "waving" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: ["-1deg", "3deg"]
    })
  }
  return "0deg"
}

export function getAvatarMotionTranslateX(
  motion: RoomRendererAvatarMotion,
  gestureRef: Animated.Value
): Animated.AnimatedInterpolation<string | number> | number {
  if (motion.state === "dancing" && motion.usesRuntimeGesture) {
    return gestureRef.interpolate({
      inputRange: [0, 1],
      outputRange: [-2.5, 2.5]
    })
  }
  return 0
}
