import { Pressable, Text, View } from "react-native"
import type { AvatarStudioTab, WardrobeCategoryId } from "../wardrobeCategoryModel"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

/**
 * Filter row above the grid: the tab's sub filters (Üstler / Elbiseler, Yüz /
 * Ağız / Baz) or its single title, and on the right the option count with
 * page dots that show more products sit to the side.
 */
export function WardrobeCatalogHeader(props: {
  tab: AvatarStudioTab
  activeCategory: WardrobeCategoryId
  copy: WardrobeStudioCopy
  optionCount: number
  pageCount: number
  activePage: number
  onSelectCategory: (categoryId: WardrobeCategoryId) => void
}) {
  const { tab, activeCategory, copy, optionCount, pageCount, activePage, onSelectCategory } = props
  return (
    <View style={styles.catalogHeader}>
      <View style={styles.filterRow}>
        {tab.categories.map((categoryId) => {
          const active = categoryId === activeCategory
          return (
            <Pressable
              key={categoryId}
              testID={`wardrobe-filter-${categoryId}`}
              accessibilityRole="button"
              accessibilityLabel={copy[categoryId]}
              accessibilityState={{ selected: active }}
              disabled={tab.categories.length === 1}
              onPress={() => onSelectCategory(categoryId)}
              hitSlop={6}
              style={styles.filterButton}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[styles.filterText, active ? styles.filterTextActive : null]}
              >
                {copy[categoryId]}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.countGroup}>
        {pageCount > 1 ? (
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={copy.pageOf(activePage + 1, pageCount)}
            style={styles.pageDots}
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <View
                key={index}
                style={[styles.pageDot, index === activePage ? styles.pageDotActive : null]}
              />
            ))}
          </View>
        ) : null}
        <Text
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.3}
          style={styles.countText}
        >
          {copy.optionCount(optionCount)}
        </Text>
      </View>
    </View>
  )
}
