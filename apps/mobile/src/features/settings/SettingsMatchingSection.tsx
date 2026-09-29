import type { DiscoveryFilters } from "@blumi/contracts"
import { Text, View } from "react-native"
import { uiTheme } from "../../ui/theme"
import { formatDiscoveryFiltersSummary } from "../discovery/discoveryFiltersModel"
import type { AppLocale } from "../session/appLocale"
import type { SettingsCopy } from "./settingsCopy"
import { SettingsRow } from "./SettingsRow"
import { settingsStyles as styles } from "./settingsStyles"

export function SettingsMatchingSection(props: {
  copy: SettingsCopy
  locale: AppLocale
  matchingFilters: DiscoveryFilters
  onOpenMatchingFilters: () => void
}) {
  const { copy, locale, matchingFilters, onOpenMatchingFilters } = props

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionOverline}>{copy.matching}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="heart"
          iconColors={uiTheme.gradients.primary}
          label={copy.discoveryPreferences}
          value={formatDiscoveryFiltersSummary(matchingFilters, locale)}
          chevron
          isLast
          onPress={onOpenMatchingFilters}
        />
      </View>
      <Text style={styles.privacyNote}>
        {copy.discoveryNote}
      </Text>
    </View>
  )
}
