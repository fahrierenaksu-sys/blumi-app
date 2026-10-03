import { useEffect } from "react"
import { AppState } from "react-native"

interface InboxFocusNavigation {
  isFocused(): boolean
  addListener(type: "focus" | "blur", listener: () => void): () => void
}

/** Optional network/cache work waits until the page's first frames have settled. */
const FIRST_WARMUP_DELAY_MS = 350

function scheduleIdle(work: () => void, delayMs: number): () => void {
  let cancelled = false
  let idleId: number | undefined
  const timer = setTimeout(() => {
    if (cancelled) return
    const run = () => { if (!cancelled) work() }
    if (typeof globalThis.requestIdleCallback === "function") idleId = globalThis.requestIdleCallback(run)
    else run()
  }, delayMs)
  return () => {
    cancelled = true
    clearTimeout(timer)
    if (idleId !== undefined) globalThis.cancelIdleCallback?.(idleId)
  }
}

/**
 * Warms eligible history in small idle batches while the Inbox is visible.
 * Blur, background, account/input changes and unmount cancel queued work;
 * already-started responses remain safe in the session-guarded coordinator.
 * A row's press-in still requests its own history immediately.
 */
export function useInboxThreadWarmup({
  navigation,
  enabled,
  threadIds,
  warmThread
}: {
  navigation: InboxFocusNavigation
  enabled: boolean
  /** Stable signature of eligible visible conversations, selected by the screen. */
  threadIds: string
  warmThread: (threadId: string) => Promise<void>
}): void {
  useEffect(() => {
    if (!enabled || !threadIds) return
    let disposed = false
    let generation = 0
    let cancelIdle: (() => void) | undefined
    const stop = () => {
      generation += 1
      cancelIdle?.()
      cancelIdle = undefined
    }
    const active = (expected: number) => !disposed && expected === generation &&
      navigation.isFocused() && AppState.currentState === "active"
    const ids = threadIds.split("|")
    const scheduleBatch = (offset: number, expected: number, delayMs: number) => {
      if (offset >= ids.length || !active(expected)) return
      cancelIdle = scheduleIdle(() => {
        cancelIdle = undefined
        if (!active(expected)) return
        const pending = ids.slice(offset, offset + 2).map((id) => warmThread(id).catch(() => undefined))
        void Promise.all(pending).then(() => scheduleBatch(offset + 2, expected, 16))
      }, delayMs)
    }
    const start = () => {
      stop()
      scheduleBatch(0, generation, FIRST_WARMUP_DELAY_MS)
    }
    const unsubscribeFocus = navigation.addListener("focus", start)
    const unsubscribeBlur = navigation.addListener("blur", stop)
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") start()
      else stop()
    })
    start()
    return () => {
      disposed = true
      stop()
      unsubscribeFocus()
      unsubscribeBlur()
      appState.remove()
    }
  }, [enabled, navigation, threadIds, warmThread])
}
