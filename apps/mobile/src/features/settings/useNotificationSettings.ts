import { useCallback, useEffect, useState } from "react"
import { Linking } from "react-native"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences
} from "../notifications/notificationApi"
import {
  type NotificationPreferenceToggleKey,
  updateNotificationPreferenceToggle
} from "../notifications/notificationPreferencesModel"
import type { WhenPushSettled } from "../../navigation/useAfterPushTransition"
import type { SessionActor } from "../session/sessionModel"
import type { SettingsLoadStatus } from "./settingsPresentationModel"

const runNow: WhenPushSettled = (task) => {
  task()
  return () => undefined
}

export type PushPermissionStatus = "unknown" | "undetermined" | "granted" | "denied"

/**
 * Server notification preferences (production only) with optimistic toggles,
 * plus the device push-permission action shown above them.
 */
export function useNotificationSettings(input: {
  sessionActor: SessionActor
  pushPermissionStatus: PushPermissionStatus
  onRequestPushPermission: () => Promise<void>
  /**
   * Runs the first server refresh once the screen's push has settled, so
   * it never re-renders the page mid-slide. Defaults to at once.
   */
  whenSettled?: WhenPushSettled
}) {
  const { sessionActor, pushPermissionStatus, onRequestPushPermission, whenSettled = runNow } = input
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null)
  const [notificationPreferencesStatus, setNotificationPreferencesStatus] = useState<SettingsLoadStatus>("idle")
  const [isSavingNotificationPreferences, setIsSavingNotificationPreferences] = useState(false)

  const loadNotificationPreferences = useCallback(async () => {
    if (sessionActor.session.mode !== "production") return
    setNotificationPreferencesStatus("loading")
    try {
      const preferences = await getNotificationPreferences(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken
      )
      setNotificationPreferences(preferences)
      setNotificationPreferencesStatus("ready")
    } catch {
      setNotificationPreferencesStatus("error")
    }
  }, [sessionActor])

  useEffect(() => {
    if (sessionActor.session.mode !== "production") return
    return whenSettled(() => { void loadNotificationPreferences() })
  }, [loadNotificationPreferences, sessionActor.session.mode, whenSettled])

  const handleNotificationToggle = useCallback((key: NotificationPreferenceToggleKey, enabled: boolean) => {
    if (!notificationPreferences || isSavingNotificationPreferences || sessionActor.session.mode !== "production") return
    const previous = notificationPreferences
    const optimistic = updateNotificationPreferenceToggle(previous, key, enabled)
    setNotificationPreferences(optimistic)
    setIsSavingNotificationPreferences(true)
    void updateNotificationPreferences(
      MOBILE_HTTP_BASE_URL,
      sessionActor.session.sessionToken,
      { [key]: enabled }
    ).then((saved) => {
      setNotificationPreferences(saved)
    }).catch(() => {
      setNotificationPreferences(previous)
      showToast({
        title: "Notification setting not saved",
        body: "Try again in a moment.",
        type: "warning"
      })
    }).finally(() => {
      setIsSavingNotificationPreferences(false)
    })
  }, [isSavingNotificationPreferences, notificationPreferences, sessionActor])

  const handleRequestPushPermission = useCallback((): void => {
    if (pushPermissionStatus === "denied") {
      void Linking.openSettings().catch(() => {
        showToast({
          title: "System settings did not open",
          body: "Open your device settings and allow notifications for Blumi.",
          type: "warning"
        })
      })
      return
    }
    void onRequestPushPermission()
      .then(() => {
        showToast({
          title: "Device notifications updated",
          body: "You stay in control of which moments Blumi can send.",
          type: "success"
        })
      })
      .catch(() => {
        showToast({
          title: "Notifications not enabled",
          body: "You can try again here or update Blumi in system settings.",
          type: "warning"
        })
      })
  }, [onRequestPushPermission, pushPermissionStatus])

  return {
    notificationPreferences,
    notificationPreferencesStatus,
    isSavingNotificationPreferences,
    loadNotificationPreferences,
    handleNotificationToggle,
    handleRequestPushPermission
  }
}
