import { useEffect, useRef } from "react"
import { AppState, Platform } from "react-native"
import { captureAppException } from "../../observability/crashReporting"
import { getThreadListStatus, useThreadListVersion, useTotalUnreadCount } from "../chat/chatStore"
import { createAppIconBadgeSync, resolveAppIconBadgeCount, type AppIconBadgeSync } from "./appIconBadgeModel"
import { shouldInitializeNativeNotifications } from "./notificationRuntimePolicy"
import { startSignedOutTapDiscard } from "./signedOutNotificationTaps"

const SHOULD_INITIALIZE_NOTIFICATIONS = shouldInitializeNativeNotifications(Platform.OS, __DEV__)

/** Keeps the app icon badge equal to the unread total while a session runs. */
export function useAppIconBadge(enabled: boolean): void {
  const totalUnread = useTotalUnreadCount()
  const listVersion = useThreadListVersion()
  const active = enabled && SHOULD_INITIALIZE_NOTIFICATIONS
  const syncRef = useRef<AppIconBadgeSync | null>(null)

  useEffect(() => {
    if (!active) return
    const sync = createAppIconBadgeSync(
      async (count) => (await import("expo-notifications")).setBadgeCountAsync(count),
      (error) => captureAppException(error, { feature: "push_badge_sync" })
    )
    syncRef.current = sync
    const subscription = AppState.addEventListener("change", (state) => sync.appStateChanged(state))
    return () => {
      sync.dispose()
      if (syncRef.current === sync) syncRef.current = null
      subscription.remove()
    }
  }, [active])

  useEffect(() => {
    syncRef.current?.update(resolveAppIconBadgeCount({ enabled: active, listStatus: getThreadListStatus(), totalUnread }))
  }, [active, listVersion, totalUnread])
}

/** While signed out, a tapped push is dropped instead of opening at the next sign-in. */
export function useSignedOutNotificationTapDiscard(signedOut: boolean): void {
  const active = signedOut && SHOULD_INITIALIZE_NOTIFICATIONS
  useEffect(() => {
    if (!active) return
    let stop: (() => void) | null = null
    let cancelled = false
    void import("expo-notifications").then((notifications) => {
      if (cancelled) return
      stop = startSignedOutTapDiscard(notifications, (error) => {
        captureAppException(error, { feature: "push_signed_out_tap" })
      })
    }).catch((error: unknown) => {
      if (!cancelled) captureAppException(error, { feature: "push_signed_out_tap" })
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [active])
}
