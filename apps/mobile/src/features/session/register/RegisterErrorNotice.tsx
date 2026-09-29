import Ionicons from "@expo/vector-icons/Ionicons"
import { Text, View } from "react-native"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import { registerStyles as styles } from "./registerStyles"

/** Session-owned provider or verification error shown under the form. */
export function RegisterErrorNotice({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Ionicons
        accessible={false}
        name="alert-circle-outline"
        size={19}
        color={uiTheme.colors.danger}
      />
      <Text accessibilityRole="alert" style={styles.error}>
        {message}
      </Text>
    </View>
  )
}
