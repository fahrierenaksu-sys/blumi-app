import { Image } from "expo-image"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"

const homeLiquidBackground = require("../../assets/ui/home-liquid-background-v2.png")

export function HomeLiquidBackground({
  style,
  priority = "high"
}: {
  style?: StyleProp<ViewStyle>
  priority?: "low" | "normal" | "high"
} = {}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, style]}>
      <Image
        source={homeLiquidBackground}
        contentFit="cover"
        contentPosition="center"
        cachePolicy="memory-disk"
        priority={priority}
        transition={0}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#FFF8FC",
    overflow: "hidden"
  }
})
