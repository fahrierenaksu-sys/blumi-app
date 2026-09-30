import Ionicons from "@expo/vector-icons/Ionicons"
import type { MutableRefObject, RefObject } from "react"
import { Pressable, ScrollView, Text } from "react-native"
import { uiTheme } from "../../../ui/theme"
import type { WardrobeCategoryId } from "../wardrobeCategoryModel"
import { WARDROBE_CATEGORY_ICONS, type WardrobeStudioCopy } from "./wardrobeCopy"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

export function WardrobeCategoryTabs(props: {
  categories: readonly { id: WardrobeCategoryId }[]
  activeCategory: WardrobeCategoryId
  copy: WardrobeStudioCopy
  scrollRef: RefObject<ScrollView | null>
  offsetsRef: MutableRefObject<Record<string, number>>
  getCategoryLabel: (categoryId: WardrobeCategoryId) => string
  onSelectCategory: (categoryId: WardrobeCategoryId) => void
}) {
  const {
    categories,
    activeCategory,
    copy,
    scrollRef,
    offsetsRef,
    getCategoryLabel,
    onSelectCategory
  } = props
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      style={styles.categoryScroll}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryRow}
    >
      {categories.map((category) => {
        const active = category.id === activeCategory
        return (
          <Pressable
            key={category.id}
            testID={`wardrobe-category-${category.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${copy[category.id]} ${copy.categoryA11ySuffix}`}
            accessibilityState={{ selected: active }}
            onLayout={(event) => {
              offsetsRef.current[category.id] = event.nativeEvent.layout.x
            }}
            onPress={() => onSelectCategory(category.id)}
            style={[
              styles.categoryTab,
              active ? styles.categoryTabActive : null
            ]}
          >
            <Ionicons
              name={WARDROBE_CATEGORY_ICONS[category.id]}
              size={15}
              color={active ? uiTheme.colors.primaryDeep : uiTheme.colors.textSecondary}
            />
            <Text
              maxFontSizeMultiplier={1.4}
              style={[
                styles.categoryTabText,
                active ? styles.categoryTabTextActive : null
              ]}
            >
              {getCategoryLabel(category.id)}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
