/**
 * Blumi's one motion language (docs/quality/MOTION_PLAN_2026-10-02.md §B).
 *
 * Every animation picks a token here instead of a literal, and reads it
 * through `useMotion()` (or `resolveMotion`) so Reduce Motion is applied in
 * one place:
 * - springs (`press`, `snappy`, `smooth`, `bouncy`) drive movement:
 *   transform only. Under Reduce Motion movement does not travel; it lands
 *   at once and the caller fades opacity with `crossfade` instead.
 * - `fadeIn`, `fadeOut` and `crossfade` drive opacity and stay under Reduce
 *   Motion (fading is not movement).
 * - `stagger` delays the first appearance of up to six list items.
 *
 * Springs are Reanimated `{ duration, dampingRatio }` configs mapped from the
 * SwiftUI presets (dampingRatio ≈ 1 − bounce); `duration` is Reanimated's
 * perceptual duration, so they stay time-based on 120 Hz screens. Every
 * config switches Reanimated's own Reduce Motion check off: the shared,
 * fail-closed store below is the only switch.
 *
 * This module also owns the app's single Reduce Motion OS subscription.
 */
import { useMemo, useSyncExternalStore } from "react"
import { AccessibilityInfo } from "react-native"
import {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  withDelay,
  withSpring,
  withTiming
} from "react-native-reanimated"
import {
  createReducedMotionStore,
  type ReducedMotionPreference
} from "./reducedMotionStore"
import {
  MOTION_DURATIONS,
  MOTION_SPRINGS,
  staggerDelayMs,
  type MotionSpringToken
} from "./motionTokens"

export {
  MOTION_DURATIONS,
  MOTION_PRESS_SCALE,
  MOTION_REDUCED_PRESS_OPACITY,
  MOTION_SPRINGS,
  MOTION_STAGGER,
  staggerDelayMs,
  type MotionFadeName,
  type MotionSpringName,
  type MotionSpringToken
} from "./motionTokens"

/* ── Resolution for Reduce Motion ──────────────────────────── */

/**
 * A token resolved for the current Reduce Motion preference: a spring, or a
 * timing (a fade, or a movement that lands at once under Reduce Motion).
 * Plain data, so worklets can capture it.
 */
export type ResolvedMotion =
  | { readonly kind: "spring"; readonly duration: number; readonly dampingRatio: number }
  | { readonly kind: "timing"; readonly duration: number }

export interface Motion {
  readonly reduceMotion: boolean
  readonly press: ResolvedMotion
  readonly snappy: ResolvedMotion
  readonly smooth: ResolvedMotion
  readonly bouncy: ResolvedMotion
  readonly fadeIn: ResolvedMotion
  readonly fadeOut: ResolvedMotion
  readonly crossfade: ResolvedMotion
  /** First-appearance delay of list item `index`: 0 under Reduce Motion. */
  readonly staggerDelay: (index: number) => number
}

const INSTANT: ResolvedMotion = Object.freeze({ kind: "timing", duration: 0 })

function spring(token: MotionSpringToken): ResolvedMotion {
  return Object.freeze({ kind: "spring", duration: token.duration, dampingRatio: token.dampingRatio })
}

function fade(duration: number): ResolvedMotion {
  return Object.freeze({ kind: "timing", duration })
}

const noStagger = () => 0

const FULL_MOTION: Motion = Object.freeze({
  reduceMotion: false,
  press: spring(MOTION_SPRINGS.press),
  snappy: spring(MOTION_SPRINGS.snappy),
  smooth: spring(MOTION_SPRINGS.smooth),
  bouncy: spring(MOTION_SPRINGS.bouncy),
  fadeIn: fade(MOTION_DURATIONS.fadeIn),
  fadeOut: fade(MOTION_DURATIONS.fadeOut),
  crossfade: fade(MOTION_DURATIONS.crossfade),
  staggerDelay: staggerDelayMs
})

const REDUCED_MOTION: Motion = Object.freeze({
  reduceMotion: true,
  press: INSTANT,
  snappy: INSTANT,
  smooth: INSTANT,
  bouncy: INSTANT,
  // Movement becomes a crossfade: opacity keeps (or gains) a gentle fade.
  fadeIn: fade(MOTION_DURATIONS.crossfade),
  fadeOut: fade(MOTION_DURATIONS.crossfade),
  crossfade: fade(MOTION_DURATIONS.crossfade),
  staggerDelay: noStagger
})

/** The motion tokens for a Reduce Motion preference. Stable objects. */
export function resolveMotion(reduceMotion: boolean): Motion {
  return reduceMotion ? REDUCED_MOTION : FULL_MOTION
}

/* ── Drivers (worklet-safe) ────────────────────────────────── */

/**
 * Animates a shared value to `target` with a resolved token. Safe on the UI
 * thread (gesture callbacks) and on JS. A spring started after a gesture
 * pass the release `velocity`, so it inherits the finger's speed.
 */
export function animateTo(
  target: number,
  motion: ResolvedMotion,
  callback?: (finished?: boolean) => void,
  velocity?: number
): number {
  "worklet"
  if (motion.kind === "spring") {
    return withSpring(
      target,
      {
        duration: motion.duration,
        dampingRatio: motion.dampingRatio,
        velocity: velocity ?? 0,
        reduceMotion: ReduceMotion.Never
      },
      callback
    )
  }
  return withTiming(
    target,
    { duration: motion.duration, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never },
    callback
  )
}

/** `animateTo` after `delayMs` (0 → no delay wrapper). */
export function animateToAfter(
  delayMs: number,
  target: number,
  motion: ResolvedMotion,
  callback?: (finished?: boolean) => void
): number {
  "worklet"
  const animation = animateTo(target, motion, callback)
  return delayMs > 0 ? withDelay(delayMs, animation, ReduceMotion.Never) : animation
}

/* ── Layout animations ─────────────────────────────────────── */

/** Opacity-only entering/exiting for a crossfade (skeleton → content). */
export const CROSSFADE_ENTERING = FadeIn
  .duration(MOTION_DURATIONS.crossfade)
  .reduceMotion(ReduceMotion.Never)
export const CROSSFADE_EXITING = FadeOut
  .duration(MOTION_DURATIONS.crossfade)
  .reduceMotion(ReduceMotion.Never)

/* ── Reduce Motion: one shared OS subscription ─────────────── */

/** Keeps product motion aligned with the OS accessibility preference. */
const reducedMotionStore = createReducedMotionStore({
  isReduceMotionEnabled: () => AccessibilityInfo.isReduceMotionEnabled(),
  addEventListener: (event, listener) =>
    AccessibilityInfo.addEventListener(event, listener)
})

let reducedMotionPrimed = false

/** Called once at the app root so later mounts read a resolved preference. */
export function primeReducedMotionPreference(): void {
  if (reducedMotionPrimed) return
  reducedMotionPrimed = true
  reducedMotionStore.subscribe(() => undefined)
}

export function useReducedMotionPreference(): ReducedMotionPreference {
  // One shared OS subscription; resolved values are available synchronously
  // to later mounts, and the unresolved default remains fail closed.
  return useSyncExternalStore(
    reducedMotionStore.subscribe,
    reducedMotionStore.getSnapshot,
    reducedMotionStore.getSnapshot
  )
}

export function useReducedMotion(): boolean {
  return useReducedMotionPreference().reduceMotion
}

/** The motion tokens resolved for the viewer's Reduce Motion preference. */
export function useMotion(): Motion {
  const reduceMotion = useReducedMotion()
  return useMemo(() => resolveMotion(reduceMotion), [reduceMotion])
}
