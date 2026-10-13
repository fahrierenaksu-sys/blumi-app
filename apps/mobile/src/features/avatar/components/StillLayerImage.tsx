import { Image } from "expo-image"
import { memo } from "react"
import { View } from "react-native"
import type { AvatarStillFrame } from "../model/avatarStillLayout"
import { AVATAR_STILL_ASSETS } from "../stills/stillAssets"

export interface StillLayerImageProps {
  frame: AvatarStillFrame
  onDisplay: () => void
  onError?: () => void
}

/**
 * One baked still layer at its frame. A layer that is a part of a shared sheet (a composed leg) is drawn as the whole
 * sheet offset inside a frame that clips to the part, so plain image stacking shows it exactly.
 */
export const StillLayerImage = memo(function StillLayerImage({ frame, onDisplay, onError }: StillLayerImageProps) {
  const place = { position: "absolute", left: frame.left, top: frame.top, width: frame.width, height: frame.height } as const
  const image = (style: object) => (
    <Image
      source={AVATAR_STILL_ASSETS[frame.asset]}
      style={style}
      contentFit="fill"
      cachePolicy="memory"
      transition={0}
      onDisplay={onDisplay}
      onError={onError}
    />
  )
  if (!frame.sheet) return image(place)
  return <View style={[place, { overflow: "hidden" }]}>{image({ position: "absolute", ...frame.sheet })}</View>
})
