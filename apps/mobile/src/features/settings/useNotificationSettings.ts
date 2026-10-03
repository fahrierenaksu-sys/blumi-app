import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
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
  const scope = useMemo(() => ({
    owner: sessionActor.profile.userId,
    mode: sessionActor.session.mode,
    token: sessionActor.session.sessionToken
  }), [sessionActor.profile.userId, sessionActor.session.mode, sessionActor.session.sessionToken])
  const currentScope = useRef<typeof scope | null>(scope)
  const loadController = useRef<AbortController | null>(null)
  const saveController = useRef<AbortController | null>(null)
  const revision = useRef(0)
  const saving = useRef(false)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null)
  const [notificationPreferencesStatus, setNotificationPreferencesStatus] = useState<SettingsLoadStatus>("idle")
  const [isSavingNotificationPreferences, setIsSavingNotificationPreferences] = useState(false)

  useLayoutEffect(() => {
    currentScope.current = scope
    setNotificationPreferences(null)
    setNotificationPreferencesStatus("idle")
    setIsSavingNotificationPreferences(false)
    saving.current = false
    return () => {
      currentScope.current = null
      revision.current += 1
      loadController.current?.abort()
      saveController.current?.abort()
    }
  }, [scope])

  const loadNotificationPreferences = useCallback(async () => {
    if (scope.mode !== "production" || currentScope.current !== scope || saving.current) return
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    const requestRevision = ++revision.current
    const isCurrent = () => currentScope.current === scope && revision.current === requestRevision && !controller.signal.aborted
    setNotificationPreferencesStatus("loading")
    try {
      const preferences = await getNotificationPreferences(
        MOBILE_HTTP_BASE_URL,
        scope.token,
        fetch,
        controller.signal
      )
      if (!isCurrent()) return
      setNotificationPreferences(preferences)
      setNotificationPreferencesStatus("ready")
    } catch {
      if (!isCurrent()) return
      setNotificationPreferencesStatus("error")
    }
  }, [scope])

  useEffect(() => {
    if (scope.mode !== "production") return
    return whenSettled(() => { void loadNotificationPreferences() })
  }, [loadNotificationPreferences, scope.mode, whenSettled])

  const handleNotificationToggle = useCallback((key: NotificationPreferenceToggleKey, enabled: boolean) => {
    if (!notificationPreferences || saving.current || scope.mode !== "production" || currentScope.current !== scope) return
    saving.current = true
    loadController.current?.abort()
    const controller = new AbortController()
    saveController.current = controller
    const requestRevision = ++revision.current
    const isCurrent = () => currentScope.current === scope && revision.current === requestRevision && !controller.signal.aborted
    const previous = notificationPreferences
    const optimistic = updateNotificationPreferenceToggle(previous, key, enabled)
    setNotificationPreferences(optimistic)
    setIsSavingNotificationPreferences(true)
    void updateNotificationPreferences(
      MOBILE_HTTP_BASE_URL,
      scope.token,
      { [key]: enabled },
      fetch,
      controller.signal
    ).then((saved) => {
      if (!isCurrent()) return
      setNotificationPreferences(saved)
      setNotificationPreferencesStatus("ready")
    }).catch(() => {
      if (!isCurrent()) return
      setNotificationPreferences(previous)
      setNotificationPreferencesStatus("ready")
      showToast({
        title: "Notification setting not saved",
        body: "Try again in a moment.",
        type: "warning"
      })
    }).finally(() => {
      if (!isCurrent()) return
      saving.current = false
      setIsSavingNotificationPreferences(false)
    })
  }, [notificationPreferences, scope])

  const handleRequestPushPermission = useCallback((): void => {
    if (currentScope.current !== scope) return
    if (pushPermissionStatus === "denied") {
      void Linking.openSettings().catch(() => {
        if (currentScope.current !== scope) return
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
        if (currentScope.current !== scope) return
        showToast({
          title: "Device notifications updated",
          body: "You stay in control of which moments Blumi can send.",
          type: "success"
        })
      })
      .catch(() => {
        if (currentScope.current !== scope) return
        showToast({
          title: "Notifications not enabled",
          body: "You can try again here or update Blumi in system settings.",
          type: "warning"
        })
      })
  }, [onRequestPushPermission, pushPermissionStatus, scope])

  return {
    notificationPreferences,
    notificationPreferencesStatus,
    isSavingNotificationPreferences,
    loadNotificationPreferences,
    handleNotificationToggle,
    handleRequestPushPermission
  }
}
