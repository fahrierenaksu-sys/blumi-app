import type { ImageSourcePropType } from "react-native"
import { AVATAR_STILL_ASSETS } from "./stillAssets"

/**
 * The baked 2.5D picture of one whole item, cropped tight to its pixels, for every item the 2.5D rig draws.
 * Wardrobe and Shop cards show it in place of any pre-2.5D artwork that item still has.
 */
export function getAvatarItemStillThumbnail(itemId: string): ImageSourcePropType | undefined {
  return AVATAR_STILL_ASSETS[`male/thumb/${itemId}`] ?? AVATAR_STILL_ASSETS[`female/thumb/${itemId}`]
}
