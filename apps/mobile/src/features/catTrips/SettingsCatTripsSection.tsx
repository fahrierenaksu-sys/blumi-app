import { useCallback, useEffect, useRef, useState } from "react"
import { Switch, Text, View } from "react-native"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { uiTheme } from "../../ui/theme"
import { showToast } from "../../ui/toast"
import type { SessionActor } from "../session/sessionModel"
import { SettingsRow } from "../settings/SettingsRow"
import { settingsStyles as styles } from "../settings/settingsStyles"
import { fetchCatPrefs, saveCatPrefs } from "./catTripApi"
import { CAT_TRIP_COPY } from "./catTripCopy"
import { IS_BLUMI_CAT_TRIPS_ENABLED } from "./catTripFlag"
import type { CatPrefs } from "./catTripModel"

const ROWS: ReadonlyArray<{ key: keyof CatPrefs; label: string; hint: string }> = [
  { key: "travelEnabled", label: CAT_TRIP_COPY.settingsTravel, hint: CAT_TRIP_COPY.settingsTravelHint },
  { key: "hostEnabled", label: CAT_TRIP_COPY.settingsHost, hint: CAT_TRIP_COPY.settingsHostHint },
  { key: "pushEnabled", label: CAT_TRIP_COPY.settingsPush, hint: CAT_TRIP_COPY.settingsPushHint }
]

/**
 * "Gezgin kedi" switches. Shown only when the app flag is on and the server
 * answers that the feature is on; otherwise the section is not there at all.
 */
export function SettingsCatTripsSection(props: { sessionActor: SessionActor; isEnabled?: boolean }) {
  const { sessionActor } = props
  const isEnabled = (props.isEnabled ?? IS_BLUMI_CAT_TRIPS_ENABLED) && sessionActor.session.mode === "production"
  const token = sessionActor.session.sessionToken
  const [prefs, setPrefs] = useState<CatPrefs | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    if (!isEnabled || !token) return () => { isMounted.current = false }
    fetchCatPrefs(MOBILE_HTTP_BASE_URL, token)
      .then((result) => { if (isMounted.current) setPrefs(result.enabled ? result.prefs : null) })
      .catch(() => { if (isMounted.current) setPrefs(null) })
    return () => { isMounted.current = false }
  }, [isEnabled, token])

  const toggle = useCallback(async (key: keyof CatPrefs, value: boolean) => {
    if (!prefs || !token) return
    const previous = prefs
    setPrefs({ ...prefs, [key]: value })
    setIsSaving(true)
    try {
      const saved = await saveCatPrefs(MOBILE_HTTP_BASE_URL, token, { [key]: value })
      if (!isMounted.current) return
      if (saved) {
        setPrefs(saved)
      } else {
        setPrefs(previous)
        showToast({ title: CAT_TRIP_COPY.settingsUnavailable, type: "warning" })
      }
    } catch {
      if (!isMounted.current) return
      setPrefs(previous)
      showToast({ title: CAT_TRIP_COPY.settingsSaveFailed, type: "warning" })
    } finally {
      if (isMounted.current) setIsSaving(false)
    }
  }, [prefs, token])

  if (!isEnabled || !prefs) return null
  return (
    <View style={styles.sectionWrap} testID="settings-cat-trips">
      <Text style={styles.sectionOverline}>{CAT_TRIP_COPY.settingsSection}</Text>
      <View style={styles.sectionCard}>
        {ROWS.map((row, index) => (
          <SettingsRow
            key={row.key}
            icon="paw"
            iconColors={uiTheme.gradients.warm}
            label={row.label}
            description={row.hint}
            isLast={index === ROWS.length - 1}
          >
            <Switch
              accessibilityRole="switch"
              accessibilityLabel={row.label}
              accessibilityHint={row.hint}
              accessibilityState={{ checked: prefs[row.key], disabled: isSaving }}
              disabled={isSaving}
              value={prefs[row.key]}
              onValueChange={(value) => void toggle(row.key, value)}
              trackColor={{ false: "#E6DCE4", true: "#FF9BC5" }}
              thumbColor="#FFFFFF"
            />
          </SettingsRow>
        ))}
      </View>
    </View>
  )
}
