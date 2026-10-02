import { useEffect, useState } from "react"

/**
 * Background work for a pushed screen (refreshes, invitation and thread-list
 * fetches) that should not compete with the push animation or the first
 * frames. Nothing the screen draws waits for it: only work that would
 * re-render what is already on screen.
 */
export type WhenPushSettled = (task: () => void) => () => void

/** Upper bound when no transitionEnd arrives (no animation, a restored stack). */
export const PUSH_SETTLE_FALLBACK_MS = 600

export interface PushSettleGate {
  /** Runs `task` once the push has settled (at once if it has). Returns a cancel. */
  whenSettled: WhenPushSettled
  settle(): void
}

export function createPushSettleGate(): PushSettleGate {
  let settled = false
  const queue = new Set<() => void>()
  return {
    whenSettled(task) {
      if (settled) {
        task()
        return () => undefined
      }
      queue.add(task)
      return () => { queue.delete(task) }
    },
    settle() {
      if (settled) return
      settled = true
      const tasks = [...queue]
      queue.clear()
      for (const task of tasks) task()
    }
  }
}

interface TransitionEvents {
  addListener(
    type: "transitionEnd",
    listener: (event: { data?: { closing?: boolean } }) => void
  ): () => void
}

/**
 * A stable `whenSettled` for a native-stack screen: tasks run when its push
 * transition ends, or after PUSH_SETTLE_FALLBACK_MS at the latest.
 */
export function useAfterPushTransition(navigation: TransitionEvents): WhenPushSettled {
  const [gate] = useState(createPushSettleGate)
  useEffect(() => {
    const unsubscribe = navigation.addListener("transitionEnd", (event) => {
      if (!event?.data?.closing) gate.settle()
    })
    const fallback = setTimeout(() => gate.settle(), PUSH_SETTLE_FALLBACK_MS)
    return () => {
      unsubscribe()
      clearTimeout(fallback)
    }
  }, [gate, navigation])
  return gate.whenSettled
}
