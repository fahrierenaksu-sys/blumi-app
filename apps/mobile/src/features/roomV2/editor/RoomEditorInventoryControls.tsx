import { Pressable, Text, View } from "react-native"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomV2EditorSession } from "../roomV2EditorSession"
import { RoomEditorCategoryTabs } from "./RoomEditorCategoryTabs"
import type { RoomEditorInventoryCategoryId } from "./roomEditorPresentationModel"
import { wardrobeV2Styles as wardrobeStyles } from "../../avatarV2/wardrobe/wardrobeV2Styles"
import { styles } from "./roomEditorStyles"

/**
 * Dock header, in the wardrobe panel's order: the category tabs, after the
 * compact/all capsule, then the collection title with its piece count and a
 * small Reset layout control. A failed ownership check is the only status text.
 */
export function RoomEditorInventoryControls(props: {
  copy: MyRoomEditorCopy
  editorSession: RoomV2EditorSession
  isExpanded: boolean
  onToggleExpanded: () => void
  categoryIds: readonly RoomEditorInventoryCategoryId[]
  inventoryEntryCount: number
  inventoryStatusLabel: string
  inventoryStatusFailed: boolean
  inventoryStatusLoading: boolean
  handleResetDraft: () => void
  activeInventoryCategory: RoomEditorInventoryCategoryId
  setActiveInventoryCategory: (category: RoomEditorInventoryCategoryId) => void
}) {
  const {
    copy,
    editorSession,
    isExpanded,
    onToggleExpanded,
    categoryIds,
    inventoryEntryCount,
    inventoryStatusLabel,
    inventoryStatusFailed,
    inventoryStatusLoading,
    handleResetDraft,
    activeInventoryCategory,
    setActiveInventoryCategory
  } = props
  return (
    <>
      {/* The wardrobe's capsule: compact collection on the left, everything on the right. */}
      <View style={wardrobeStyles.sectionSwitcher}>
        {[false, true].map((expanded) => {
          const active = expanded === isExpanded
          const label = expanded ? copy.showAllPieces : copy.collectionTitle
          return (
            <Pressable
              key={expanded ? "all" : "compact"}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: active, expanded: isExpanded }}
              onPress={active ? undefined : onToggleExpanded}
              style={[
                wardrobeStyles.sectionButton,
                active ? wardrobeStyles.sectionButtonActive : null
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[
                  wardrobeStyles.sectionButtonText,
                  active ? wardrobeStyles.sectionButtonTextActive : null
                ]}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <RoomEditorCategoryTabs
        copy={copy}
        categoryIds={categoryIds}
        activeInventoryCategory={activeInventoryCategory}
        setActiveInventoryCategory={setActiveInventoryCategory}
      />
      <View style={styles.inventoryHeader}>
        <View style={styles.inventoryTitleRow}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={styles.inventoryTitle}
          >
            {copy.collectionTitle}
          </Text>
          {!inventoryStatusLoading && !inventoryStatusFailed ? (
            <Text
              accessibilityLabel={inventoryStatusLabel}
              maxFontSizeMultiplier={1.3}
              style={styles.inventoryCount}
            >
              {inventoryEntryCount}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.resetLayout}
          accessibilityState={{
            disabled: !editorSession.canResetToPersistedBaseline
          }}
          disabled={!editorSession.canResetToPersistedBaseline}
          onPress={handleResetDraft}
          hitSlop={12}
          style={({ pressed }) => [
            pressed ? styles.controlPressed : null,
            !editorSession.canResetToPersistedBaseline ? styles.controlDisabled : null
          ]}
        >
          <Text maxFontSizeMultiplier={1.3} style={styles.dockToggleText}>
            {copy.resetLayoutShort}
          </Text>
        </Pressable>
      </View>
      {inventoryStatusFailed ? (
        <Text style={[styles.inventoryStatus, styles.inventoryStatusFailed]}>
          {inventoryStatusLabel}
        </Text>
      ) : null}
    </>
  )
}
