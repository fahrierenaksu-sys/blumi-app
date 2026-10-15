import Ionicons from "@expo/vector-icons/Ionicons"
import { Text, View } from "react-native"
import { useAccessibilityAnnouncement } from "../../../ui/accessibilityAnnouncement"
import { uiTheme } from "../../../ui/theme"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

export function WardrobeSaveError(props: { message: string }) {
  useAccessibilityAnnouncement(props.message)
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.saveError}
    >
      <Ionicons
        name="alert-circle"
        size={17}
        color={uiTheme.colors.danger}
      />
      <Text style={styles.saveErrorText}>
        {props.message}
      </Text>
    </View>
  )
}
