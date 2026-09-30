import Ionicons from "@expo/vector-icons/Ionicons"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { memo } from "react"
import { Pressable, ScrollView, Text, View } from "react-native"
import type { AppLocale } from "../../session/appLocale"
import { uiTheme } from "../../../ui/theme"
import { getShopCopy } from "../shopCopy"
import { getCompactCategoryLabel, type ShopCategoryOption } from "./shopScreenModel"
import { shopScreenStyles as styles } from "./shopScreenStyles"

const AVATAR_CATEGORY_GLYPHS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  top: "tshirt-crew-outline",
  dress: "hanger",
  shoes: "shoe-sneaker",
  accessory: "sunglasses",
  hair: "hair-dryer-outline"
}

export const VerticalShopCategoryRail = memo(function VerticalShopCategoryRail(props: {
  categories: ShopCategoryOption[]
  activeCategoryId: string
  width: number
  height: number
  onSelectCategory: (categoryId: string) => void
  locale: AppLocale
  accessibilityLayout: boolean
}) {
  const copy = getShopCopy(props.locale)
  const rail = (
    <View style={[styles.verticalCategoryRail, props.accessibilityLayout && styles.horizontalCategoryRail, !props.accessibilityLayout && { width: props.width }]}>
      {props.categories.map((category) => {
        const active = category.id === props.activeCategoryId
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`${category.label}, ${copy.itemCount(category.count)}`}
            accessibilityState={{ selected: active }}
            onPress={() => props.onSelectCategory(category.id)}
            style={({ pressed }) => [
              styles.verticalCategoryChip,
              props.accessibilityLayout && styles.horizontalCategoryChip,
              active ? styles.verticalCategoryChipActive : null,
              pressed ? styles.verticalCategoryChipPressed : null
            ]}
          >
            <View style={styles.verticalCategoryHeading}>
              {category.id === "bottom" ? (
                <View style={styles.trousersIcon}>
                  <View style={[styles.trousersWaist, { borderColor: active ? uiTheme.colors.primary : "#8E8194" }]} />
                  <View style={[styles.trousersLeg, { left: 1, borderColor: active ? uiTheme.colors.primary : "#8E8194" }]} />
                  <View style={[styles.trousersLeg, { right: 1, borderColor: active ? uiTheme.colors.primary : "#8E8194" }]} />
                </View>
              ) : AVATAR_CATEGORY_GLYPHS[category.id] ? <MaterialCommunityIcons
                name={AVATAR_CATEGORY_GLYPHS[category.id]}
                size={17}
                color={active ? uiTheme.colors.primary : "rgba(45, 31, 58, 0.56)"}
              /> : <Ionicons
                name={category.icon}
                size={17}
                color={active ? uiTheme.colors.primary : "rgba(45, 31, 58, 0.56)"}
              />}
              <Text
                style={[
                  styles.verticalCategoryCount,
                  active ? styles.verticalCategoryCountActive : null
                ]}
              >
                {category.count}
              </Text>
            </View>
            <Text
              style={[
                styles.verticalCategoryLabel,
                active ? styles.verticalCategoryLabelActive : null
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {getCompactCategoryLabel(category, props.locale)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
  return props.accessibilityLayout ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalCategoryScroller}>
      {rail}
    </ScrollView>
  ) : (
    <ScrollView
      style={{ width: props.width, height: props.height, flexGrow: 0, flexShrink: 0 }}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {rail}
    </ScrollView>
  )
}, (previous, next) =>
  previous.activeCategoryId === next.activeCategoryId &&
  previous.width === next.width &&
  previous.height === next.height &&
  previous.locale === next.locale &&
  previous.accessibilityLayout === next.accessibilityLayout &&
  previous.categories === next.categories &&
  previous.onSelectCategory === next.onSelectCategory
)
