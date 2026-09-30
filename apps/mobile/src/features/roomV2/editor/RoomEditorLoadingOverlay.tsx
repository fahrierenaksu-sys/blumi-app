import Ionicons from "@expo/vector-icons/Ionicons"
import { Text, View } from "react-native"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import { styles } from "./roomEditorStyles"

/** Blocks the editor with a progress state until persisted decor hydrates. */
export function RoomEditorLoadingOverlay(props: { copy: MyRoomEditorCopy }) {
  const { copy } = props
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={copy.preparing}
      style={styles.roomLoadingOverlay}
    >
      <Ionicons name="sparkles-outline" size={20} color="#7C5870" />
      <Text style={styles.roomLoadingOverlayText}>{copy.preparing}</Text>
    </View>
  )
}
