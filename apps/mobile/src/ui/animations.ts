/**
 * Reusable entrance, pulse and selection animations on Reanimated: each runs
 * on the UI thread from a shared value, so a busy JS thread never delays or
 * stutters it. The returned styles go on a Reanimated `Animated.View`.
 *
 * Timing comes from the motion tokens (`./motion`); Reduce Motion replaces
 * movement with an opacity crossfade.
 */

import { useEffect, useLayoutEffect, useRef } from "react"
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated"
import { getPulseRestProgress } from "./ambientMotionModel"
import { animateTo, animateToAfter, useMotion, type ResolvedMotion } from "./motion"

// The Reduce Motion store lives in ./motion; these re-exports keep the
// existing import sites working.
export {
  primeReducedMotionPreference,
  useReducedMotion,
  useReducedMotionPreference
} from "./motion"

/* ── Fade + Slide Up ───────────────────────────────────────── */

interface EntranceOptions {
  /** Delay before the entrance starts (ms). */
  delay?: number
  /** A fixed duration (ms); the default is the `smooth` spring. */
  duration?: number
  /** How far the element rises from (px). */
  translateY?: number
}

/**
 * Fade-in + rise entrance. It starts before the first paint (layout effect),
 * so the element never flashes at rest first. Under Reduce Motion it only
 * crossfades in place, without delay.
 */
export function useEntranceAnimation(options: EntranceOptions = {}) {
  const { delay = 0, duration, translateY = 20 } = options
  const motion = useMotion()
  const { reduceMotion } = motion
  const progress = useSharedValue(0)

  useLayoutEffect(() => {
    const token: ResolvedMotion = reduceMotion
      ? motion.crossfade
      : duration === undefined
        ? motion.smooth
        : { kind: "timing", duration }
    progress.value = animateToAfter(reduceMotion ? 0 : delay, 1, token)
  }, [delay, duration, motion, progress, reduceMotion])

  return useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [{ translateY: reduceMotion ? 0 : (1 - progress.value) * translateY }]
  }))
}

/* ── Pulse ─────────────────────────────────────────────────── */

/**
 * A pulse for glowing rings and attention indicators. `iterations` bounds it
 * to that many beats, after which it settles at scale 1; the default -1
 * loops while mounted. Under Reduce Motion it rests at scale 1.
 */
export function usePulse(
  options: { minScale?: number; maxScale?: number; duration?: number; iterations?: number } = {}
) {
  const { minScale = 0.95, maxScale = 1.05, duration = 1500, iterations = -1 } = options
  const { reduceMotion } = useMotion()
  const restProgress = getPulseRestProgress(minScale, maxScale)
  const pulse = useSharedValue(restProgress)

  useEffect(() => {
    if (reduceMotion || iterations === 0) {
      pulse.value = restProgress
      return
    }
    const half = { duration: duration / 2, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.Never }
    const beat = withSequence(withTiming(1, half), withTiming(0, half))
    // A bounded pulse settles at full size, never shrunk (SYS-9).
    pulse.value = iterations < 0
      ? withRepeat(beat, -1)
      : withSequence(withRepeat(beat, iterations), withTiming(restProgress, half))
  }, [duration, iterations, pulse, reduceMotion, restProgress])

  return useAnimatedStyle(() => ({
    transform: [{ scale: minScale + (maxScale - minScale) * pulse.value }]
  }))
}

/* ── Selection change ──────────────────────────────────────── */

interface SelectionTransitionOptions {
  fromScale?: number
  translateY?: number
}

/** Opacity a changed selection starts from. */
const SELECTION_FROM_OPACITY = 0.72

/**
 * A short feedback transition when the user changes a selection: the new
 * content settles in with the `snappy` spring. Only opacity and transforms
 * move, so it cannot reflow the layout. Under Reduce Motion it only
 * crossfades.
 */
export function useSelectionTransition(
  selectionKey: string | number | undefined,
  options: SelectionTransitionOptions = {}
) {
  const { fromScale = 0.985, translateY = 6 } = options
  const motion = useMotion()
  const { reduceMotion } = motion
  const progress = useSharedValue(1)
  const previousKey = useRef(selectionKey)

  useLayoutEffect(() => {
    if (previousKey.current === selectionKey) return
    previousKey.current = selectionKey
    progress.value = withSequence(
      withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
      animateTo(1, reduceMotion ? motion.crossfade : motion.snappy)
    )
  }, [motion, progress, reduceMotion, selectionKey])

  return useAnimatedStyle(() => ({
    opacity: SELECTION_FROM_OPACITY + (1 - SELECTION_FROM_OPACITY) * Math.min(1, progress.value),
    transform: reduceMotion
      ? [{ translateY: 0 }, { scale: 1 }]
      : [
        { translateY: (1 - progress.value) * translateY },
        { scale: fromScale + (1 - fromScale) * progress.value }
      ]
  }))
}
