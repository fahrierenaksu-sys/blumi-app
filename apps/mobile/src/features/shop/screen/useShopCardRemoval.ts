import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState
} from "react"
import { hapticError, hapticLight } from "../../../ui/haptics"
import { showToast } from "../../../ui/toast"
import type { AvatarCatalogItem, UserAvatar } from "../../avatarV2/avatarV2.types"
import type { AvatarEquipResult } from "../../avatarV2/state/AvatarV2Provider"
import { publishSelectedShopPreviewWarmup } from "../../performance/sceneAssetWarmupModel"
import {
  avatarToShopCombinationDraft,
  shopCombinationDraftToAvatar
} from "../shopAvatarDraft"
import {
  applyShopCardRemoveAction,
  canRemoveShopCombinationItem,
  getShopCardRemoveAction,
  removeShopCombinationItem,
  type ShopCardRemoveAction
} from "../shopCardRemoveModel"
import type { ShopCatalogItem } from "../shopCatalog"
import {
  createShopCombinationState,
  type ShopCombinationAction,
  type ShopCombinationCommand,
  type ShopCombinationState
} from "../shopCombinationState"
import type { ShopCopy } from "../shopCopy"

/**
 * The X on a Shop card (see shopCardRemoveModel). A tried-on item leaves the
 * draft; a saved accessory is taken off through `equipAndSaveItem`, the
 * avatar save the wardrobe uses (the server validates the loadout). Never
 * touches inventory, coins or purchases.
 */
export function useShopCardRemoval(input: {
  products: readonly ShopCatalogItem[]
  /** Every avatar product, for the outfit list rows (by canonical source item id). */
  avatarProducts: readonly ShopCatalogItem[]
  /** Canonical source item ids of the outfit list rows. */
  combinationItemIds: readonly string[]
  previewAvatar: UserAvatar
  avatar: UserAvatar
  catalog: readonly AvatarCatalogItem[]
  inventoryVerified: boolean
  /** Online, verified, and no purchase running. */
  canSave: boolean
  combinationStateRef: RefObject<ShopCombinationState>
  setCombinationState: Dispatch<SetStateAction<ShopCombinationState>>
  dispatchCombination: (action: ShopCombinationAction) => readonly ShopCombinationCommand[]
  ownedAvatarItemIds: readonly string[]
  equipAndSaveItem: (item: AvatarCatalogItem) => Promise<AvatarEquipResult>
  copy: ShopCopy
}) {
  const {
    products,
    avatarProducts,
    combinationItemIds,
    previewAvatar,
    avatar,
    catalog,
    inventoryVerified,
    canSave,
    combinationStateRef,
    setCombinationState,
    dispatchCombination,
    ownedAvatarItemIds,
    equipAndSaveItem,
    copy
  } = input
  const [isRemoving, setIsRemoving] = useState(false)
  const isRemovingRef = useRef(false)
  const canSaveNow = canSave && !isRemoving

  const removeActionById = useMemo(() => {
    const actions = new Map<string, Exclude<ShopCardRemoveAction, "none">>()
    if (!inventoryVerified) return actions
    for (const product of products) {
      const action = getShopCardRemoveAction({
        item: product.avatarItem,
        draft: previewAvatar,
        equipped: avatar,
        owned: product.owned,
        canSave: canSaveNow
      })
      if (action !== "none") actions.set(product.id, action)
    }
    return actions
  }, [avatar, canSaveNow, inventoryVerified, previewAvatar, products])

  const handleRemoveProduct = useCallback(async (product: ShopCatalogItem): Promise<void> => {
    const item = product.avatarItem
    const state = combinationStateRef.current
    if (!item || state.phase !== "editing" || isRemovingRef.current) return
    const draft = shopCombinationDraftToAvatar(state.draft, avatar)
    const action = getShopCardRemoveAction({
      item,
      draft,
      equipped: avatar,
      owned: product.owned,
      canSave
    })
    const removal = applyShopCardRemoveAction({ action, item, draft, equipped: avatar, catalog })
    if (!removal) return
    if (!removal.savedAvatar) {
      dispatchCombination({ type: "replace_draft", draft: avatarToShopCombinationDraft(removal.draft) })
      publishSelectedShopPreviewWarmup([])
      hapticLight()
      return
    }
    const savedAvatar = removal.savedAvatar
    isRemovingRef.current = true
    setIsRemoving(true)
    try {
      const result = await equipAndSaveItem(item)
      if (!result.ok) {
        hapticError()
        showToast({ title: result.errorMessage, type: "warning" })
        return
      }
      // Rebase on the saved look; other tried-on pieces stay on the draft.
      const latest = combinationStateRef.current
      if (latest.phase !== "editing") return
      const latestDraft = applyShopCardRemoveAction({
        action,
        item,
        draft: shopCombinationDraftToAvatar(latest.draft, avatar),
        equipped: avatar,
        catalog
      })?.draft ?? removal.draft
      const rebasedState = createShopCombinationState({
        equipped: avatarToShopCombinationDraft(savedAvatar),
        previewDraft: avatarToShopCombinationDraft(latestDraft),
        ownedProductIds: [...new Set([...latest.ownedProductIds, ...ownedAvatarItemIds])],
        avatarRevision: latest.avatarRevision
      })
      combinationStateRef.current = rebasedState
      setCombinationState(rebasedState)
      hapticLight()
      showToast({ title: copy.removedFromAvatar(product.title), type: "success" })
    } finally {
      isRemovingRef.current = false
      setIsRemoving(false)
    }
  }, [
    avatar,
    canSave,
    catalog,
    combinationStateRef,
    copy,
    dispatchCombination,
    equipAndSaveItem,
    ownedAvatarItemIds,
    setCombinationState
  ])

  const onRemoveProduct = useCallback((product: ShopCatalogItem): void => {
    void handleRemoveProduct(product)
  }, [handleRemoveProduct])

  // The outfit list: a row whose piece is only tried on can leave the outfit
  // (its X or a swipe). It only edits the draft; the row plays the haptic.
  const removableCombinationIds = useMemo(() => {
    const ids = new Set<string>()
    if (!inventoryVerified) return ids
    for (const id of combinationItemIds) {
      const item = avatarProducts.find((product) => product.sourceItemId === id)?.avatarItem
      if (canRemoveShopCombinationItem({ item, draft: previewAvatar, equipped: avatar })) ids.add(id)
    }
    return ids
  }, [avatar, avatarProducts, combinationItemIds, inventoryVerified, previewAvatar])

  const removeCombinationItem = useCallback((sourceItemId: string): boolean => {
    const state = combinationStateRef.current
    if (state.phase !== "editing" || isRemovingRef.current) return false
    const item = avatarProducts.find((product) => product.sourceItemId === sourceItemId)?.avatarItem
    const draft = removeShopCombinationItem({
      item,
      draft: shopCombinationDraftToAvatar(state.draft, avatar),
      equipped: avatar,
      catalog
    })
    if (!draft) return false
    dispatchCombination({ type: "replace_draft", draft: avatarToShopCombinationDraft(draft) })
    publishSelectedShopPreviewWarmup([])
    return true
  }, [avatar, avatarProducts, catalog, combinationStateRef, dispatchCombination])

  return { removeActionById, onRemoveProduct, isRemoving, removableCombinationIds, removeCombinationItem }
}
