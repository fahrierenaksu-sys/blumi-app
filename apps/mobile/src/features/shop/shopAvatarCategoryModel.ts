import type { ShopCatalogItem } from "./shopCatalog"

export type ShopAvatarCategoryId =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "shoes"
  | "glasses"
  | "accessory"
  | "hair"

export const SHOP_AVATAR_CATEGORY_ORDER = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "glasses",
  "accessory",
  "hair"
] as const satisfies readonly ShopAvatarCategoryId[]

export function filterAvatarShopProductsByCategory(
  products: readonly ShopCatalogItem[],
  categoryId: string
): ShopCatalogItem[] {
  if (!SHOP_AVATAR_CATEGORY_ORDER.includes(categoryId as ShopAvatarCategoryId)) return []

  if (categoryId === "dress") {
    return products.filter((product) => Boolean(product.avatarItem?.outfitKey) || product.avatarItem?.type === "dress")
  }

  if (categoryId === "outerwear") return []

  const isEyewear = (product: ShopCatalogItem) => product.avatarItem?.accessoryGroup === "eyewear"
  if (categoryId === "glasses") {
    return products.filter((product) => product.avatarItem?.type === "accessory" && isEyewear(product))
  }

  return products.filter((product) =>
    product.avatarItem?.type === categoryId &&
    (categoryId !== "top" || !product.avatarItem.outfitKey) &&
    (categoryId !== "accessory" || !isEyewear(product))
  )
}

/**
 * The shop shelf of an avatar product: a legacy paired outfit or a one-piece dress is a dress; eyewear accessories are
 * glasses; the other accessories (bag, clip, necklace, hat, earrings) are accessories; else its item type.
 */
export function getAvatarShopCategoryId(
  product: ShopCatalogItem
): ShopAvatarCategoryId | undefined {
  const item = product.avatarItem
  if (item?.outfitKey) return "dress"
  if (item?.type === "accessory" && item.accessoryGroup === "eyewear") return "glasses"
  const categoryId = item?.type
  if (categoryId && SHOP_AVATAR_CATEGORY_ORDER.includes(categoryId as ShopAvatarCategoryId)) {
    return categoryId as ShopAvatarCategoryId
  }
  return undefined
}
