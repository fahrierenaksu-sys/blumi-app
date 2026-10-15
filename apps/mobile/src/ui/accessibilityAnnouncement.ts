import { useEffect, useRef } from "react"
import { AccessibilityInfo, Platform } from "react-native"
import { useIsSurfaceFocused } from "../features/avatar/components/useIsSurfaceFocused"

/**
 * Speaks a status, error or loading message once when it appears on the
 * screen the person is looking at.
 *
 * Android reads the visible text through `accessibilityLiveRegion`, so an
 * explicit announcement there would be heard twice. iOS has no live regions,
 * so it gets one announcement per distinct message; re-renders that keep the
 * same message stay silent, and a cleared message can be announced again.
 *
 * The main-tab pager warm-mounts pages the person has not opened, so a page
 * that is mounted but not shown stays silent; its message is spoken once when
 * the page becomes the shown one.
 */
export function useAccessibilityAnnouncement(message: string | null | undefined): void {
  const isFocused = useIsSurfaceFocused()
  const lastAnnounced = useRef<string | null>(null)
  useEffect(() => {
    if (!message) {
      lastAnnounced.current = null
      return
    }
    if (!isFocused || Platform.OS !== "ios" || lastAnnounced.current === message) return
    lastAnnounced.current = message
    AccessibilityInfo.announceForAccessibility(message)
  }, [isFocused, message])
}
