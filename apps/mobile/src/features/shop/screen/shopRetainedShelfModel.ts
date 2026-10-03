import { type Dispatch, type SetStateAction, useCallback, useLayoutEffect, useRef, useState } from "react"
import type { View } from "react-native"
import type { ShopMode } from "../ShopNavigationControls"
import type { ShopCatalogItem } from "../shopCatalog"
import { hapticSelection } from "../../../ui/haptics"
import { publishSelectedShopPreviewWarmup } from "../../performance/sceneAssetWarmupModel"
import { getDefaultShopCategoryId, getShopShelfScope } from "./shopScreenModel"

export interface RetainedShopShelf {
  scope: string
  mode: ShopMode
  categoryId: string
}

/** Keep the two most recently used category trees per mode, not catalog data.
 * Each tree still receives the current authoritative catalog on every render.
 * Initial entry only mounts the chosen shelf; other shelves mount on demand.
 */
export function useRetainedShopShelves(mode: ShopMode, categoryId: string): readonly RetainedShopShelf[] {
  const scope = getShopShelfScope(mode, categoryId)
  const [shelves, setShelves] = useState<readonly RetainedShopShelf[]>(() => [
    { scope, mode, categoryId }
  ])
  if (shelves[shelves.length - 1]?.scope !== scope) {
    const visited = shelves.find((shelf) => shelf.scope === scope) ?? { scope, mode, categoryId }
    const next = [...shelves.filter((shelf) => shelf.scope !== scope), visited]
    const sameMode = next.filter((shelf) => shelf.mode === mode)
    const evicted = sameMode.length > 2 ? sameMode[0]?.scope : undefined
    setShelves(next.filter((shelf) => shelf.scope !== evicted))
  }
  return shelves
}

export function useShopModeSelection(input: {
  mode: ShopMode
  shelves: readonly RetainedShopShelf[]
  setMode: Dispatch<SetStateAction<ShopMode>>
  setCategory: Dispatch<SetStateAction<string>>
  setSelectedId: Dispatch<SetStateAction<string>>
}) {
  const requestedMode = useRef(input.mode)
  useLayoutEffect(() => { requestedMode.current = input.mode }, [input.mode])
  const { shelves, setCategory, setMode, setSelectedId } = input
  return useCallback((nextMode: ShopMode) => {
    // Discrete taps can be queued before React commits. Compare the latest
    // request so avatar→home→avatar in one batch keeps the final avatar tap.
    if (requestedMode.current === nextMode) return
    requestedMode.current = nextMode
    hapticSelection()
    publishSelectedShopPreviewWarmup([])
    setMode(nextMode)
    const previousShelf = [...shelves].reverse().find((shelf) => shelf.mode === nextMode)
    setCategory(previousShelf?.categoryId ?? getDefaultShopCategoryId(nextMode))
    setSelectedId("")
  }, [shelves, setCategory, setMode, setSelectedId])
}

export function useShopCategorySelection(categoryId: string, setCategory: Dispatch<SetStateAction<string>>) {
  const requestedCategory = useRef(categoryId)
  useLayoutEffect(() => { requestedCategory.current = categoryId }, [categoryId])
  return useCallback((nextCategory: string) => {
    if (requestedCategory.current === nextCategory) return
    requestedCategory.current = nextCategory
    hapticSelection()
    setCategory(nextCategory)
  }, [setCategory])
}

/** Retained, overlapping category trees can contain the same product. Only
 * the visible shelf contributes thumbnail views to a purchase's starting point.
 * Layout cleanup runs before activation so an old shelf cannot clear its successor.
 */
export function useShopShelfThumbnailRegistration(
  active: boolean,
  registerThumbnail?: (sourceItemId: string, view: View | null) => void
) {
  const thumbnails = useRef(new Map<string, View>())
  const activeRegistration = useRef(active ? registerThumbnail : undefined)
  useLayoutEffect(() => {
    const views = thumbnails.current
    activeRegistration.current = active ? registerThumbnail : undefined
    if (!active || !registerThumbnail) return
    for (const [id, view] of views) registerThumbnail(id, view)
    return () => {
      activeRegistration.current = undefined
      for (const id of views.keys()) registerThumbnail(id, null)
    }
  }, [active, registerThumbnail])
  return useCallback((sourceItemId: string, view: View | null) => {
    if (view) thumbnails.current.set(sourceItemId, view)
    else thumbnails.current.delete(sourceItemId)
    activeRegistration.current?.(sourceItemId, view)
  }, [])
}

/** Shelf cards keep their handlers through mode changes, while presses always
 * reach the latest committed selection/removal logic rather than old closures.
 */
export function useShopShelfActions(input: {
  selectCategory: (categoryId: string) => void
  selectProduct: (product: ShopCatalogItem) => void
  removeProduct: (product: ShopCatalogItem) => void
}) {
  const actions = useRef(input)
  useLayoutEffect(() => { actions.current = input }, [input])
  const selectCategory = useCallback((categoryId: string) => actions.current.selectCategory(categoryId), [])
  const selectProduct = useCallback((product: ShopCatalogItem) => actions.current.selectProduct(product), [])
  const removeProduct = useCallback((product: ShopCatalogItem) => actions.current.removeProduct(product), [])
  return { selectCategory, selectProduct, removeProduct }
}
