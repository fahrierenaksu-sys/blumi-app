import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { PlacementPreview } from "./roomEditorPlacementModel"
import { styles } from "./roomEditorStyles"

/**
 * Explicit actions for the current preview and selection: confirm a valid
 * placement, rotate through supplied asset views, or remove the piece.
 */
export function RoomEditorSelectedItemActions(props: {
  copy: MyRoomEditorCopy
  placementPreview: PlacementPreview | undefined
  selectedInstanceId: string | undefined
  canRotateSelectedPlacedItem: boolean
  commitTrayPlacementPreview: (preview: PlacementPreview | undefined) => boolean
  handleRotate: () => void
  handleRemoveItem: () => void
}) {
  const {
    copy,
    placementPreview,
    selectedInstanceId,
    canRotateSelectedPlacedItem,
    commitTrayPlacementPreview,
    handleRotate,
    handleRemoveItem
  } = props
  return (
    <View style={styles.selectedItemActions}>
      {placementPreview?.isValid ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.confirmPlacement}
          onPress={() => commitTrayPlacementPreview(placementPreview)}
          style={[styles.selectedItemAction, styles.selectedItemActionPrimary]}
        >
          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
          <Text style={styles.selectedItemActionPrimaryText}>{copy.confirmPlacement}</Text>
        </Pressable>
      ) : null}
      {selectedInstanceId && canRotateSelectedPlacedItem ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.rotateSelected}
          onPress={handleRotate}
          style={styles.selectedItemAction}
        >
          <Ionicons name="sync" size={18} color="#7C5870" />
          <Text style={styles.selectedItemActionText}>{copy.rotateSelected}</Text>
        </Pressable>
      ) : null}
      {selectedInstanceId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.removeSelected}
          onPress={handleRemoveItem}
          style={styles.selectedItemAction}
        >
          <Ionicons name="trash-outline" size={18} color="#D94F69" />
          <Text style={[styles.selectedItemActionText, styles.selectedItemActionDangerText]}>{copy.removeSelected}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
