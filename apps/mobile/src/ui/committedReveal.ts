import { useCallback, useState } from "react"
import type { ViewStyle } from "react-native"
import { scheduleOnRN } from "react-native-worklets"

/** The revealed end state that React commits once a reveal has finished. */
export const COMMITTED_REVEAL_STYLE: ViewStyle = { opacity: 1 }

export interface CommittedReveal {
  /** Put it after the animated style: null until the reveal has finished, then opacity 1. */
  readonly style: ViewStyle | null
  /** Completion callback for the reveal animation (a worklet: pass it to withTiming, animateTo, …). */
  readonly onRevealEnd: (finished?: boolean) => void
  /** The reveal finished synchronously on JS (Reduce Motion, an instant set). */
  readonly markRevealed: () => void
  /** The view will be hidden again (or its next mount starts hidden): drop the committed end state. */
  readonly reset: () => void
}

/**
 * A view that mounts hidden and is revealed by a UI-thread animation can stay
 * invisible on iOS: with Reanimated's IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS (apps/
 * mobile/package.json), animated opacity is written straight to the native
 * view, and a write sent before that view is mounted (a stalled main thread at
 * startup, after a deep link or a sign-in) is dropped and never retried, so the
 * view keeps the hidden style it mounted with.
 *
 * Once the reveal animation has finished, this commits the revealed end state
 * through React as well, which reaches the native view by the normal mounting
 * path. A lost UI-thread write then costs at most the fade, never the view.
 * Only opacity is committed, so static transforms in the view's own style stay.
 */
export function useCommittedReveal(): CommittedReveal {
  const [revealed, setRevealed] = useState(false)
  const markRevealed = useCallback(() => setRevealed(true), [])
  const reset = useCallback(() => setRevealed(false), [])
  const onRevealEnd = useCallback((finished?: boolean) => {
    "worklet"
    if (finished === false) return
    scheduleOnRN(markRevealed)
  }, [markRevealed])
  return { style: revealed ? COMMITTED_REVEAL_STYLE : null, onRevealEnd, markRevealed, reset }
}
