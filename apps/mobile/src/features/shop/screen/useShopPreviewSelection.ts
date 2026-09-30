import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback
} from "react"
import type { ImageSourcePropType } from "react-native"
import type { AvatarCatalogItem, UserAvatar } from "../../avatarV2/avatarV2.types"
import { publishSelectedShopPreviewWarmup } from "../../performance/sceneAssetWarmupModel"
import { hapticLight } from "../../../ui/haptics"
import {
  avatarToShopCombinationDraft,
  isAvatarShopItemPreviewing,
  previewAvatarShopItem,
  restoreAvatarShopItemPreview,
  shopCombinationDraftToAvatar
} from "../shopAvatarDraft"
import { getShopPreviewAddedAssets } from "../shopAvatarPreviewAssets"
import type { ShopCatalogItem } from "../shopCatalog"
import type {
  ShopCombinationAction,
  ShopCombinationCommand,
  ShopCombinationState
} from "../shopCombinationState"
import type { ShopMode } from "../ShopNavigationControls"
import { getPrimaryProductCategoryId } from "./shopScreenModel"

/**
 * Selecting a product switches to its mode, tries the avatar item on the
 * draft while the combination is editable, and warms only the layers the
 * selection adds (or the furniture's full render source). Removing a
 * preview restores the equipped layer for that slot.
 */
export function useShopPreviewSelection(input: {
  selectedProduct: ShopCatalogItem | undefined
  avatar: UserAvatar
  catalog: AvatarCatalogItem[]
  shopMode: ShopMode
  combinationStateRef: RefObject<ShopCombinationState>
  dispatchCombination: (action: ShopCombinationAction) => readonly ShopCombinationCommand[]
  setShopMode: Dispatch<SetStateAction<ShopMode>>
  setSelectedCategoryId: Dispatch<SetStateAction<string>>
  setPreviewSelectionOrder: Dispatch<SetStateAction<string[]>>
  setSelectedId: Dispatch<SetStateAction<string>>
}) {
  const {
    selectedProduct,
    avatar,
    catalog,
    shopMode,
    combinationStateRef,
    dispatchCombination,
    setShopMode,
    setSelectedCategoryId,
    setPreviewSelectionOrder,
    setSelectedId
  } = input

  const handleRemoveAvatarPreview = useCallback((): void => {
    const item = selectedProduct?.avatarItem
    if (!item || combinationStateRef.current.phase !== "editing") return
    const currentPreview = shopCombinationDraftToAvatar(
      combinationStateRef.current.draft,
      avatar
    )
    if (!isAvatarShopItemPreviewing(currentPreview, item) ||
      isAvatarShopItemPreviewing(avatar, item)) return
    const restored = restoreAvatarShopItemPreview(
      currentPreview,
      avatar,
      item,
      catalog
    )
    dispatchCombination({
      type: "replace_draft",
      draft: avatarToShopCombinationDraft(restored)
    })
    publishSelectedShopPreviewWarmup([])
    hapticLight()
    // combinationStateRef is a stable ref object; listing it keeps identity unchanged.
  }, [avatar, catalog, combinationStateRef, dispatchCombination, selectedProduct])

  const handleSelectProduct = useCallback((product: ShopCatalogItem): void => {
    hapticLight()
    const selectedWarmupSources: ImageSourcePropType[] = []
    if (product.previewType === "avatar") {
      setShopMode("avatar")
      if (shopMode !== "avatar") {
        setSelectedCategoryId(getPrimaryProductCategoryId(product, "avatar"))
      }
      if (product.avatarItem && combinationStateRef.current.phase === "editing") {
        setPreviewSelectionOrder((current) => current.includes(product.sourceItemId)
          ? current : [...current, product.sourceItemId])
        const currentAvatar = shopCombinationDraftToAvatar(
          combinationStateRef.current.draft,
          avatar
        )
        selectedWarmupSources.push(
          ...getShopPreviewAddedAssets(currentAvatar, product.avatarItem).map((asset) => asset.source)
        )
        const nextAvatar = previewAvatarShopItem(
          currentAvatar,
          product.avatarItem,
          catalog
        )
        dispatchCombination({
          type: "replace_draft",
          draft: avatarToShopCombinationDraft(nextAvatar)
        })
      }
    }
    if (product.previewType === "room") {
      setShopMode("home")
      if (shopMode !== "home") {
        setSelectedCategoryId(getPrimaryProductCategoryId(product, "home"))
      }
      if (product.roomItem) selectedWarmupSources.push(product.roomItem.asset.source)
    }
    setSelectedId(product.id)
    publishSelectedShopPreviewWarmup(selectedWarmupSources)
    // The ref and state setters are stable; listing them keeps identity unchanged.
  }, [
    avatar,
    catalog,
    combinationStateRef,
    dispatchCombination,
    setPreviewSelectionOrder,
    setSelectedCategoryId,
    setSelectedId,
    setShopMode,
    shopMode
  ])

  return { handleRemoveAvatarPreview, handleSelectProduct }
}
