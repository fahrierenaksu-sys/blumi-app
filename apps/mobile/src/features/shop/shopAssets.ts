import type { ImageSourcePropType } from "react-native"
import { getAvatarItemStillThumbnail } from "../avatar/stills/stillThumbnail"

/**
 * Merchandising order: these IDs sort first on the avatar shelf, then priced items, then the rest. The retired
 * pre-2.5D IDs that used to lead it can never be listed, so only the live ones remain.
 */
export const PRODUCT_REFERENCE_AVATAR_ITEM_IDS: ReadonlySet<string> = new Set([
  "avatar_v2_hair_cocoa_cloud_ponytail",
  "avatar_v2_hair_espresso_sleek_ribbon_pony",
  "avatar_v2_hair_ink_pageboy_star",
  "avatar_v2_shoes_mint_ribbon_court_sneakers",
  "avatar_v2_top_coral_wave_polo",
  "avatar_v2_bottom_coral_wave_pants"
])

/**
 * The Shop's picture of an avatar item: its baked 2.5D thumbnail, the whole garment cropped tight to its pixels.
 * An item without one has no Shop picture, so the Shop does not list it (`isDisplayableAvatarShopProduct`,
 * `isAvatarItemSoldInShop`). The pre-2.5D Shop artwork is retired (see `avatarV2/retiredAvatarArt.ts`).
 */
export function getShopProductThumbnailSource(sourceItemId: string): ImageSourcePropType | undefined {
  return getAvatarItemStillThumbnail(sourceItemId)
}

export function getAvatarItemPreviewSource(item: { id: string } | string): ImageSourcePropType | undefined {
  return getShopProductThumbnailSource(typeof item === "string" ? item : item.id)
}
