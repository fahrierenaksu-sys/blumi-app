import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, ScrollView, Text, TextInput, View } from "react-native"
import { hapticLight } from "../../../ui/haptics"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomV2EditorSession } from "../roomV2EditorSession"
import type { RoomEditorInventoryCategoryId } from "./roomEditorPresentationModel"
import { styles } from "./roomEditorStyles"

const ROOM_EDITOR_CATEGORIES: readonly {
  id: RoomEditorInventoryCategoryId
  icon: keyof typeof Ionicons.glyphMap
}[] = [
  { id: "all", icon: "apps-outline" },
  { id: "seating", icon: "cafe-outline" },
  { id: "table", icon: "grid-outline" },
  { id: "rug", icon: "color-filter-outline" },
  { id: "misc", icon: "tv-outline" },
  { id: "lighting", icon: "bulb-outline" },
  { id: "wallDecor", icon: "images-outline" },
  { id: "plant", icon: "leaf-outline" }
]

/** Collection header with reset, the tray search field, and the category rail. */
export function RoomEditorInventoryControls(props: {
  copy: MyRoomEditorCopy
  editorSession: RoomV2EditorSession
  inventoryStatusLabel: string
  inventoryStatusFailed: boolean
  handleResetDraft: () => void
  inventorySearchQuery: string
  setInventorySearchQuery: (query: string) => void
  activeInventoryCategory: RoomEditorInventoryCategoryId
  setActiveInventoryCategory: (category: RoomEditorInventoryCategoryId) => void
}) {
  const {
    copy,
    editorSession,
    inventoryStatusLabel,
    inventoryStatusFailed,
    handleResetDraft,
    inventorySearchQuery,
    setInventorySearchQuery,
    activeInventoryCategory,
    setActiveInventoryCategory
  } = props
  return (
    <>
      <View style={styles.inventoryHeader}>
        <View>
          <Text style={styles.inventoryTitle}>{copy.collectionTitle}</Text>
          <Text style={[
            styles.inventoryEyebrow,
            inventoryStatusFailed ? styles.inventoryStatusFailed : null
          ]}>
            {inventoryStatusLabel}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.resetLayout}
          accessibilityState={{
            disabled: !editorSession.canResetToPersistedBaseline
          }}
          disabled={!editorSession.canResetToPersistedBaseline}
          onPress={handleResetDraft}
          hitSlop={8}
        >
          <Text style={[
            styles.inventorySubtitle,
            !editorSession.canResetToPersistedBaseline
              ? styles.inventorySubtitleDisabled
              : null
          ]}>{copy.resetLayout}</Text>
        </Pressable>
      </View>
      <View style={styles.inventorySearchField}>
        <Ionicons name="search-outline" size={17} color="#967A8C" />
        <TextInput
          accessibilityLabel={copy.searchLabel}
          accessibilityHint={copy.searchHint}
          value={inventorySearchQuery}
          onChangeText={setInventorySearchQuery}
          placeholder={copy.searchPlaceholder}
          placeholderTextColor="#A991A2"
          returnKeyType="done"
          style={styles.inventorySearchInput}
        />
        {inventorySearchQuery ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.clearSearch}
            onPress={() => setInventorySearchQuery("")}
            hitSlop={8}
            style={styles.inventorySearchClear}
          >
            <Ionicons name="close-circle" size={18} color="#8B6F82" />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRail}
      >
        {ROOM_EDITOR_CATEGORIES.map((category) => {
          const selected = activeInventoryCategory === category.id
          const categoryLabel = copy.categoryLabels[category.id]
          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={copy.showCategory(categoryLabel)}
              accessibilityState={{ selected }}
              onPress={() => {
                hapticLight()
                setActiveInventoryCategory(category.id)
              }}
              style={[
                styles.categoryChip,
                selected ? styles.categoryChipSelected : null
              ]}
            >
              <Ionicons
                name={category.icon}
                size={14}
                color={selected ? "#FFFFFF" : "#806579"}
              />
              <Text style={[
                styles.categoryChipText,
                selected ? styles.categoryChipTextSelected : null
              ]}>{categoryLabel}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </>
  )
}
