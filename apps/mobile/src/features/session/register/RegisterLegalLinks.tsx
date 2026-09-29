import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native"
import type { AuthEntryCopy } from "../authEntryCopy"
import { registerStyles as styles } from "./registerStyles"

/** Privacy and terms links; the caller owns the row layout and navigation. */
export function RegisterLegalLinks({
  authCopy,
  rowStyle,
  onOpenPrivacy,
  onOpenTerms
}: {
  authCopy: AuthEntryCopy
  rowStyle: StyleProp<ViewStyle>
  onOpenPrivacy: () => void
  onOpenTerms: () => void
}) {
  return (
    <View style={rowStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={authCopy.openPrivacyPolicy}
        onPress={onOpenPrivacy}
        hitSlop={8}
        style={({ pressed }) => [
          styles.legalPressable,
          pressed ? styles.controlPressed : null
        ]}
      >
        <Text maxFontSizeMultiplier={1.5} style={styles.legalLink}>
          {authCopy.privacy}
        </Text>
      </Pressable>
      <Text maxFontSizeMultiplier={1.5} style={styles.legalSeparator}>·</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={authCopy.openTerms}
        onPress={onOpenTerms}
        hitSlop={8}
        style={({ pressed }) => [
          styles.legalPressable,
          pressed ? styles.controlPressed : null
        ]}
      >
        <Text maxFontSizeMultiplier={1.5} style={styles.legalLink}>
          {authCopy.terms}
        </Text>
      </Pressable>
    </View>
  )
}
