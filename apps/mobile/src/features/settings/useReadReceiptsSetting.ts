import { useCallback, useEffect, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import type { WhenPushSettled } from "../../navigation/useAfterPushTransition"
import type { SessionActor } from "../session/sessionModel"
import { fetchChatPreferences, saveChatPreferences } from "./chatPreferencesApi"
import type { SettingsCopy } from "./settingsCopy"

const runNow: WhenPushSettled = (task) => {
  task()
  return () => undefined
}

/**
 * The "Read receipts / Okundu bilgisi" switch (2026-10-01). Shown only when
 * the `chat_read_receipts` capability is on for this session and the server
 * reports the setting available. Off by default and mutual; the server
 * enforces both. Toggles are optimistic and roll back on failure.
 */
export function useReadReceiptsSetting(input: {
  sessionActor: SessionActor
  capabilityEnabled: boolean
  copy: SettingsCopy
  /**
   * Runs the first server refresh once the screen's push has settled, so
   * it never re-renders the page mid-slide. Defaults to at once.
   */
  whenSettled?: WhenPushSettled
}) {
  const { sessionActor, capabilityEnabled, copy, whenSettled = runNow } = input
  const eligible = capabilityEnabled && sessionActor.session.mode === "production"
  const [available, setAvailable] = useState(false)
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!eligible) return
    let active = true
    const cancel = whenSettled(() => {
      void fetchChatPreferences(MOBILE_HTTP_BASE_URL, sessionActor.session.sessionToken)
        .then((state) => {
          if (!active) return
          setAvailable(state.available)
          setReadReceiptsEnabled(state.preferences.readReceiptsEnabled)
        })
        // An unavailable setting stays hidden; nothing for the person to fix.
        .catch(() => undefined)
    })
    return () => {
      active = false
      cancel()
    }
  }, [eligible, sessionActor.session.sessionToken, whenSettled])

  const handleToggle = useCallback((enabled: boolean) => {
    if (!eligible || isSaving) return
    const previous = readReceiptsEnabled
    setReadReceiptsEnabled(enabled)
    setIsSaving(true)
    void saveChatPreferences(MOBILE_HTTP_BASE_URL, sessionActor.session.sessionToken, { readReceiptsEnabled: enabled })
      .then((saved) => setReadReceiptsEnabled(saved.readReceiptsEnabled))
      .catch(() => {
        setReadReceiptsEnabled(previous)
        showToast({ title: copy.readReceiptsNotSaved, body: copy.tryAgain, type: "warning" })
      })
      .finally(() => setIsSaving(false))
  }, [copy, eligible, isSaving, readReceiptsEnabled, sessionActor.session.sessionToken])

  return {
    visible: eligible && available,
    readReceiptsEnabled,
    isSaving,
    handleToggle
  }
}
