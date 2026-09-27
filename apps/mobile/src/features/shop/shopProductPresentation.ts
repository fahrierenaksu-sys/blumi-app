import type { AppLocale } from "../session/appLocale"
import type { ShopCatalogItem } from "./shopCatalog"
import { getShopCopy } from "./shopCopy"
import { formatCoins } from "./shopFormatters"

export function getShopProductPresentation(product: ShopCatalogItem, locale: AppLocale) {
  const copy = getShopCopy(locale)
  const category = product.avatarItem?.type ?? product.roomItem?.category ?? "all"
  const categoryLabel = copy.categories[category] ?? category
  const outfit = Boolean(product.avatarItem?.outfitKey)
  const placed = product.previewType === "room" && (product.placedCount ?? 0) > 0
  const wearing = product.previewType === "avatar" && product.owned && product.actionType === "disabled"
  const stateLabel = placed
    ? copy.product.placed(product.placedCount ?? 0)
    : wearing
      ? outfit ? copy.product.wearingOutfit : copy.product.wearing
      : product.owned
        ? outfit ? copy.product.ownedOutfit : copy.owned
        : product.priceCoins !== null
          ? `${formatCoins(product.priceCoins, locale)} ${copy.coins}`
          : copy.product.tryStyle
  const actionLabel = placed
    ? copy.product.placed(product.placedCount ?? 0)
    : product.actionType === "avatarEquip"
      ? outfit ? copy.product.wearOutfit : copy.product.wearNow
      : product.actionType === "roomPlace"
        ? copy.product.placeNow
        : product.actionType === "avatarUnlock" || product.actionType === "roomUnlock"
          ? `${copy.unlock} · ${formatCoins(product.priceCoins ?? 0, locale)} ${copy.coins}`
          : stateLabel
  const eyebrow = product.previewType === "avatar"
    ? outfit
      ? copy.product.avatarOutfit
      : category === "accessory"
        ? copy.product.avatarAccessory
        : copy.product.avatarCategory(categoryLabel)
    : copy.product.roomCategory(categoryLabel)
  return { stateLabel, actionLabel, eyebrow }
}
