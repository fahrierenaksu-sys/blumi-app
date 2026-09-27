import { buildPurchaseQueue, type ShopCombinationDraft } from "./shopCombinationState"

export function getShopCombinationSummary(input: {
  draft: ShopCombinationDraft
  equipped: ShopCombinationDraft
  ownedProductIds: readonly string[]
  products: readonly { sourceItemId: string; priceCoins: number | null }[]
}) {
  const equippedIds = buildPurchaseQueue(input.equipped, []).map((item) => item.productId)
  const selected = buildPurchaseQueue(input.draft, equippedIds)
  const pending = buildPurchaseQueue(input.draft, input.ownedProductIds)
  let total: number | null = 0
  for (const item of pending) {
    const price = input.products.find((product) => product.sourceItemId === item.productId)?.priceCoins
    if (price === null || price === undefined || !Number.isSafeInteger(price) || price < 0) {
      total = null
      break
    }
    total += price
    if (!Number.isSafeInteger(total)) { total = null; break }
  }
  return { selectedCount: selected.length, purchaseCount: pending.length, total }
}

export type ShopCombinationSummary = ReturnType<typeof getShopCombinationSummary>

export function getShopCombinationItems(input: {
  selectionOrder?: readonly string[]
  draft: ShopCombinationDraft
  equipped: ShopCombinationDraft
  ownedProductIds: readonly string[]
  products: readonly { sourceItemId: string; title: string; priceCoins: number | null }[]
}) {
  const equipped = new Set(buildPurchaseQueue(input.equipped, []).map((item) => item.productId))
  const owned = new Set(input.ownedProductIds)
  return buildPurchaseQueue(input.draft, []).filter((item) => !equipped.has(item.productId) || !owned.has(item.productId)).map((item) => {
    const product = input.products.find((entry) => entry.sourceItemId === item.productId)
    return { id: item.productId, title: product?.title ?? null, price: product?.priceCoins ?? null, owned: owned.has(item.productId) }
  }).sort((left, right) => {
    const order = input.selectionOrder ?? []
    const leftIndex = order.indexOf(left.id)
    const rightIndex = order.indexOf(right.id)
    return (leftIndex < 0 ? -1 : leftIndex) - (rightIndex < 0 ? -1 : rightIndex)
  })
}

export type ShopCombinationItem = ReturnType<typeof getShopCombinationItems>[number]
