import { Switch, Text, View } from "react-native"
import type { useAnalyticsConsent } from "../../analytics/analyticsConsent"
import { uiTheme } from "../../ui/theme"
import { showToast } from "../../ui/toast"
import type { SettingsCopy } from "./settingsCopy"
import { SettingsRow } from "./SettingsRow"
import { settingsStyles as styles } from "./settingsStyles"
import type { useReadReceiptsSetting } from "./useReadReceiptsSetting"
import type { useStreetWindowSetting } from "../street/useStreetWindowSetting"

// The track colours every Settings switch uses.
const SWITCH_TRACK_COLOR = { false: "#E6DCE4", true: "#FF9BC5" }

/** Read receipts (when rolled out) and the product analytics consent toggle. */
export function SettingsPrivacySection(props: {
  copy: SettingsCopy
  analyticsConsent: ReturnType<typeof useAnalyticsConsent>
  readReceipts?: ReturnType<typeof useReadReceiptsSetting>
  streetWindow?: ReturnType<typeof useStreetWindowSetting>
}) {
  const { analyticsConsent, copy, readReceipts, streetWindow } = props

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
            value={readReceipts.isPlaceholder ? undefined : readReceipts.readReceiptsEnabled ? copy.on : copy.off}
          >
            <Switch
              accessibilityRole="switch"
              accessibilityLabel={copy.readReceipts}
              accessibilityHint={copy.readReceiptsNote}
              accessibilityState={{
                checked: readReceipts.readReceiptsEnabled,
                disabled: readReceipts.isSaving || readReceipts.isPlaceholder,
                busy: readReceipts.isPlaceholder
              }}
              disabled={readReceipts.isSaving || readReceipts.isPlaceholder}
              value={readReceipts.readReceiptsEnabled}
              onValueChange={readReceipts.handleToggle}
              trackColor={SWITCH_TRACK_COLOR}
              thumbColor="#FFFFFF"
            />
          </SettingsRow>
        ) : null}
        {streetWindow?.visible ? (
          <SettingsRow
            icon="home"
            iconColors={uiTheme.gradients.primary}
            label={streetWindow.label}
            description={streetWindow.note}
            value={streetWindow.shown ? copy.on : copy.off}
          >
            <Switch
              accessibilityRole="switch"
              accessibilityLabel={streetWindow.label}
              accessibilityHint={streetWindow.note}
              accessibilityState={{ checked: streetWindow.shown, disabled: streetWindow.isSaving }}
              disabled={streetWindow.isSaving}
              value={streetWindow.shown}
              onValueChange={streetWindow.handleToggle}
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
