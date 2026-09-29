import { Image as ExpoImage } from "expo-image"
import { StyleSheet, View } from "react-native"

const discoveryBackgroundAsset = require("../../../assets/ui/home-liquid-background-v2.png")

export function DiscoveryBackground(props: { onDisplay?: () => void; onError?: () => void } = {}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      <ExpoImage
        source={discoveryBackgroundAsset}
        contentFit="cover"
        contentPosition="center"
        cachePolicy="memory-disk"
        priority="normal"
        transition={0}
        onDisplay={props.onDisplay}
        onError={props.onError}
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
