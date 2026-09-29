import { Switch, Text, View } from "react-native"
import type { useAnalyticsConsent } from "../../analytics/analyticsConsent"
import { uiTheme } from "../../ui/theme"
import { showToast } from "../../ui/toast"
import type { SettingsCopy } from "./settingsCopy"
import { SettingsRow } from "./SettingsRow"
import { settingsStyles as styles } from "./settingsStyles"

/** Product analytics consent toggle. */
export function SettingsPrivacySection(props: {
  copy: SettingsCopy
  analyticsConsent: ReturnType<typeof useAnalyticsConsent>
}) {
  const { analyticsConsent, copy } = props

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionOverline}>{copy.privacy}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="analytics"
          iconColors={uiTheme.gradients.cool}
          label={copy.analytics}
          value={analyticsConsent.consent === "granted" ? copy.on : copy.off}
          isLast
        >
          <Switch
            accessibilityRole="switch"
            accessibilityLabel={copy.analytics}
            accessibilityState={{
              checked: analyticsConsent.consent === "granted",
              disabled: !analyticsConsent.hydrated
            }}
            disabled={!analyticsConsent.hydrated}
            value={analyticsConsent.consent === "granted"}
            onValueChange={(enabled) => {
              void analyticsConsent.setEnabled(enabled).catch(() => {
                showToast({
                  title: copy.privacyNotSaved,
                  body: copy.tryAgain,
                  type: "warning"
                })
              })
            }}
            trackColor={{ false: "#E6DCE4", true: "#FF9BC5" }}
            thumbColor="#FFFFFF"
          />
        </SettingsRow>
      </View>
      <Text style={styles.privacyNote}>
        {copy.analyticsNote}
      </Text>
    </View>
  )
}
