import type { ShopCatalogItem } from "./shopCatalog"

export type ShopAvatarCategoryId =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "shoes"
  | "accessory"
  | "hair"

export const SHOP_AVATAR_CATEGORY_ORDER = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
  "hair"
] as const satisfies readonly ShopAvatarCategoryId[]

export function filterAvatarShopProductsByCategory(
  products: readonly ShopCatalogItem[],
  categoryId: string
): ShopCatalogItem[] {
  if (!SHOP_AVATAR_CATEGORY_ORDER.includes(categoryId as ShopAvatarCategoryId)) return []

  if (categoryId === "dress") {
    return products.filter((product) => Boolean(product.avatarItem?.outfitKey))
  }

  if (categoryId === "outerwear") return []

  return products.filter((product) =>
    product.avatarItem?.type === categoryId &&
    (categoryId !== "top" || !product.avatarItem.outfitKey)
  )
}

export function getAvatarShopCategoryId(
  product: ShopCatalogItem
): ShopAvatarCategoryId | undefined {
  if (product.avatarItem?.outfitKey) return "dress"
  const categoryId = product.avatarItem?.type
  if (categoryId && SHOP_AVATAR_CATEGORY_ORDER.includes(categoryId as ShopAvatarCategoryId)) {
    return categoryId as ShopAvatarCategoryId
  }
  return undefined
}
