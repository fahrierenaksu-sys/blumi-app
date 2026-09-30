import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import { styles } from "./roomEditorStyles"

/** Cancel, title with live placement guidance, undo, and Save. */
export function RoomEditorTopBar(props: {
  copy: MyRoomEditorCopy
  subtitle: string
  canUndo: boolean
  isSavingRoom: boolean
  onCancel: () => void
  onUndo: () => void
  onSave: () => void
}) {
  const { copy, subtitle, canUndo, isSavingRoom, onCancel, onUndo, onSave } = props
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.cancel}
        onPress={onCancel}
        style={({ pressed }) => [
          styles.cancelButton,
          pressed ? styles.iconButtonPressed : null
        ]}
        hitSlop={8}
      >
        <Ionicons name="close" size={24} color="#5B3A52" />
      </Pressable>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.topActions}>
        {canUndo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.undo}
            onPress={onUndo}
            style={styles.actionButton}
            hitSlop={8}
          >
            <Ionicons name="arrow-undo" size={20} color="#7C5870" />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.saveLayout}
          accessibilityState={{ disabled: isSavingRoom }}
          disabled={isSavingRoom}
          onPress={onSave}
          style={({ pressed }) => [
            styles.saveButton,
            pressed && styles.saveButtonPressed
          ]}
          hitSlop={8}
        >
          <Text style={styles.saveButtonText}>
            {isSavingRoom ? copy.saving : copy.save}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
