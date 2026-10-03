import { useMemo, useState } from "react"
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

interface RoomPreviewResolution {
  roomDecor: UserRoomDecor
  furnitureCatalog: FurnitureItem[]
  selectedRoomItem: FurnitureItem | undefined
  scene: ReturnType<typeof resolveRoomV2Scene>
}

/**
 * Derives everything the live preview shows: the selected product (masked
 * until inventory is verified), the draft avatar and its combination
 * summary, and the room scene with the selected furniture placed.
 */
export function useShopPreviewModel(input: {
  shopMode: ShopMode
  showShopContent: boolean
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
    showShopContent,
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
  const ownedProductIds = useMemo(
    () => [...new Set([...combinationState.ownedProductIds, ...ownedAvatarItemIds])],
    [combinationState.ownedProductIds, ownedAvatarItemIds]
  )
  const combinationSummary = useMemo(() => getShopCombinationSummary({
    draft: combinationState.draft,
    equipped: combinationState.equipped,
    ownedProductIds,
    products: avatarProducts
  }), [combinationState.draft, combinationState.equipped, ownedProductIds, avatarProducts])
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
  const combinationItems = useMemo(() => getShopCombinationItems({
    selectionOrder: previewSelectionOrder,
    draft: combinationState.draft,
    equipped: combinationState.equipped,
    ownedProductIds,
    products: avatarProducts
  }), [previewSelectionOrder, combinationState.draft, combinationState.equipped, ownedProductIds, avatarProducts])

  // Avatar selection and price/ownership changes do not change room geometry.
  const selectedRoomItem = shopMode === "home" && selectedProduct?.previewType === "room"
    ? selectedProduct.roomItem
    : undefined
  const showRoomPreview = shopMode === "home" && showShopContent
  const furnitureCatalog = roomFurnitureCatalog ?? ROOM_V2_FURNITURE_CATALOG
  const [lastRoomResolution, setLastRoomResolution] = useState<RoomPreviewResolution | null>(null)
  const roomResolution = useMemo(() => {
    if (!showRoomPreview) return null
    if (
      lastRoomResolution?.roomDecor === roomDecor &&
      lastRoomResolution.furnitureCatalog === furnitureCatalog &&
      lastRoomResolution.selectedRoomItem === selectedRoomItem
    ) {
      return lastRoomResolution
    }
    return {
      roomDecor,
      furnitureCatalog,
      selectedRoomItem,
      scene: resolveRoomV2Scene({
        roomShellCatalog: ROOM_V2_SHELL_CATALOG,
        furnitureCatalog,
        decor: selectedRoomItem
          ? createRoomPreviewDecor(selectedRoomItem, roomDecor, DEFAULT_ROOM_V2_SHELL_ID)
          : roomDecor,
        defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
      })
    }
  }, [showRoomPreview, furnitureCatalog, roomDecor, selectedRoomItem, lastRoomResolution])
  // Retain one resolved drawing across hidden modes. A guarded update to this
  // hook's own state is replayed before children commit; an abandoned render
  // cannot publish a shared cache entry. Ownership and actions remain live.
  if (roomResolution && roomResolution !== lastRoomResolution) {
    setLastRoomResolution(roomResolution)
  }
  const roomPreviewScene = roomResolution?.scene ?? null

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
