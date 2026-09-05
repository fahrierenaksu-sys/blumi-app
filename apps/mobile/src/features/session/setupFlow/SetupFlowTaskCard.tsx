import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"

interface SetupFlowTaskCardProps {
  children: ReactNode
  padding: 18 | 20 | 24
  tone?: "default" | "liquid" | "sheet"
  minHeight?: number
}

export function SetupFlowTaskCard({
  children,
  padding,
  tone = "default",
  minHeight
}: SetupFlowTaskCardProps) {
  return (
    <View
      style={[
        styles.root,
        tone === "liquid" ? styles.liquidRoot : null,
        tone === "sheet" ? styles.sheetRoot : null,
        minHeight ? { minHeight } : null,
        { padding }
      ]}
      testID="setup-flow-task-card"
    >
      {tone === "liquid" ? (
        <>
          <View pointerEvents="none" style={styles.liquidGlowTop} />
          <View pointerEvents="none" style={styles.liquidGlowBottom} />
        </>
      ) : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "rgba(255,255,255,0.8)",
    borderColor: uiTheme.colors.glassBorder,
    borderRadius: 32,
    borderWidth: 1,
    minHeight: 96,
    ...uiTheme.shadow.card
  },
  liquidRoot: {
    backgroundColor: "rgba(255,255,255,0.66)",
    borderColor: "rgba(255,255,255,0.96)",
    borderRadius: 34,
    marginHorizontal: -4,
    overflow: "hidden",
    shadowOpacity: 0.12
  },
  sheetRoot: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    elevation: 0,
    shadowOpacity: 0
  },
  liquidGlowTop: {
    backgroundColor: "rgba(255,226,239,0.46)",
    borderRadius: 180,
    height: 180,
    position: "absolute",
    right: -62,
    top: -108,
    width: 260
  },
  liquidGlowBottom: {
    backgroundColor: "rgba(255,255,255,0.58)",
    borderRadius: 160,
    bottom: -120,
    height: 190,
    left: -70,
    position: "absolute",
    width: 270
  }
})
