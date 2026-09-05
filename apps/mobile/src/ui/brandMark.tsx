import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { uiTheme } from "./theme"

const blumiIconSource = require("../../assets/brand/blumi-app-icon-1024.png")

interface BrandMarkProps {
  size?: number
  tone?: "light" | "dark"
  style?: StyleProp<ViewStyle>
}

export function BrandMark(props: BrandMarkProps) {
  const { size = 48, tone = "light", style } = props

  return (
    <View
      style={[
        styles.mark,
        tone === "light" ? uiTheme.shadow.soft : null,
        {
          width: size,
          height: size,
          borderRadius: size * 0.24,
        },
        style
      ]}
    >
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={blumiIconSource}
        style={{ width: size, height: size }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  }
})
