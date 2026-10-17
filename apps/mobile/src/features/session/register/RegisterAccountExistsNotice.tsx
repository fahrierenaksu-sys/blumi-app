import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import { registerStyles as styles } from "./registerStyles"

/**
 * Shown instead of a generic error when the verified phone already has an
 * account: nothing was created, and the user can sign in with one tap.
 */
export function RegisterAccountExistsNotice({
  title,
  body,
  actionLabel,
  busy,
  onSignIn
}: {
  title: string
  body: string
  actionLabel: string
  busy: boolean
  onSignIn: () => void
}) {
  return (
    <View testID="register-account-exists" style={styles.accountExistsBox}>
      <View style={styles.accountExistsHeader}>
        <Ionicons
          accessible={false}
          name="person-circle-outline"
          size={20}
          color={uiTheme.colors.warningInk}
        />
        <Text accessibilityRole="alert" maxFontSizeMultiplier={1.5} style={styles.accountExistsTitle}>
          {title}
        </Text>
      </View>
      <Text maxFontSizeMultiplier={1.5} style={styles.accountExistsBody}>
        {body}
      </Text>
      <Pressable
        testID="register-account-exists-sign-in"
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onSignIn}
        style={({ pressed }) => [
          styles.signInExistingButton,
          pressed ? styles.controlPressed : null
        ]}
      >
        <Text maxFontSizeMultiplier={1.5} style={styles.signInExistingButtonText}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  )
}
