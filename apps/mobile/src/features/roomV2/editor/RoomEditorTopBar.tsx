import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import { WardrobeGlass } from "../../avatarV2/wardrobe/WardrobeGlass"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import { roomEditorTheme, styles } from "./roomEditorStyles"

/** Close, the small title, and the rose Save capsule shared with the wardrobe. */
export function RoomEditorTopBar(props: {
  copy: MyRoomEditorCopy
  isSavingRoom: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const { copy, isSavingRoom, onCancel, onSave } = props
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.cancel}
        onPress={onCancel}
        style={({ pressed }) => (pressed ? styles.controlPressed : null)}
        hitSlop={8}
      >
        <WardrobeGlass
          tone="control"
          radius={20}
          style={styles.closeButton}
          contentStyle={styles.glassControl}
        >
          <Ionicons name="close" size={20} color={roomEditorTheme.ink} />
        </WardrobeGlass>
      </Pressable>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={styles.title}
      >
        {copy.title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.saveLayout}
        accessibilityState={{ disabled: isSavingRoom, busy: isSavingRoom }}
        disabled={isSavingRoom}
        onPress={onSave}
        style={({ pressed }) => [
          pressed ? styles.controlPressed : null,
          isSavingRoom ? styles.controlDisabled : null
        ]}
        hitSlop={8}
      >
        <View style={styles.saveButton}>
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.saveButtonText}>
            {isSavingRoom ? copy.saving : copy.save}
          </Text>
        </View>
      </Pressable>
    </View>
  )
}
