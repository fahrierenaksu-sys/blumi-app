import { useEffect, useRef } from "react"
import { AccessibilityInfo, Platform } from "react-native"

/**
 * Speaks a status, error or loading message once when it appears.
 *
 * Android reads the visible text through `accessibilityLiveRegion`, so an
 * explicit announcement there would be heard twice. iOS has no live regions,
 * so it gets one announcement per distinct message; re-renders that keep the
 * same message stay silent, and a cleared message can be announced again.
 */
export function useAccessibilityAnnouncement(message: string | null | undefined): void {
  const lastAnnounced = useRef<string | null>(null)
  useEffect(() => {
    if (!message) {
      lastAnnounced.current = null
      return
    }
    if (Platform.OS !== "ios" || lastAnnounced.current === message) return
    lastAnnounced.current = message
    AccessibilityInfo.announceForAccessibility(message)
  }, [message])
}
