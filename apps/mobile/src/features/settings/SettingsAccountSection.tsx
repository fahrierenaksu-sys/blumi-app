import { Text, View } from "react-native"
import { uiTheme } from "../../ui/theme"
import type { SettingsCopy } from "./settingsCopy"
import { SettingsRow } from "./SettingsRow"
import { settingsStyles as styles } from "./settingsStyles"

/* ── Account ──────────────────────────────────── */

export function SettingsAccountSection(props: {
  copy: SettingsCopy
  onDataExport: () => void
  onPhoneChange: () => void
  onSignOut: () => void
  onDeleteAccount: () => void
}) {
  const { copy, onDataExport, onDeleteAccount, onPhoneChange, onSignOut } = props

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionOverline}>{copy.account}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="download-outline"
          iconColors={uiTheme.gradients.cool}
          label={copy.downloadData}
          chevron
          onPress={onDataExport}
        />
        <SettingsRow
          icon="call-outline"
          iconColors={uiTheme.gradients.warm}
          label={copy.changePhone}
          chevron
          onPress={onPhoneChange}
        />
        <SettingsRow
          icon="log-out"
          iconColors={["#7F8C8D", "#BDC3C7"]}
          label={copy.signOut}
          chevron
          onPress={onSignOut}
        />
        <SettingsRow
          icon="trash"
          iconColors={["#E74C3C", "#F1948A"]}
          label={copy.deleteAccount}
          chevron
          isLast
          onPress={onDeleteAccount}
        />
      </View>
    </View>
  )
}
