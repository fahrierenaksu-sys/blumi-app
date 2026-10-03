import { useEffect, useLayoutEffect, useRef } from "react"
import { useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated"
import { scheduleOnUI } from "react-native-worklets"
import { animateTo, resolveMotion } from "../../../ui/motion"
import {
  applyMiniRoomPoseOffset, MINI_ROOM_NO_POSE_OFFSET,
  resolveMiniRoomPose, resolveMiniRoomPoseEndpoints, resolveMiniRoomPoseOffset, type MiniRoomPoseInput
} from "./miniRoomTransitionModel"

/**
 * ROOM-15: one continuous MiniRoom scene. The room camera, the chat paper and
 * the composer are a single pose, mixed on the UI thread from the two resting
 * poses at the keyboard's own progress (useMiniRoomKeyboard). Nothing here
 * runs a clock of its own for the keyboard, so nothing can start late or jump
 * when the keyboard arrives, and a reversal mid-way just follows the keyboard.
 *
 * Changes that are not the keyboard (a draft growing a line, a measured
 * message) settle on the `smooth` token from the visible pose. The room stays
 * horizontally fixed while avatars move; only the keyboard pose reframes it.
 * Reduce Motion lands every pose at once and crossfades the paper's content
 * (ui/motion `crossfade`).
 */
export function useMiniRoomCameraTransform(input: {
  poseInput: MiniRoomPoseInput
  keyboard: { visible: boolean; progress: SharedValue<number>; openHeight: SharedValue<number> }
  reduceMotion: boolean
}) {
  const { poseInput, keyboard, reduceMotion } = input
  const { progress, openHeight, visible } = keyboard
  const appliedInput = useSharedValue(poseInput)
  const offset = useSharedValue(MINI_ROOM_NO_POSE_OFFSET)
  const offsetWeight = useSharedValue(0)
  const endpoints = useDerivedValue(() => applyMiniRoomPoseOffset(
    resolveMiniRoomPoseEndpoints(appliedInput.value, openHeight.value), offset.value, offsetWeight.value))
  const transition = useDerivedValue(() => resolveMiniRoomPose(endpoints.value, progress.value))

  // Under Reduce Motion the pose snaps, so the history ↔ recent handoff fades
  // on its own; otherwise the content follows the moving paper.
  const contentFade = useSharedValue(visible ? 1 : 0)
  useEffect(() => {
    if (!reduceMotion) return
    contentFade.value = animateTo(visible ? 1 : 0, resolveMotion(true).crossfade)
  }, [contentFade, reduceMotion, visible])
  const contentProgress = useDerivedValue(() => reduceMotion ? contentFade.value : transition.value.progress)

  const lastInput = useRef(poseInput)
  useLayoutEffect(() => {
    if (lastInput.current === poseInput) return
    lastInput.current = poseInput
    const settle = resolveMotion(reduceMotion).smooth
    scheduleOnUI((next: MiniRoomPoseInput) => {
      "worklet"
      const height = openHeight.value
      const before = applyMiniRoomPoseOffset(
        resolveMiniRoomPoseEndpoints(appliedInput.value, height), offset.value, offsetWeight.value)
      appliedInput.value = next
      offset.value = resolveMiniRoomPoseOffset(before, resolveMiniRoomPoseEndpoints(next, height))
      offsetWeight.value = 1
      offsetWeight.value = animateTo(0, settle)
    }, poseInput)
  }, [appliedInput, offset, offsetWeight, openHeight, poseInput, reduceMotion])

  const cameraStyle = useAnimatedStyle(() => {
    const frame = transition.value
    return {
      transform: [{ translateX: frame.cameraX }, { translateY: frame.cameraY }, { scale: frame.cameraScale }]
    }
  })
  return { cameraStyle, transition, contentProgress }
}
