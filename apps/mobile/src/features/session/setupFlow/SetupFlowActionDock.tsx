import type { ReactNode } from "react"
import { StyleSheet, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "../../../ui/linearGradient"
import { PrimaryButton } from "../../../ui/primitives"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"

interface SetupFlowActionDockProps {
  label: string
  onPress: () => void
  busy?: boolean
  disabled?: boolean
  icon?: ReactNode
  testID?: string
}

export function SetupFlowActionDock({
  label,
  onPress,
  busy = false,
  disabled = false,
  icon,
  testID
}: SetupFlowActionDockProps) {
  const { width } = useWindowDimensions()
  const horizontalInset = width < 390 ? 16 : 20

  return (
    <View
      style={[styles.root, { paddingHorizontal: horizontalInset }]}
      testID="setup-flow-action-dock"
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={["rgba(255,248,250,0)", uiTheme.colors.backgroundWarm]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.72 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <PrimaryButton
        busy={busy}
        disabled={disabled}
        icon={icon}
        label={label}
        onPress={onPress}
        style={styles.action}
        testID={testID}
        tone="entry"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexShrink: 0,
    position: "relative",
    paddingBottom: uiTheme.spacing.sm,
    paddingTop: uiTheme.spacing.xs,
    width: "100%"
  },
  action: {
    minHeight: 58
  }
})
