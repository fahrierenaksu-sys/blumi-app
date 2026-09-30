import { getAppLocale, getLocaleIdentifier } from "../../session/appLocale"
import {
  getShopProductThumbnailSource,
  PRODUCT_REFERENCE_AVATAR_ITEM_IDS
} from "../shopAssets"
import type { ShopCatalogItem } from "../shopCatalog"

/**
 * Avatar Shop ordering: product-reference items first, then priced items,
 * then the rest; ties sort by title in the device locale. Callers omit
 * `locale`, so it resolves at call time exactly as the screen always did.
 */
export function sortAvatarShopProducts(products: ShopCatalogItem[], locale = getAppLocale()): ShopCatalogItem[] {
  return [...products].sort((left, right) => {
    const priorityDelta =
      getAvatarShopProductPriority(left) - getAvatarShopProductPriority(right)
    if (priorityDelta !== 0) return priorityDelta
    return left.title.localeCompare(right.title, getLocaleIdentifier(locale))
  })
}

export function isDisplayableAvatarShopProduct(product: ShopCatalogItem): boolean {
  if (!product.avatarItem) return false
  return getShopProductThumbnailSource(product.sourceItemId) !== undefined
}

export function getAvatarShopProductPriority(product: ShopCatalogItem): number {
  if (PRODUCT_REFERENCE_AVATAR_ITEM_IDS.has(product.sourceItemId)) return 0
  if (product.priceCoins !== null) return 1
  return 2
}
