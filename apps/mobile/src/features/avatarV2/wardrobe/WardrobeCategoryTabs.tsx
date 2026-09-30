import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import {
  findAvatarStudioTab,
  type AvatarStudioTab,
  type WardrobeCategoryId
} from "../wardrobeCategoryModel"
import { WARDROBE_TAB_ICONS, type WardrobeStudioCopy } from "./wardrobeCopy"
import { wardrobeTheme, wardrobeV2Styles as styles } from "./wardrobeV2Styles"

/** Four thin-line tabs; the active one is rose with a fine underline. */
export function WardrobeCategoryTabs(props: {
  tabs: readonly AvatarStudioTab[]
  activeCategory: WardrobeCategoryId
  copy: WardrobeStudioCopy
  onSelectCategory: (categoryId: WardrobeCategoryId) => void
}) {
  const { tabs, activeCategory, copy, onSelectCategory } = props
  const activeTab = findAvatarStudioTab(tabs, activeCategory)
  return (
    <View style={styles.tabRow}>
      {tabs.map((tab) => {
        const active = tab.id === activeTab?.id
        const label = copy[tab.id]
        return (
          <Pressable
            key={tab.id}
            testID={`wardrobe-category-${tab.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${copy.categoryA11ySuffix}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelectCategory(tab.categories[0])}
            style={[styles.tab, active ? styles.tabActive : null]}
          >
            <Ionicons
              name={WARDROBE_TAB_ICONS[tab.id]}
              size={21}
              color={active ? wardrobeTheme.accent : wardrobeTheme.muted}
            />
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.tabLabel, active ? styles.tabLabelActive : null]}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
