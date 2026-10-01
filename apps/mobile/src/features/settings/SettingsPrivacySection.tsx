import { Switch, Text, View } from "react-native"
import type { useAnalyticsConsent } from "../../analytics/analyticsConsent"
import { uiTheme } from "../../ui/theme"
import { showToast } from "../../ui/toast"
import type { SettingsCopy } from "./settingsCopy"
import { SettingsRow } from "./SettingsRow"
import { settingsStyles as styles } from "./settingsStyles"
import type { useReadReceiptsSetting } from "./useReadReceiptsSetting"

// The track colours every Settings switch uses.
const SWITCH_TRACK_COLOR = { false: "#E6DCE4", true: "#FF9BC5" }

/** Read receipts (when rolled out) and the product analytics consent toggle. */
export function SettingsPrivacySection(props: {
  copy: SettingsCopy
  analyticsConsent: ReturnType<typeof useAnalyticsConsent>
  readReceipts?: ReturnType<typeof useReadReceiptsSetting>
}) {
  const { analyticsConsent, copy, readReceipts } = props

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionOverline}>{copy.privacy}</Text>
      <View style={styles.sectionCard}>
        {readReceipts?.visible ? (
          <SettingsRow
            icon="checkmark-done"
            iconColors={uiTheme.gradients.primary}
            label={copy.readReceipts}
            description={copy.readReceiptsNote}
            value={readReceipts.readReceiptsEnabled ? copy.on : copy.off}
          >
            <Switch
              accessibilityRole="switch"
              accessibilityLabel={copy.readReceipts}
              accessibilityHint={copy.readReceiptsNote}
              accessibilityState={{
                checked: readReceipts.readReceiptsEnabled,
                disabled: readReceipts.isSaving
              }}
              disabled={readReceipts.isSaving}
              value={readReceipts.readReceiptsEnabled}
              onValueChange={readReceipts.handleToggle}
              trackColor={SWITCH_TRACK_COLOR}
              thumbColor="#FFFFFF"
            />
          </SettingsRow>
        ) : null}
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
            trackColor={SWITCH_TRACK_COLOR}
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
