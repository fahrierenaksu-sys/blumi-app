import {
  ECONOMY_CATALOG,
  resolveR1PublishedEconomyCatalog
} from "@blumi/domain"
import { useMemo } from "react"
import type { UserAvatar } from "../../avatarV2/avatarV2.types"
import type { BlumiInventorySnapshot } from "../../inventory/inventoryStore"
import type { FurnitureItem, UserRoomDecor } from "../../roomV2/roomV2.types"
import type { AppLocale } from "../../session/appLocale"
import { buildShopCatalogItems } from "../shopCatalog"
import type { ShopMode } from "../ShopNavigationControls"
import {
  isDisplayableAvatarShopProduct,
  sortAvatarShopProducts
} from "./shopAvatarProductOrder"
import {
  buildShopCategoryOptions,
  filterProductsByCategory,
  getDefaultShopCategoryId,
  sortRoomShopProducts
} from "./shopScreenModel"

/**
 * Builds the visible Shop catalog from the published economy catalog and the
 * current inventory snapshot, then derives the active mode's categories and
 * the products on the selected shelf. Ownership shown here is presentation
 * only; purchases remain server-authoritative.
 */
export function useShopCatalogProducts(input: {
  enforcePublishedCatalog: boolean
  inventory: BlumiInventorySnapshot
  avatar: UserAvatar
  roomDecor: UserRoomDecor
  roomFurnitureCatalog: FurnitureItem[] | undefined
  qaOnlyOwnedRoomItemIds: readonly string[] | undefined
  semanticOutfitMerchandisingEnabled: boolean
  shopMode: ShopMode
  selectedCategoryId: string
  locale: AppLocale
}) {
  const {
    enforcePublishedCatalog,
    inventory,
    avatar,
    roomDecor,
    roomFurnitureCatalog,
    qaOnlyOwnedRoomItemIds,
    semanticOutfitMerchandisingEnabled,
    shopMode,
    selectedCategoryId,
    locale
  } = input
  const productionEconomyCatalog = useMemo(
    () => enforcePublishedCatalog
      ? resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG)
      : undefined,
    [enforcePublishedCatalog]
  )
  const publishedItemIds = useMemo(
    () => productionEconomyCatalog?.map((item) => item.itemId),
    [productionEconomyCatalog]
  )
  const shopItems = useMemo(
    () =>
      buildShopCatalogItems({
        inventory,
        avatar,
        roomDecor,
        economyCatalog: productionEconomyCatalog,
        publishedItemIds,
        roomFurnitureCatalog,
        qaOwnedRoomItemIds: qaOnlyOwnedRoomItemIds
      }),
    [
      avatar,
      inventory,
      productionEconomyCatalog,
      qaOnlyOwnedRoomItemIds,
      roomFurnitureCatalog,
      publishedItemIds,
      roomDecor
    ]
  )

  const avatarProducts = useMemo(
    () =>
      sortAvatarShopProducts(
        shopItems
          .filter((item) => item.sectionId === "avatar")
          .filter(isDisplayableAvatarShopProduct)
          .filter((item) =>
            semanticOutfitMerchandisingEnabled || !item.avatarItem?.outfitKey
          )
      ),
    [semanticOutfitMerchandisingEnabled, shopItems]
  )
  const roomProducts = useMemo(
    () => sortRoomShopProducts(shopItems.filter((item) => item.sectionId === "room")),
    [shopItems]
  )
  const activeProducts = useMemo(() => {
    if (shopMode === "avatar") return avatarProducts
    return roomProducts
  }, [avatarProducts, roomProducts, shopMode])
  const categoryOptions = useMemo(
    () => buildShopCategoryOptions(shopMode, activeProducts, locale),
    [activeProducts, locale, shopMode]
  )
  const activeCategoryId = useMemo(() => {
    if (categoryOptions.some((category) => category.id === selectedCategoryId)) {
      return selectedCategoryId
    }
    return categoryOptions[0]?.id ?? getDefaultShopCategoryId(shopMode)
  }, [categoryOptions, selectedCategoryId, shopMode])
  const filteredProducts = useMemo(
    () => filterProductsByCategory(activeProducts, shopMode, activeCategoryId),
    [activeCategoryId, activeProducts, shopMode]
  )

  return {
    avatarProducts,
    roomProducts,
    activeProducts,
    categoryOptions,
    activeCategoryId,
    filteredProducts
  }
}
