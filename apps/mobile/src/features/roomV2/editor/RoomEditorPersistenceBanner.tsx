import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import { styles } from "./roomEditorStyles"

/** Actionable room-sync failure with the redacted provider message and retry. */
export function RoomEditorPersistenceBanner(props: {
  copy: MyRoomEditorCopy
  persistenceErrorMessage: string
  retryPersistence: () => void
}) {
  const { copy, persistenceErrorMessage, retryPersistence } = props
  return (
    <View
      style={styles.persistenceBanner}
      accessibilityRole="alert"
    >
      <Ionicons
        name="cloud-offline-outline"
        size={18}
        color="#8B4D66"
      />
      <Text style={styles.persistenceBannerText}>
        {persistenceErrorMessage}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.retrySync}
        onPress={retryPersistence}
        hitSlop={8}
        style={({ pressed }) => [
          styles.persistenceRetryButton,
          pressed ? styles.iconButtonPressed : null
        ]}
      >
        <Ionicons name="refresh" size={18} color="#8B4D66" />
      </Pressable>
    </View>
  )
}
