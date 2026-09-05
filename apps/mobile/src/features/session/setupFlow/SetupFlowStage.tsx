import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"

interface SetupFlowStageProps {
  children: ReactNode
  height: number
  interactive?: boolean
}

export function SetupFlowStage({
  children,
  height,
  interactive = false
}: SetupFlowStageProps) {
  return (
    <View
      importantForAccessibility={interactive ? "auto" : "no-hide-descendants"}
      pointerEvents={interactive ? "auto" : "none"}
      style={[styles.root, { height }]}
      testID="setup-flow-stage"
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    width: "100%"
  }
})
