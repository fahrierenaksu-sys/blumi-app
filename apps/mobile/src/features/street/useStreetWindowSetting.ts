import { useCallback, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import type { SessionActor } from "../session/sessionModel"
import { saveStreetWindowClosed } from "./streetApi"
import { getStreetCopy } from "./streetCopy"

/**
 * "Penceremi sokakta göster" (Profil → Gizlilik). On by default (owner decision 2026-10-17); shown only while the
 * `chat_street` capability is on. Optimistic, rolled back on failure. The server keeps the truth; this screen starts
 * from the default until the street read tells it otherwise.
 */
export function useStreetWindowSetting(input: { sessionActor: SessionActor; capabilityEnabled: boolean; locale: "tr" | "en" }) {
  const { sessionActor, capabilityEnabled } = input
  const copy = getStreetCopy(input.locale)
  const visible = capabilityEnabled && sessionActor.session.mode === "production"
  const [shown, setShown] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const handleToggle = useCallback((nextShown: boolean) => {
    setShown(nextShown)
    setIsSaving(true)
    void saveStreetWindowClosed(MOBILE_HTTP_BASE_URL, sessionActor.session.sessionToken, !nextShown)
      .then((closed) => setShown(!closed))
      .catch(() => {
        setShown(!nextShown)
        showToast({ title: copy.settingLabel, body: copy.settingNote, type: "warning" })
      })
      .finally(() => setIsSaving(false))
  }, [copy.settingLabel, copy.settingNote, sessionActor.session.sessionToken])
  return { visible, shown, isSaving, handleToggle, label: copy.settingLabel, note: copy.settingNote }
}
