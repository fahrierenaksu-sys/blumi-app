import { NavigationContext } from "@react-navigation/native"
import { useContext, useEffect, useState } from "react"
import {
  Easing,
  ReduceMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type EasingFunction,
  type SharedValue
} from "react-native-reanimated"
import type { RoomRendererAvatarMotion } from "./roomRendererAvatarMotionStyle"
import {
  getRoomRendererAvatarLoops
} from "./roomRendererLoopModel"

/**
 * Whether the screen hosting the room is focused. Pages of the main-tab pager
 * get per-page focus from their navigation object, so a mounted but hidden
 * My Room page reads as unfocused. Outside a navigator (previews, tests) the
 * room counts as focused.
 */
export function useRoomRendererScreenFocused(): boolean {
  const navigation = useContext(NavigationContext)
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true)
  useEffect(() => {
    if (!navigation) return undefined
    setFocused(navigation.isFocused())
    const unsubscribeFocus = navigation.addListener("focus", () => setFocused(true))
    const unsubscribeBlur = navigation.addListener("blur", () => setFocused(false))
    return () => {
      unsubscribeFocus()
      unsubscribeBlur()
    }
  }, [navigation])
  return focused
}

/** A 0 → 1 → 0 loop on the UI thread. */
function startLoop(
  value: SharedValue<number>,
  durationMs: number,
  easing: EasingFunction
): void {
  const half = { duration: durationMs, easing, reduceMotion: ReduceMotion.Never }
  value.value = withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), -1)
}

/**
 * The avatar's procedural idle loops (breathe, walk bob, wave/dance gesture)
 * as UI-thread shared values. They stop and reset while the screen is not
 * focused and resume when it is.
 */
export function useRoomRendererAvatarLoops(input: {
  isAvatar: boolean
  avatarMotion: RoomRendererAvatarMotion
  reduceMotion: boolean
  paused: boolean
}) {
  const { isAvatar, avatarMotion, reduceMotion, paused } = input
  const breathe = useSharedValue(0)
  const walk = useSharedValue(0)
  const gesture = useSharedValue(0)
  // Whether the idle transform uses the breathe value (unchanged by pausing).
  const usesIdleBreathe =
    isAvatar &&
    avatarMotion.state === "idle" &&
    !avatarMotion.usesAnimatedAssets &&
    !reduceMotion
  const loops = getRoomRendererAvatarLoops({
    isAvatar,
    state: avatarMotion.state,
    usesAnimatedAssets: avatarMotion.usesAnimatedAssets,
    usesRuntimeLocomotion: avatarMotion.usesRuntimeLocomotion,
    usesRuntimeGesture: avatarMotion.usesRuntimeGesture,
    reduceMotion,
    paused
  })
  const gestureDurationMs = avatarMotion.state === "dancing" ? 260 : 420

  useEffect(() => {
    if (!loops.breathe) {
      breathe.value = 0
      return
    }
    startLoop(breathe, 1500, Easing.inOut(Easing.sin))
    return () => { breathe.value = 0 }
  }, [breathe, loops.breathe])

  useEffect(() => {
    if (!loops.walk) {
      walk.value = 0
      return
    }
    startLoop(walk, 190, Easing.inOut(Easing.quad))
    return () => { walk.value = 0 }
  }, [loops.walk, walk])

  useEffect(() => {
    if (!loops.gesture) {
      gesture.value = 0
      return
    }
    startLoop(gesture, gestureDurationMs, Easing.inOut(Easing.quad))
    return () => { gesture.value = 0 }
  }, [gesture, gestureDurationMs, loops.gesture])

  return { breathe, walk, gesture, usesIdleBreathe }
}
