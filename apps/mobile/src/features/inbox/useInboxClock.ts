import { useEffect, useState } from "react"
import { AppState } from "react-native"
import { getInboxClockRefreshDelayMs } from "./inboxRowModel"

interface FocusNavigation {
  isFocused: () => boolean
  addListener: (type: "focus" | "blur", listener: () => void) => () => void
}

/**
 * The time the inbox row labels are computed against. It refreshes when the
 * page is focused or the app returns to the foreground, and once per minute
 * boundary while the inbox is on screen ("Now" → "1m" → …). Nothing runs while
 * the page is hidden or the app is in the background.
 */
export function useInboxClock(navigation: FocusNavigation): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    }
    const schedule = (): void => {
      stop()
      if (!navigation.isFocused() || AppState.currentState !== "active") return
      timer = setTimeout(tick, getInboxClockRefreshDelayMs(Date.now()))
    }
    function tick(): void {
      setNow(Date.now())
      schedule()
    }
    const unsubscribeFocus = navigation.addListener("focus", tick)
    const unsubscribeBlur = navigation.addListener("blur", stop)
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") tick()
      else stop()
    })
    schedule()
    return () => {
      stop()
      unsubscribeFocus()
      unsubscribeBlur()
      appState.remove()
    }
  }, [navigation])

  return now
}
