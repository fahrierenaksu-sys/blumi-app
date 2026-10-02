import { useEffect } from "react"
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
import {
  MINI_ROOM_AVATAR_LOOPS,
  type MiniRoomAvatarLoops
} from "./miniRoomReducedMotion"

/** A 0 → 1 → 0 cycle on the UI thread, `iterations` times (-1 = forever). */
function startCycle(value: SharedValue<number>, halfMs: number, easing: EasingFunction, iterations: number): void {
  const half = { duration: halfMs, easing, reduceMotion: ReduceMotion.Never }
  value.value = withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), iterations)
}

/**
 * A MiniRoom avatar's ambient loops (breathe, walk bob, speaking sway) and
 * its arrival ring as UI-thread shared values: no JS frame work, and React
 * renders only when a loop starts or stops. Which loops run is decided by
 * `resolveMiniRoomAvatarLoops` (Reduce Motion stops every decorative one).
 */
export function useMiniRoomAvatarLoops(loops: MiniRoomAvatarLoops) {
  const breathe = useSharedValue(0)
  const walkBob = useSharedValue(0)
  const speaking = useSharedValue(0)
  // 1 = the ring has finished (invisible); an arrival plays it from 0.
  const arrivalRing = useSharedValue(1)

  useEffect(() => {
    if (!loops.breathe) {
      breathe.value = 0
      return
    }
    startCycle(breathe, MINI_ROOM_AVATAR_LOOPS.breatheHalfMs, Easing.inOut(Easing.sin), -1)
    return () => { breathe.value = 0 }
  }, [breathe, loops.breathe])

  useEffect(() => {
    if (!loops.walkBob) {
      walkBob.value = 0
      return
    }
    startCycle(walkBob, MINI_ROOM_AVATAR_LOOPS.walkBobHalfMs, Easing.inOut(Easing.quad), -1)
    return () => { walkBob.value = 0 }
  }, [loops.walkBob, walkBob])

  useEffect(() => {
    if (!loops.speaking) {
      speaking.value = 0
      return
    }
    startCycle(speaking, MINI_ROOM_AVATAR_LOOPS.speakingHalfMs, Easing.inOut(Easing.quad),
      MINI_ROOM_AVATAR_LOOPS.speakingCycles)
    return () => { speaking.value = 0 }
  }, [loops.speaking, speaking])

  useEffect(() => {
    if (!loops.arrivalRing) {
      arrivalRing.value = 1
      return
    }
    const ringMs = MINI_ROOM_AVATAR_LOOPS.arrivalRingMs
    arrivalRing.value = 0
    arrivalRing.value = withSequence(
      withTiming(0.72, { duration: ringMs * 0.47, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }),
      withTiming(1, { duration: ringMs * 0.53, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never })
    )
    return () => { arrivalRing.value = 1 }
  }, [arrivalRing, loops.arrivalRing])

  return { breathe, walkBob, speaking, arrivalRing }
}
