import { useMemo } from "react"
import type { UserAvatar } from "../../avatarV2/avatarV2.types"
import {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../../roomV2/roomV2Catalog"
import { resolveRoomV2Scene } from "../../roomV2/roomV2Selectors"
import type { FurnitureItem, UserRoomDecor } from "../../roomV2/roomV2.types"
import { useSelectionTransition } from "../../../ui/animations"
import {
  hasAvatarDraftChanges,
  isAvatarShopItemPreviewing,
  shopCombinationDraftToAvatar
} from "../shopAvatarDraft"
import type { ShopCatalogItem } from "../shopCatalog"
import { getShopCombinationItems, getShopCombinationSummary } from "../shopCombinationSummary"
import type { ShopCombinationState } from "../shopCombinationState"
import type { ShopMode } from "../ShopNavigationControls"
import { resolveShopSelectedProduct } from "../shopSelectionModel"
import {
  createRoomPreviewDecor,
  maskUnverifiedProductOwnership
} from "./shopScreenModel"

/**
 * Derives everything the live preview shows: the selected product (masked
 * until inventory is verified), the draft avatar and its combination
 * summary, and the room scene with the selected furniture placed.
 */
export function useShopPreviewModel(input: {
  shopMode: ShopMode
  selectedId: string
  filteredProducts: ShopCatalogItem[]
  activeProducts: ShopCatalogItem[]
  avatarProducts: ShopCatalogItem[]
  inventoryVerified: boolean
  inventoryGateLabel: string
  combinationState: ShopCombinationState
  previewSelectionOrder: string[]
  avatar: UserAvatar
  ownedAvatarItemIds: readonly string[]
  roomDecor: UserRoomDecor
  roomFurnitureCatalog: FurnitureItem[] | undefined
}) {
  const {
    shopMode,
    selectedId,
    filteredProducts,
    activeProducts,
    avatarProducts,
    inventoryVerified,
    inventoryGateLabel,
    combinationState,
    previewSelectionOrder,
    avatar,
    ownedAvatarItemIds,
    roomDecor,
    roomFurnitureCatalog
  } = input
  const selectedProduct = useMemo(
    () => resolveShopSelectedProduct({
      mode: shopMode,
      selectedId,
      filteredProducts,
      activeProducts
    }),
    [activeProducts, filteredProducts, selectedId, shopMode]
  )
  const presentationProduct = useMemo(
    () => maskUnverifiedProductOwnership(
      selectedProduct,
      inventoryVerified,
      inventoryGateLabel
    ),
    [inventoryGateLabel, inventoryVerified, selectedProduct]
  )
  const previewTransition = useSelectionTransition(selectedProduct?.id, {
    fromScale: 0.99,
    translateY: 5
  })

  const previewAvatar = useMemo(
    () => shopCombinationDraftToAvatar(
      combinationState.draft,
      avatar
    ),
    [avatar, combinationState.draft]
  )
  const hasCombinationChanges = useMemo(
    () => hasAvatarDraftChanges(avatar, previewAvatar),
    [avatar, previewAvatar]
  )
  const combinationSummary = useMemo(() => getShopCombinationSummary({
    draft: combinationState.draft,
    equipped: combinationState.equipped,
    ownedProductIds: [...new Set([...combinationState.ownedProductIds, ...ownedAvatarItemIds])],
    products: avatarProducts
  }), [combinationState.draft, combinationState.equipped, combinationState.ownedProductIds, ownedAvatarItemIds, avatarProducts])
  const canRemoveAvatarPreview = useMemo(
    () => Boolean(
      selectedProduct?.avatarItem &&
      isAvatarShopItemPreviewing(
        previewAvatar,
        selectedProduct.avatarItem
      ) &&
      !isAvatarShopItemPreviewing(avatar, selectedProduct.avatarItem) &&
      hasAvatarDraftChanges(avatar, previewAvatar)
    ),
    [avatar, previewAvatar, selectedProduct]
  )
  const combinationItems = getShopCombinationItems({
    selectionOrder: previewSelectionOrder,
    draft: combinationState.draft,
    equipped: combinationState.equipped,
    ownedProductIds: [...new Set([...combinationState.ownedProductIds, ...ownedAvatarItemIds])],
    products: avatarProducts
  })

  const roomPreviewScene = useMemo(() => {
    const selectedRoomItem =
      selectedProduct?.previewType === "room"
        ? selectedProduct.roomItem
        : undefined
    if (!selectedRoomItem) {
      return resolveRoomV2Scene({
        roomShellCatalog: ROOM_V2_SHELL_CATALOG,
        furnitureCatalog: roomFurnitureCatalog ?? ROOM_V2_FURNITURE_CATALOG,
        decor: roomDecor,
        defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
      })
    }
    return resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      furnitureCatalog: roomFurnitureCatalog ?? ROOM_V2_FURNITURE_CATALOG,
      decor: createRoomPreviewDecor(selectedRoomItem, roomDecor, DEFAULT_ROOM_V2_SHELL_ID),
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    })
  }, [roomFurnitureCatalog, roomDecor, selectedProduct])

  return {
    selectedProduct,
    presentationProduct,
    previewTransition,
    previewAvatar,
    hasCombinationChanges,
    combinationSummary,
    canRemoveAvatarPreview,
    combinationItems,
    roomPreviewScene
  }
}
