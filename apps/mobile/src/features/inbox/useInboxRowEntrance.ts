import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { Animated, Easing } from "react-native"
import { INBOX_ENTRANCE_TRANSLATE_Y, planInboxEntrance } from "./inboxEntranceModel"

interface InboxRowEntranceStyle {
  opacity: Animated.Value
  transform: [{ translateY: Animated.AnimatedInterpolation<number> }]
}

interface InboxRowEntranceState {
  progressByKey: Map<string, Animated.Value>
  styleByKey: Map<string, InboxRowEntranceStyle>
  knownKeys: Set<string>
  running: Set<Animated.CompositeAnimation>
  hasPlayedStagger: boolean
}

function createState(): InboxRowEntranceState {
  return {
    progressByKey: new Map(),
    styleByKey: new Map(),
    knownKeys: new Set(),
    running: new Set(),
    hasPlayedStagger: false
  }
}

function progressFor(state: InboxRowEntranceState, key: string): Animated.Value {
  const existing = state.progressByKey.get(key)
  if (existing) return existing
  // A row starts hidden; the layout effect below settles or animates it
  // before the first paint of the commit that introduced it.
  const created = new Animated.Value(0)
  state.progressByKey.set(key, created)
  return created
}

/**
 * Entrance motion for inbox rows, keyed by thread id rather than by index so
 * a new thread at the top never restarts the rows beneath it. The stagger
 * plays once; later rows get one short entrance (rules in inboxEntranceModel).
 * Runs on the native driver: opacity and translateY only.
 */
export function useInboxRowEntrance(
  rowKeys: readonly string[],
  reduceMotion: boolean
): (key: string) => InboxRowEntranceStyle {
  const stateRef = useRef<InboxRowEntranceState | null>(null)
  if (stateRef.current === null) stateRef.current = createState()

  useLayoutEffect(() => {
    const state = stateRef.current
    if (!state) return
    const plan = planInboxEntrance({
      hasPlayedStagger: state.hasPlayedStagger,
      knownKeys: state.knownKeys,
      nextKeys: rowKeys,
      reduceMotion
    })
    state.hasPlayedStagger = plan.hasPlayedStagger
    for (const key of plan.removedKeys) {
      state.progressByKey.get(key)?.stopAnimation()
      state.progressByKey.delete(key)
      state.styleByKey.delete(key)
      state.knownKeys.delete(key)
    }
    for (const entrance of plan.entrances) {
      state.knownKeys.add(entrance.key)
      const progress = progressFor(state, entrance.key)
      if (entrance.kind === "none") {
        progress.stopAnimation()
        progress.setValue(1)
        continue
      }
      progress.setValue(0)
      const animation = Animated.timing(progress, {
        toValue: 1,
        duration: entrance.durationMs,
        delay: entrance.delayMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
      state.running.add(animation)
      animation.start(() => {
        state.running.delete(animation)
      })
    }
    if (reduceMotion) {
      // Turning Reduce Motion on mid-entrance ends every row at rest.
      for (const animation of state.running) animation.stop()
      state.running.clear()
      for (const progress of state.progressByKey.values()) progress.setValue(1)
    }
  }, [reduceMotion, rowKeys])

  useEffect(() => {
    const state = stateRef.current
    return () => {
      if (!state) return
      for (const animation of state.running) animation.stop()
      state.running.clear()
      // A remount of the same instance plans its rows again from scratch.
      state.knownKeys.clear()
      state.hasPlayedStagger = false
    }
  }, [])

  return useCallback((key: string): InboxRowEntranceStyle => {
    const state = stateRef.current ?? createState()
    const cached = state.styleByKey.get(key)
    if (cached) return cached
    const progress = progressFor(state, key)
    const style: InboxRowEntranceStyle = {
      opacity: progress,
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [INBOX_ENTRANCE_TRANSLATE_Y, 0]
          })
        }
      ]
    }
    state.styleByKey.set(key, style)
    return style
  }, [])
}
