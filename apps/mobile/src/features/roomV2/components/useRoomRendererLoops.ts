import { NavigationContext } from "@react-navigation/native"
import { useContext, useEffect, useRef, useState } from "react"
import { Animated, Easing } from "react-native"
import type { RoomRendererAvatarMotion } from "./roomRendererAvatarMotionStyle"
import {
  getRoomRendererAvatarLoops,
  shouldRunRoomRendererMarkerPulse
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

function startNativeLoop(
  value: Animated.Value,
  durationMs: number,
  easing: (value: number) => number
): Animated.CompositeAnimation {
  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: durationMs, easing, useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration: durationMs, easing, useNativeDriver: true })
    ])
  )
  loop.start()
  return loop
}

/**
 * The avatar's procedural idle loops (breathe, walk bob, wave/dance gesture)
 * on native-driver values. They stop and reset while the screen is not
 * focused and resume when it is.
 */
export function useRoomRendererAvatarLoops(input: {
  isAvatar: boolean
  avatarMotion: RoomRendererAvatarMotion
  reduceMotion: boolean
  paused: boolean
}) {
  const { isAvatar, avatarMotion, reduceMotion, paused } = input
  const breatheRef = useRef(new Animated.Value(0)).current
  const walkRef = useRef(new Animated.Value(0)).current
  const gestureRef = useRef(new Animated.Value(0)).current
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
      breatheRef.setValue(0)
      return undefined
    }
    const loop = startNativeLoop(breatheRef, 1500, Easing.inOut(Easing.sin))
    return () => {
      loop.stop()
      breatheRef.setValue(0)
    }
  }, [breatheRef, loops.breathe])

  useEffect(() => {
    if (!loops.walk) {
      walkRef.setValue(0)
      return undefined
    }
    const loop = startNativeLoop(walkRef, 190, Easing.inOut(Easing.quad))
    return () => {
      loop.stop()
      walkRef.setValue(0)
    }
  }, [loops.walk, walkRef])

  useEffect(() => {
    if (!loops.gesture) {
      gestureRef.setValue(0)
      return undefined
    }
    const loop = startNativeLoop(gestureRef, gestureDurationMs, Easing.inOut(Easing.quad))
    return () => {
      loop.stop()
      gestureRef.setValue(0)
    }
  }, [gestureDurationMs, gestureRef, loops.gesture])

  return { breatheRef, walkRef, gestureRef, usesIdleBreathe }
}

/** The tap-target marker pulse; still under Reduce Motion and while unfocused. */
export function useRoomRendererMarkerPulse(input: { reduceMotion: boolean; paused: boolean }): Animated.Value {
  const pulseRef = useRef(new Animated.Value(0)).current
  const runs = shouldRunRoomRendererMarkerPulse(input)
  useEffect(() => {
    if (!runs) {
      pulseRef.stopAnimation()
      pulseRef.setValue(0)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRef, {
          toValue: 1,
          duration: 620,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(pulseRef, {
          toValue: 0,
          duration: 620,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => {
      loop.stop()
      pulseRef.setValue(0)
    }
  }, [pulseRef, runs])
  return pulseRef
}
