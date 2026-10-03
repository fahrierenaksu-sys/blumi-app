import { useCallback, useEffect, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import type { WhenPushSettled } from "../../navigation/useAfterPushTransition"
import type { SessionActor } from "../session/sessionModel"
import { fetchChatPreferences, saveChatPreferences } from "./chatPreferencesApi"
import type { SettingsCopy } from "./settingsCopy"
import { cacheReadReceipts, readCachedReadReceipts } from "./settingsServerCache"

const runNow: WhenPushSettled = (task) => {
  task()
  return () => undefined
}

type ReadReceiptsLoad = "pending" | "ready" | "failed"

interface ReadReceiptsState {
  owner: string
  load: ReadReceiptsLoad
  available: boolean
  enabled: boolean
}

function stateFromCache(owner: string): ReadReceiptsState {
  const cached = readCachedReadReceipts(owner)
  return cached
    ? { owner, load: "ready", available: cached.available, enabled: cached.enabled }
    : { owner, load: "pending", available: false, enabled: false }
}

/**
 * The "Read receipts / Okundu bilgisi" switch (2026-10-01). Shown only when
 * the `chat_read_receipts` capability is on for this session and the server
 * reports the setting available. Off by default and mutual; the server
 * enforces both. Toggles are optimistic and roll back on failure.
 *
 * The last server answer is kept per account (`settingsServerCache`) and
 * painted at once; the server revalidates in the background. With no answer
 * yet the row is reserved (`isPlaceholder`: shown, switch disabled) so the
 * answer never inserts a row and pushes the page down.
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
  const owner = sessionActor.profile.userId
  const sessionToken = sessionActor.session.sessionToken
  const [stored, setStored] = useState<ReadReceiptsState>(() => stateFromCache(owner))
  // Another account's state is never shown, even for one render.
  const state = stored.owner === owner ? stored : stateFromCache(owner)
  const [isSaving, setIsSaving] = useState(false)

  const patch = useCallback((change: Partial<ReadReceiptsState>) => {
    setStored((current) => ({ ...(current.owner === owner ? current : stateFromCache(owner)), ...change }))
  }, [owner])

  useEffect(() => {
    if (!eligible) return
    let active = true
    const cancel = whenSettled(() => {
      void fetchChatPreferences(MOBILE_HTTP_BASE_URL, sessionToken)
        .then((answer) => {
          if (!active) return
          const snapshot = { available: answer.available, enabled: answer.preferences.readReceiptsEnabled }
          cacheReadReceipts(owner, snapshot)
          patch({ load: "ready", ...snapshot })
        })
        // Without any answer the row stays hidden; with a remembered one it
        // stays as it was. Nothing for the person to fix.
        .catch(() => {
          if (active && readCachedReadReceipts(owner) === null) patch({ load: "failed" })
        })
    })
    return () => {
      active = false
      cancel()
    }
  }, [eligible, owner, patch, sessionToken, whenSettled])

  const handleToggle = useCallback((enabled: boolean) => {
    if (!eligible || isSaving || state.load !== "ready") return
    const previous = state.enabled
    patch({ enabled })
    setIsSaving(true)
    void saveChatPreferences(MOBILE_HTTP_BASE_URL, sessionToken, { readReceiptsEnabled: enabled })
      .then((saved) => {
        cacheReadReceipts(owner, { available: true, enabled: saved.readReceiptsEnabled })
        patch({ enabled: saved.readReceiptsEnabled })
      })
      .catch(() => {
        patch({ enabled: previous })
        showToast({ title: copy.readReceiptsNotSaved, body: copy.tryAgain, type: "warning" })
      })
      .finally(() => setIsSaving(false))
  }, [copy, eligible, isSaving, owner, patch, sessionToken, state.enabled, state.load])

  const isPlaceholder = eligible && state.load === "pending"
  return {
    visible: eligible && (isPlaceholder || (state.load === "ready" && state.available)),
    /** True until the server has answered once: the row is there, its switch is not usable yet. */
    isPlaceholder,
    readReceiptsEnabled: state.enabled,
    isSaving,
    handleToggle
  }
}
