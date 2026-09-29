import { Image as ExpoImage } from "expo-image"
import { Image as NativeImage, type ImageSourcePropType } from "react-native"
import { createDiscoveryFirstFrameAssetWarmup } from "./discoveryFirstFrameAssetWarmup"

const sources: ImageSourcePropType[] = [
  require("../../../assets/ui/home-liquid-background-v2.png"),
  require("../../../assets/ui/discover-card-surface.png")
]

export const warmDiscoveryFirstFrameAssets = createDiscoveryFirstFrameAssetWarmup(
  sources,
  (source) => NativeImage.resolveAssetSource(source)?.uri,
  (uris) => ExpoImage.prefetch(uris, "memory-disk")
)
