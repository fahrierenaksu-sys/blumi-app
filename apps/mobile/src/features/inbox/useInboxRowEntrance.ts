import { useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { Easing, FadeInDown, ReduceMotion } from "react-native-reanimated"
import {
  INBOX_ENTRANCE_TRANSLATE_Y,
  planInboxEntrance,
  type InboxEntrancePlan
} from "./inboxEntranceModel"

export type InboxRowEntering = ReturnType<typeof FadeInDown.duration>

interface InboxRowEntranceState {
  knownKeys: Set<string>
  /** Keys whose entrance was handed to a mounted row; never replayed. */
  playedKeys: Set<string>
  hasPlayedStagger: boolean
}

function createEntering(delayMs: number, durationMs: number): InboxRowEntering {
  return FadeInDown
    .duration(durationMs)
    .delay(delayMs)
    .easing(Easing.out(Easing.cubic))
    .withInitialValues({ opacity: 0, transform: [{ translateY: INBOX_ENTRANCE_TRANSLATE_Y }] })
    .reduceMotion(ReduceMotion.Never)
}

/**
 * Entrance motion for inbox rows, keyed by thread id rather than by index so
 * a new thread at the top never restarts the rows beneath it. The stagger
 * plays once; later rows get one short entrance (rules in inboxEntranceModel).
 *
 * Each entrance is a Reanimated `entering` layout animation (UI thread,
 * opacity and translateY only) handed to the row when it mounts. A row that
 * remounts later (list virtualisation) gets none, so nothing on screen ever
 * replays.
 */
export function useInboxRowEntrance(
  rowKeys: readonly string[],
  reduceMotion: boolean
): (key: string) => InboxRowEntering | undefined {
  const stateRef = useRef<InboxRowEntranceState | null>(null)
  if (stateRef.current === null) {
    stateRef.current = { knownKeys: new Set(), playedKeys: new Set(), hasPlayedStagger: false }
  }
  const state = stateRef.current

  // Planned during render from the committed state only, so a new row has
  // its entrance on the frame it first mounts.
  const plan: InboxEntrancePlan = useMemo(
    () => planInboxEntrance({
      hasPlayedStagger: state.hasPlayedStagger,
      knownKeys: state.knownKeys,
      nextKeys: rowKeys,
      reduceMotion
    }),
    [reduceMotion, rowKeys, state]
  )
  const enteringByKey = useMemo(() => {
    const map = new Map<string, InboxRowEntering>()
    for (const entrance of plan.entrances) {
      if (entrance.kind === "none") continue
      map.set(entrance.key, createEntering(entrance.delayMs, entrance.durationMs))
    }
    return map
  }, [plan])

  useLayoutEffect(() => {
    // Commit the plan: every planned row is now known and its entrance spent.
    state.hasPlayedStagger = plan.hasPlayedStagger
    for (const key of plan.removedKeys) {
      state.knownKeys.delete(key)
      state.playedKeys.delete(key)
    }
    for (const entrance of plan.entrances) {
      state.knownKeys.add(entrance.key)
      state.playedKeys.add(entrance.key)
    }
  }, [plan, state])

  return useCallback(
    (key: string) => (reduceMotion || state.playedKeys.has(key) ? undefined : enteringByKey.get(key)),
    [enteringByKey, reduceMotion, state]
  )
}
