import Ionicons from "@expo/vector-icons/Ionicons"
import { Text, View } from "react-native"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import type { AuthEntryCopy } from "../authEntryCopy"
import { registerStyles as styles } from "./registerStyles"

export function RegisterFormMetaRow({
  authCopy,
  isCodeStep
}: {
  authCopy: AuthEntryCopy
  isCodeStep: boolean
}) {
  return (
    <View style={styles.formMetaRow}>
      <View style={styles.formMetaIcon}>
        <Ionicons
          accessible={false}
          name={isCodeStep ? "chatbubble-ellipses" : "phone-portrait-outline"}
          size={18}
          color={uiTheme.colors.primaryDeep}
        />
      </View>
      <View style={styles.formMetaCopy}>
        <Text maxFontSizeMultiplier={1.5} style={styles.formMetaEyebrow}>
          {authCopy.secureSignIn}
        </Text>
        <Text maxFontSizeMultiplier={1.5} style={styles.formMetaTitle}>
          {isCodeStep ? authCopy.codeQuestion : authCopy.phoneQuestion}
        </Text>
      </View>
    </View>
  )
}
