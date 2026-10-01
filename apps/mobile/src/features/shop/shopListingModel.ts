import { isRetiredAvatarItemId, type EconomyCatalogItem } from "@blumi/domain"
import type { AvatarCatalogItem } from "../avatarV2/avatarV2.types"

/** Avatar types the Shop sells (shopCatalog builds its avatar shelf from these). */
export const SHOP_AVATAR_ITEM_TYPES: ReadonlySet<string> = new Set([
  "hair",
  "top",
  "bottom",
  "shoes",
  "accessory"
])

/**
 * Whether the production Shop lists this avatar item, so another surface (the
 * wardrobe's locked cards) may show it and link to it by its canonical id.
 * Mirrors the production Shop shelf: a Shop type, not hidden or retired, not
 * a semantic outfit (production never merchandises them), published in the
 * release catalog with a price, and with Shop artwork. Listing is never
 * ownership: ownership comes only from the server inventory.
 */
export function isAvatarItemSoldInShop(
  item: AvatarCatalogItem,
  listing: {
    publishedCatalog: readonly EconomyCatalogItem[]
    hasShopThumbnail: (itemId: string) => boolean
  }
): boolean {
  if (!SHOP_AVATAR_ITEM_TYPES.has(item.type)) return false
  if (item.hiddenFromShop === true || item.outfitKey || isRetiredAvatarItemId(item.id)) return false
  const entry = listing.publishedCatalog.find((candidate) =>
    candidate.itemId === item.id && candidate.type === "avatar"
  )
  if (!entry || entry.priceCoins === null || entry.priceCoins === undefined) return false
  return listing.hasShopThumbnail(item.id)
}
