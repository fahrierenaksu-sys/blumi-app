import Ionicons from "@expo/vector-icons/Ionicons"
import { Text, View } from "react-native"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import { roomEditorTheme, styles } from "./roomEditorStyles"

/** Calm note that the room holds more items than it can show; nothing was removed. */
export function RoomEditorLimitNotice(props: {
  copy: MyRoomEditorCopy
  hiddenCount: number
}) {
  return (
    <View style={styles.persistenceBanner} accessibilityRole="summary">
      <Ionicons
        name="information-circle-outline"
        size={18}
        color={roomEditorTheme.accent}
      />
      <Text style={styles.persistenceBannerText}>
        {props.copy.roomLimitNotice(props.hiddenCount)}
      </Text>
    </View>
  )
}
