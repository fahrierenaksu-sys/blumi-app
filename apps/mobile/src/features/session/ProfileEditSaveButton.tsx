import Ionicons from "@expo/vector-icons/Ionicons"
import { useRef } from "react"
import { Animated, Pressable, StyleSheet, Text } from "react-native"
import { springPressScale, useReducedMotion } from "../../ui/animations"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"

/**
 * The profile editor's save action, pinned in the top bar so it is reachable
 * from every field (DSC-9). Disabled until there is a valid change.
 */
export function ProfileEditSaveButton(props: {
  enabled: boolean
  isSaving: boolean
  saved: boolean
  onPress: () => void
  copy: { saveShort: string; save: string; saving: string; saved: string; savedStatus: string; savingAccessibility: string }
}) {
  const { enabled, isSaving, saved, copy } = props
  const saveScaleAnim = useRef(new Animated.Value(1)).current
  const reduceMotion = useReducedMotion()
  const handlePressIn = () => springPressScale(saveScaleAnim, uiTheme.animation.scalePress, uiTheme.animation.spring, reduceMotion)
  const handlePressOut = () => springPressScale(saveScaleAnim, 1, uiTheme.animation.springBouncy, reduceMotion)

  return (
    <Animated.View style={{ transform: [{ scale: saveScaleAnim }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saved ? copy.savedStatus : isSaving ? copy.savingAccessibility : copy.save}
        accessibilityState={{ disabled: !enabled, busy: isSaving }}
        onPress={props.onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={!enabled}
        hitSlop={4}
        style={[styles.button, !enabled && !saved ? styles.buttonDisabled : null]}
      >
        <LinearGradient
          colors={enabled || saved
            ? uiTheme.gradients.primary
            : [uiTheme.colors.primaryDisabled, uiTheme.colors.primaryDisabled]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          {saved ? <Ionicons name="checkmark" size={16} color={uiTheme.colors.textInverted} /> : null}
          <Text style={styles.text} maxFontSizeMultiplier={1.4} numberOfLines={1}>
            {saved ? copy.saved : isSaving ? copy.saving : copy.saveShort}
          </Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  button: {
    borderRadius: uiTheme.radius.full,
    overflow: "hidden",
    ...uiTheme.shadow.glowSubtle
  },
  buttonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0
  },
  gradient: {
    minHeight: 40,
    paddingHorizontal: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4
  },
  text: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textInverted
  }
})
