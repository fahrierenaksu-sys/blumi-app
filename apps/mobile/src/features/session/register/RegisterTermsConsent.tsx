import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text } from "react-native"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import type { AuthEntryCopy } from "../authEntryCopy"
import { registerStyles as styles } from "./registerStyles"

/** The single combined terms-and-privacy acceptance required to create an account. */
export function RegisterTermsConsent({
  authCopy,
  termsAccepted,
  busy,
  compact,
  onToggle
}: {
  authCopy: AuthEntryCopy
  termsAccepted: boolean
  busy: boolean
  compact: boolean
  onToggle: () => void
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={authCopy.acceptTerms}
      accessibilityState={{ checked: termsAccepted, disabled: busy }}
      disabled={busy}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.termsConsent,
        compact ? styles.termsConsentCompact : null,
        pressed ? styles.controlPressed : null
      ]}
    >
      <Ionicons
        accessible={false}
        color={termsAccepted ? uiTheme.colors.primary : uiTheme.colors.textMuted}
        name={termsAccepted ? "checkbox" : "square-outline"}
        size={24}
      />
      <Text maxFontSizeMultiplier={1.5} style={styles.termsConsentText}>
        {authCopy.termsConsent}
      </Text>
    </Pressable>
  )
}
