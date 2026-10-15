import type { CapabilityMap } from "@blumi/contracts"
import {
  ECONOMY_CATALOG,
  resolveR1PublishedEconomyCatalog
} from "@blumi/domain"
import { useMemo } from "react"
import type { UserAvatar } from "../../avatarV2/avatarV2.types"
import { isAvatarItemSavable } from "../../avatarV2/avatarDressWriteGate"
import type { BlumiInventorySnapshot } from "../../inventory/inventoryStore"
import type { FurnitureItem, UserRoomDecor } from "../../roomV2/roomV2.types"
import type { AppLocale } from "../../session/appLocale"
import { buildAvatarShopItems, buildRoomShopItems, type ShopCatalogItem } from "../shopCatalog"
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
  /** The server's capabilities: a one-piece dress is sold only when a look wearing it can be saved. */
  capabilities: Partial<CapabilityMap>
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
    capabilities,
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
  // Balance and unrelated room updates must not invalidate wearable cards.
  // Each builder consumes only the authoritative ownership for its section.
  // Inventory snapshots copy both arrays even for a balance-only update.
  // Local value keys keep equivalent copies from rebuilding the catalog;
  // these are presentation dependencies, never an ownership decision/cache.
  const avatarOwnershipKey = JSON.stringify(inventory.ownedAvatarItemIds)
  const roomOwnershipKey = JSON.stringify(inventory.ownedRoomItemIds)
  const avatarShopItems = useMemo(
    () =>
      buildAvatarShopItems({
        inventory: { ownedAvatarItemIds: JSON.parse(avatarOwnershipKey) as string[] },
        avatar,
        economyCatalog: productionEconomyCatalog,
        publishedItemIds,
        locale
      }),
    [
      avatar,
      avatarOwnershipKey,
      locale,
      productionEconomyCatalog,
      publishedItemIds
    ]
  )
  const roomShopItems = useMemo(
    () => buildRoomShopItems({
      inventory: { ownedRoomItemIds: JSON.parse(roomOwnershipKey) as string[] },
      roomDecor,
      economyCatalog: productionEconomyCatalog,
      publishedItemIds,
      roomFurnitureCatalog,
      qaOwnedRoomItemIds: qaOnlyOwnedRoomItemIds
    }),
    [
      roomOwnershipKey,
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
        avatarShopItems
          .filter(isDisplayableAvatarShopProduct)
          .filter((item) =>
            semanticOutfitMerchandisingEnabled || !item.avatarItem?.outfitKey
          )
          .filter((item) => !item.avatarItem || isAvatarItemSavable(item.avatarItem, capabilities))
      ),
    [semanticOutfitMerchandisingEnabled, avatarShopItems, capabilities]
  )
  const roomProducts = useMemo(
    () => sortRoomShopProducts(roomShopItems),
    [roomShopItems]
  )
  const avatarCatalog = useMemo(
    () => buildShopShelves("avatar", avatarProducts, locale),
    [avatarProducts, locale]
  )
  const homeCatalog = useMemo(
    () => buildShopShelves("home", roomProducts, locale),
    [roomProducts, locale]
  )
  const catalogsByMode = useMemo(
    () => ({ avatar: avatarCatalog, home: homeCatalog }),
    [avatarCatalog, homeCatalog]
  )
  const activeProducts = shopMode === "avatar" ? avatarProducts : roomProducts
  const activeCatalog = catalogsByMode[shopMode]
  const categoryOptions = activeCatalog.categories
  const activeCategoryId = useMemo(() => {
    if (categoryOptions.some((category) => category.id === selectedCategoryId)) {
      return selectedCategoryId
    }
    return categoryOptions[0]?.id ?? getDefaultShopCategoryId(shopMode)
  }, [categoryOptions, selectedCategoryId, shopMode])
  const filteredProducts = activeCatalog.productsByCategory.get(activeCategoryId) ?? EMPTY_PRODUCTS

  return {
    avatarProducts,
    roomProducts,
    activeProducts,
    categoryOptions,
    activeCategoryId,
    filteredProducts,
    catalogsByMode
  }
}

const EMPTY_PRODUCTS: ShopCatalogItem[] = []

function buildShopShelves(mode: ShopMode, products: ShopCatalogItem[], locale: AppLocale) {
  const categories = buildShopCategoryOptions(mode, products, locale)
  const productsByCategory = new Map(categories.map((category) => [
    category.id,
    filterProductsByCategory(products, mode, category.id)
  ]))
  return { categories, productsByCategory }
}
