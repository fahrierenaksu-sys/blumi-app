import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, ScrollView, Text, View } from "react-native"
import { hapticLight } from "../../../ui/haptics"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { FurnitureCategory } from "../roomV2.types"
import type { RoomEditorInventoryCategoryId } from "./roomEditorPresentationModel"
import { roomEditorTheme, styles } from "./roomEditorStyles"

/** Catalog order of the room categories; every category has a tab. */
export const ROOM_EDITOR_CATEGORY_ORDER: readonly FurnitureCategory[] = [
  "seating",
  "table",
  "rug",
  "misc",
  "lighting",
  "wallDecor",
  "plant"
]

export const ROOM_EDITOR_ALL_CATEGORY_IDS: readonly RoomEditorInventoryCategoryId[] = [
  "all",
  ...ROOM_EDITOR_CATEGORY_ORDER
]

const ROOM_EDITOR_CATEGORY_ICONS: Record<
  RoomEditorInventoryCategoryId,
  keyof typeof Ionicons.glyphMap
> = {
  all: "grid-outline",
  seating: "bed-outline",
  table: "cafe-outline",
  rug: "layers-outline",
  misc: "cube-outline",
  lighting: "bulb-outline",
  wallDecor: "image-outline",
  plant: "leaf-outline"
}

/** Thin-line icon tabs sized like the wardrobe's; the row scrolls sideways. */
export function RoomEditorCategoryTabs(props: {
  copy: MyRoomEditorCopy
  categoryIds: readonly RoomEditorInventoryCategoryId[]
  activeInventoryCategory: RoomEditorInventoryCategoryId
  setActiveInventoryCategory: (category: RoomEditorInventoryCategoryId) => void
}) {
  const { copy, categoryIds, activeInventoryCategory, setActiveInventoryCategory } = props
  return (
    <View style={styles.categoryRailFrame}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRail}
      >
        {categoryIds.map((categoryId) => {
          const selected = activeInventoryCategory === categoryId
          const categoryLabel = copy.categoryLabels[categoryId]
          return (
            <Pressable
              key={categoryId}
              accessibilityRole="button"
              accessibilityLabel={copy.showCategory(categoryLabel)}
              accessibilityState={{ selected }}
              onPress={() => {
                hapticLight()
                setActiveInventoryCategory(categoryId)
              }}
              style={[styles.categoryTab, selected ? styles.categoryTabSelected : null]}
            >
              <Ionicons
                name={ROOM_EDITOR_CATEGORY_ICONS[categoryId]}
                size={21}
                color={selected ? roomEditorTheme.accent : roomEditorTheme.muted}
              />
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={[
                  styles.categoryTabText,
                  selected ? styles.categoryTabTextSelected : null
                ]}
              >
                {categoryLabel}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
