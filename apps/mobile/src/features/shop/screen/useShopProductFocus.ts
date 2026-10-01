import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react"
import type { ShopCatalogItem } from "../shopCatalog"
import type { ShopMode } from "../ShopNavigationControls"
import { resolveShopProductFocus } from "./shopScreenModel"

/**
 * MICRO-3: the wardrobe's "See in Shop" names a product by its canonical id.
 * Each new request opens that product on its category shelf, scrolls the
 * shelf to it and previews it on the avatar (never buys or equips). An id
 * the Shop does not list just leaves the avatar Shop open.
 */
export function useShopProductFocus(input: {
  focusProductId: string | undefined
  focusRequestId: number | undefined
  avatarProducts: readonly ShopCatalogItem[]
  setShopMode: Dispatch<SetStateAction<ShopMode>>
  setSelectedCategoryId: Dispatch<SetStateAction<string>>
  selectProduct: (product: ShopCatalogItem) => void
}): { productId: string; requestId: number } | undefined {
  const { focusProductId, focusRequestId, avatarProducts, setShopMode, setSelectedCategoryId, selectProduct } = input
  const [revealRequest, setRevealRequest] = useState<{ productId: string; requestId: number }>()
  const handledRequestRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (focusRequestId === undefined || handledRequestRef.current === focusRequestId) return
    handledRequestRef.current = focusRequestId
    const focus = resolveShopProductFocus(avatarProducts, focusProductId)
    if (!focus) return
    setShopMode("avatar")
    setSelectedCategoryId(focus.categoryId)
    selectProduct(focus.product)
    setRevealRequest({ productId: focus.product.id, requestId: focusRequestId })
  }, [avatarProducts, focusProductId, focusRequestId, selectProduct, setSelectedCategoryId, setShopMode])
  return revealRequest
}
