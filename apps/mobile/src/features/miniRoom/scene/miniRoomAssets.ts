import type { ImageSourcePropType } from "react-native"

const image = (asset: ImageSourcePropType): ImageSourcePropType => asset

export const miniRoomAssets = {
  rooms: {
    cozyPinkBedroom: image(require("../assets/runtime/rooms/cozy_pink_bedroom/room_bg.webp"))
  }
} as const
