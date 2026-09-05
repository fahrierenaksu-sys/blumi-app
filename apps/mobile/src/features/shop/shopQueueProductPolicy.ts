import type { ShopCatalogItem } from "./shopCatalog"

export type QueuedAvatarProductResolution =
  | { kind: "visible"; product: ShopCatalogItem }
  | { kind: "missing" }

export function resolveQueuedAvatarProduct(
  productId: string,
  products: readonly ShopCatalogItem[]
): QueuedAvatarProductResolution {
  const product = products.find((candidate) => candidate.sourceItemId === productId)
  return product ? { kind: "visible", product } : { kind: "missing" }
}
