import { Text, View } from "react-native"
import { uiTheme } from "../../ui/theme"
import type { SettingsCopy } from "./settingsCopy"
import { SettingsRow } from "./SettingsRow"
import { settingsStyles as styles } from "./settingsStyles"

export function SettingsAboutSection(props: { copy: SettingsCopy; versionLabel: string }) {
  const { copy, versionLabel } = props

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionOverline}>{copy.about}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="phone-portrait"
          iconColors={uiTheme.gradients.primary}
          label={copy.version}
          value={versionLabel}
        />
        <SettingsRow
          icon="sparkles"
          iconColors={uiTheme.gradients.warm}
          label={copy.philosophy}
          value={copy.philosophyValue}
          isLast
        />
      </View>
    </View>
  )
}

/* ── Legal ─────────────────────────────────────── */

export function SettingsLegalSection(props: {
  copy: SettingsCopy
  onOpenPrivacy: () => void
  onOpenTerms: () => void
  onOpenGuidelines: () => void
}) {
  const { copy, onOpenGuidelines, onOpenPrivacy, onOpenTerms } = props

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionOverline}>{copy.legal}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="lock-closed"
          iconColors={["#9B59B6", "#C39BD3"]}
          label={copy.privacyPolicy}
          chevron
          onPress={onOpenPrivacy}
        />
        <SettingsRow
          icon="document-text"
          iconColors={["#3498DB", "#85C1E9"]}
          label={copy.terms}
          chevron
          onPress={onOpenTerms}
        />
        <SettingsRow
          icon="chatbubble-ellipses"
          iconColors={["#3AC08A", "#82E0AA"]}
          label={copy.communityGuidelines}
          chevron
          isLast
          onPress={onOpenGuidelines}
        />
      </View>
    </View>
  )
}
