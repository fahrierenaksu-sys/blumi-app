/**
 * Reusable animation hooks for screen/component entrance animations.
 * Uses React Native's Animated API with useNativeDriver for 60fps.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AccessibilityInfo, Animated, Easing } from "react-native"

/** Keeps product motion aligned with the OS accessibility preference. */
export function useReducedMotionPreference(): {
  reduceMotion: boolean
  isResolved: boolean
} {
  // Fail closed until the asynchronous OS preference is known so a fresh
  // mount never flashes motion for someone who has requested less of it.
  const [preference, setPreference] = useState({
    reduceMotion: true,
    isResolved: false
  })

  useEffect(() => {
    let active = true
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setPreference({ reduceMotion: enabled, isResolved: true })
    }).catch(() => {
      if (active) setPreference({ reduceMotion: true, isResolved: true })
    })
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setPreference({ reduceMotion: enabled, isResolved: true })
    )

    return () => {
      active = false
      subscription.remove()
    }
  }, [])

  return preference
}

export function useReducedMotion(): boolean {
  return useReducedMotionPreference().reduceMotion
}

/* ── Fade + Slide Up ───────────────────────────────────────── */

interface EntranceOptions {
  /** Delay before animation starts (ms) */
  delay?: number
  /** Duration of the animation (ms) */
  duration?: number
  /** How far the element slides up from (px) */
  translateY?: number
}

/**
 * Fade-in + slide-up entrance animation.
 * Returns { opacity, transform } to spread onto an Animated.View.
 */
export function useEntranceAnimation(options: EntranceOptions = {}) {
  const { delay = 0, duration = 500, translateY = 24 } = options
  const progress = useRef(new Animated.Value(0)).current
  const reduceMotion = useReducedMotion()

  useLayoutEffect(() => {
    if (reduceMotion) {
      progress.stopAnimation()
      progress.setValue(1)
      return
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    })
    anim.start()
    return () => anim.stop()
  }, [delay, duration, progress, reduceMotion])

  return {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [translateY, 0]
        })
      }
    ]
  }
}

/* ── Staggered List Entrance ───────────────────────────────── */

/**
 * Creates staggered entrance animations for a list of items.
 * Each item fades in + slides up with a stagger delay.
 */
export function useStaggeredEntrance(
  itemCount: number,
  options: { staggerMs?: number; duration?: number; translateY?: number } = {}
) {
  const { staggerMs = 60, duration = 400, translateY = 20 } = options
  const reduceMotion = useReducedMotion()
  const anims = useMemo(
    () => Array.from({ length: itemCount }, () => new Animated.Value(0)),
    [itemCount]
  )

  useEffect(() => {
    if (itemCount === 0) return
    if (reduceMotion) {
      for (const anim of anims) anim.setValue(1)
      return
    }
    const animations = anims.slice(0, itemCount).map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration,
        delay: i * staggerMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    )
    const sequence = Animated.parallel(animations)
    sequence.start()
    return () => sequence.stop()
  }, [anims, duration, itemCount, reduceMotion, staggerMs])

  return (index: number) => {
    const anim = anims[index] ?? new Animated.Value(1)
    return {
      opacity: anim,
      transform: [
        {
          translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [translateY, 0]
          })
        }
      ]
    }
  }
}

/* ── Scale Bounce ──────────────────────────────────────────── */

/**
 * Scale bounce entrance — great for match celebrations, unlocks.
 * Scales from 0 → overshoot → 1.
 */
export function useScaleBounce(options: { delay?: number; tension?: number; friction?: number } = {}) {
  const { delay = 0, tension = 80, friction = 8 } = options
  const scale = useRef(new Animated.Value(0)).current
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) {
      scale.stopAnimation()
      scale.setValue(1)
      return
    }
    const timeout = setTimeout(() => {
      Animated.spring(scale, {
        toValue: 1,
        tension,
        friction,
        useNativeDriver: true
      }).start()
    }, delay)
    return () => clearTimeout(timeout)
  }, [delay, friction, reduceMotion, scale, tension])

  return { transform: [{ scale }] }
}

/* ── Pulse Glow ────────────────────────────────────────────── */

/**
 * Continuous pulse animation — for glowing rings, attention indicators.
 */
export function usePulse(options: { minScale?: number; maxScale?: number; duration?: number } = {}) {
  const { minScale = 0.95, maxScale = 1.05, duration = 1500 } = options
  const pulse = useRef(new Animated.Value(0)).current
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) {
      pulse.stopAnimation()
      pulse.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [duration, pulse, reduceMotion])

  return {
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [minScale, maxScale]
        })
      }
    ]
  }
}

/* ── Fade In ───────────────────────────────────────────────── */

/**
 * Simple fade-in without translation. Good for overlays.
 */
export function useFadeIn(options: { delay?: number; duration?: number } = {}) {
  const { delay = 0, duration = 350 } = options
  const opacity = useRef(new Animated.Value(0)).current
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) {
      opacity.stopAnimation()
      opacity.setValue(1)
      return
    }
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true
    })
    anim.start()
    return () => anim.stop()
  }, [delay, duration, opacity, reduceMotion])

  return { opacity }
}

interface SelectionTransitionOptions {
  fromScale?: number
  translateY?: number
}

/**
 * A short feedback transition for user-triggered selection changes.
 * It animates only opacity and transforms, so it cannot reflow the layout.
 */
export function useSelectionTransition(
  selectionKey: string | number | undefined,
  options: SelectionTransitionOptions = {}
) {
  const { fromScale = 0.985, translateY = 6 } = options
  const reduceMotion = useReducedMotion()
  const progress = useRef(new Animated.Value(1)).current
  const previousKey = useRef(selectionKey)

  useLayoutEffect(() => {
    if (reduceMotion) {
      previousKey.current = selectionKey
      progress.stopAnimation()
      progress.setValue(1)
      return
    }

    if (previousKey.current === selectionKey) return
    previousKey.current = selectionKey
    progress.stopAnimation()

    progress.setValue(0)
    const animation = Animated.spring(progress, {
      toValue: 1,
      damping: 22,
      stiffness: 260,
      mass: 0.75,
      useNativeDriver: true
    })
    animation.start()
    return () => animation.stop()
  }, [progress, reduceMotion, selectionKey])

  return {
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.72, 1]
    }),
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [translateY, 0]
        })
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [fromScale, 1]
        })
      }
    ]
  }
}
