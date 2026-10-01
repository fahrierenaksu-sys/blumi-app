import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import {
  findAvatarStudioTab,
  type AvatarStudioTab,
  type WardrobeCategoryId
} from "../wardrobeCategoryModel"
import { WARDROBE_TAB_ICONS, type WardrobeStudioCopy } from "./wardrobeCopy"
import { getWardrobeTabIndicatorFrame } from "./wardrobeIndicatorModel"
import { WardrobeSlidingIndicator } from "./WardrobeSlidingIndicator"
import { wardrobeTheme, wardrobeV2Styles as styles } from "./wardrobeV2Styles"

/**
 * Four thin-line tabs; a white capsule slides under the active one (WRD-3).
 * Until the row is measured the active tab draws its own capsule.
 */
export function WardrobeCategoryTabs(props: {
  tabs: readonly AvatarStudioTab[]
  activeCategory: WardrobeCategoryId
  copy: WardrobeStudioCopy
  onSelectCategory: (categoryId: WardrobeCategoryId) => void
}) {
  const { tabs, activeCategory, copy, onSelectCategory } = props
  const [rowWidth, setRowWidth] = useState(0)
  const activeTab = findAvatarStudioTab(tabs, activeCategory)
  const frame = getWardrobeTabIndicatorFrame({
    rowWidth,
    count: tabs.length,
    index: tabs.findIndex((tab) => tab.id === activeTab?.id)
  })
  return (
    <View
      accessibilityRole="tablist"
      style={styles.tabRow}
      onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
    >
      {frame ? <WardrobeSlidingIndicator frame={frame} style={[styles.tabActive, styles.tabIndicator]} /> : null}
      {tabs.map((tab) => {
        const active = tab.id === activeTab?.id
        const label = copy[tab.id]
        return (
          <Pressable
            key={tab.id}
            testID={`wardrobe-category-${tab.id}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelectCategory(tab.categories[0])}
            style={[styles.tab, active && !frame ? styles.tabActive : null]}
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
