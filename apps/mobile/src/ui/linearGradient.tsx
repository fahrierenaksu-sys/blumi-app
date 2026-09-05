import type { ReactNode } from "react"
import { View, type ColorValue, type StyleProp, type ViewStyle } from "react-native"

interface LinearGradientProps {
  children?: ReactNode
  colors: readonly ColorValue[]
  locations?: readonly number[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  style?: StyleProp<ViewStyle>
}

export function LinearGradient(props: LinearGradientProps) {
  const { children, colors, style } = props
  const baseColor = colors[colors.length - 1] ?? colors[0] ?? "transparent"
  return (
    <View style={[style, { backgroundColor: baseColor, overflow: "hidden" }]}>
      {children}
    </View>
  )
}
