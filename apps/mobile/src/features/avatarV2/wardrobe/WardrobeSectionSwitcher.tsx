import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import { uiTheme } from "../../../ui/theme"
import { AVATAR_STUDIO_SECTIONS, type AvatarStudioSectionId } from "../wardrobeCategoryModel"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

export function WardrobeSectionSwitcher(props: {
  activeSection: AvatarStudioSectionId
  copy: WardrobeStudioCopy
  onSelectSection: (section: AvatarStudioSectionId) => void
}) {
  const { activeSection, copy, onSelectSection } = props
  return (
    <View style={styles.sectionSwitcher}>
      {AVATAR_STUDIO_SECTIONS.map((section) => {
        const active = section.id === activeSection
        return (
          <Pressable
            key={section.id}
            testID={`avatar-studio-section-${section.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${copy[section.id]} ${copy.sectionA11ySuffix}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelectSection(section.id)}
            style={[
              styles.sectionButton,
              active ? styles.sectionButtonActive : null
            ]}
          >
            <Ionicons
              name={section.id === "appearance" ? "happy" : "shirt"}
              size={16}
              color={active ? "#FFFFFF" : uiTheme.colors.textSecondary}
            />
            <Text style={[
              styles.sectionButtonText,
              active ? styles.sectionButtonTextActive : null
            ]}>
              {copy[section.id]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
