import { Ionicons } from "@expo/vector-icons"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"

interface SetupFlowHeaderProps {
  current: 1 | 2 | 3 | 4
  onBack: () => void
  backDisabled?: boolean
  title?: string
  progressStyle?: "fraction" | "dots"
}

export function SetupFlowHeader({
  current,
  onBack,
  backDisabled = false,
  title = "Blumi",
  progressStyle = "fraction"
}: SetupFlowHeaderProps) {
  return (
    <View style={styles.root} testID="setup-flow-header">
      <View style={styles.sideSlot}>
        <Pressable
          accessibilityLabel="Geri"
          accessibilityRole="button"
          accessibilityState={{ disabled: backDisabled }}
          disabled={backDisabled}
          hitSlop={6}
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && !backDisabled ? styles.backButtonPressed : null,
            backDisabled ? styles.backButtonDisabled : null
          ]}
        >
          <Ionicons
            accessible={false}
            color={uiTheme.colors.textPrimary}
            name="arrow-back"
            size={22}
          />
        </Pressable>
      </View>
      <Text accessibilityLabel={title} style={styles.brand}>
        {title}
      </Text>
      <View style={[styles.sideSlot, styles.rightSlot]}>
        {progressStyle === "dots" ? (
          <View
            accessible
            accessibilityLabel={`Kurulum adımı ${current} / 4`}
            style={styles.dots}
          >
            {[1, 2, 3, 4].map((step) => (
              <View
                key={step}
                style={[styles.dot, step === current ? styles.dotActive : null]}
              />
            ))}
          </View>
        ) : (
          <Text
            accessibilityLabel={`Kurulum adımı ${current} / 4`}
            style={styles.step}
          >
            {current} / 4
          </Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    flexDirection: "row",
    height: 56,
    justifyContent: "space-between"
  },
  backButton: {
    alignItems: "center",
    backgroundColor: uiTheme.colors.glassStrong,
    borderColor: uiTheme.colors.glassBorder,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  backButtonPressed: {
    backgroundColor: uiTheme.colors.secondaryPressed
  },
  backButtonDisabled: {
    opacity: uiTheme.opacity.disabled
  },
  sideSlot: {
    alignItems: "flex-start",
    width: 64
  },
  rightSlot: {
    alignItems: "flex-end"
  },
  brand: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    flex: 1,
    textAlign: "center"
  },
  step: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textSecondary,
    minWidth: 44,
    textAlign: "right"
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    minHeight: 44
  },
  dot: {
    backgroundColor: "rgba(177, 154, 166, 0.42)",
    borderRadius: 5,
    height: 10,
    width: 10
  },
  dotActive: {
    backgroundColor: uiTheme.colors.actionDark
  }
})
