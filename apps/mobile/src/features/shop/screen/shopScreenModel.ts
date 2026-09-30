import type Ionicons from "@expo/vector-icons/Ionicons"
import { getAppLocale, type AppLocale } from "../../session/appLocale"
import type {
  FurnitureCategory,
  FurnitureItem,
  RoomFurnitureRotation,
  UserRoomDecor
} from "../../roomV2/roomV2.types"
import type { ShopCatalogItem } from "../shopCatalog"
import {
  SHOP_AVATAR_CATEGORY_ORDER,
  filterAvatarShopProductsByCategory,
  getAvatarShopCategoryId
} from "../shopAvatarCategoryModel"
import { getShopCopy } from "../shopCopy"
import type { ShopMode } from "../ShopNavigationControls"
import {
  shouldRenderShopContent,
  type ShopPresentationState
} from "../shopPresentationModel"

export type ShopCategoryOption = {
  id: string
  label: string
  count: number
  icon: keyof typeof Ionicons.glyphMap
}

export function getShopSurfacePolicy(input: {
  requiresServerInventory: boolean
  isConnected: boolean
  isReady: boolean
  hydrationStatus: "idle" | "loading" | "ready" | "failed"
  state: ShopPresentationState
  productCount: number
}): {
  showShopContent: boolean
  inventoryVerified: boolean
  canPerformShopActions: boolean
} {
  const inventoryVerified = !input.requiresServerInventory || (
    input.isReady && input.hydrationStatus === "ready"
  )
  return {
    showShopContent: shouldRenderShopContent({
      state: input.state,
      isReady: input.isReady,
      productCount: input.productCount
    }) || (input.requiresServerInventory && input.productCount > 0),
    inventoryVerified,
    canPerformShopActions: inventoryVerified &&
      (!input.requiresServerInventory || input.isConnected)
  }
}

export function maskUnverifiedProductOwnership(
  product: ShopCatalogItem | undefined,
  inventoryVerified: boolean,
  pendingLabel: string
): ShopCatalogItem | undefined {
  if (!product || inventoryVerified) return product
  return {
    ...product,
    owned: false,
    priceCoins: null,
    actionType: "disabled",
    stateLabel: pendingLabel,
    actionLabel: pendingLabel,
    disabledReason: pendingLabel
  }
}

export function getCompactCategoryLabel(category: ShopCategoryOption, locale: AppLocale): string {
  if (locale === "tr" && category.id === "shoes") return "Ayakkabı"
  if (locale === "tr" && category.id === "accessory") return "Aksesuar"
  return category.label
}

export function getAvatarIcon(
  type: NonNullable<ShopCatalogItem["avatarItem"]>["type"]
): keyof typeof Ionicons.glyphMap {
  if (type === "eyes") return "eye"
  if (type === "nose") return "ellipse"
  if (type === "mouth") return "chatbubble-ellipses"
  if (type === "hair") return "sparkles"
  if (type === "top") return "shirt"
  if (type === "bottom") return "layers"
  if (type === "shoes") return "walk"
  if (type === "accessory") return "glasses"
  return "person"
}

export function getAvatarPurchaseFailureTitle(
  reason: string | undefined,
  locale: AppLocale
): string {
  return getShopCopy(locale).combination.purchaseFailure(reason)
}

/**
 * `defaultRoomShellId` is injected (the screen passes
 * `DEFAULT_ROOM_V2_SHELL_ID`) so this model stays free of Room asset imports.
 */
export function createRoomPreviewDecor(
  item: FurnitureItem,
  baseDecor: UserRoomDecor,
  defaultRoomShellId: string
): UserRoomDecor {
  const placedItems = baseDecor.placedItems.filter(
    (placedItem) => placedItem.instanceId !== "shop-preview-item"
  )
  return {
    roomShellId: baseDecor.roomShellId || defaultRoomShellId,
    placedItems: [
      ...placedItems,
      {
        instanceId: "shop-preview-item",
        itemId: item.id,
        x: item.category === "wallDecor" ? 0.28 : 0.54,
        y: item.category === "wallDecor" ? 0.5 : 0.76,
        rotation: getDefaultFurnitureRotation(item)
      }
    ]
  }
}

export function getDefaultFurnitureRotation(item: FurnitureItem): RoomFurnitureRotation {
  const rotations = item.assetsByRotation
    ? (Object.keys(item.assetsByRotation) as RoomFurnitureRotation[])
    : []
  if (rotations.length === 0 || rotations.includes("front")) return "front"
  return rotations[0]
}

export function getDefaultShopCategoryId(mode: ShopMode): string {
  if (mode === "avatar") return "top"
  return "all"
}

export function buildShopCategoryOptions(
  mode: ShopMode,
  products: ShopCatalogItem[],
  locale = getAppLocale()
): ShopCategoryOption[] {
  const categoryCopy = getShopCopy(locale).categories
  const avatarCategoryIcons: Record<(typeof SHOP_AVATAR_CATEGORY_ORDER)[number], keyof typeof Ionicons.glyphMap> = {
    top: "shirt",
    bottom: "layers",
    dress: "sparkles",
    outerwear: "snow",
    shoes: "walk",
    accessory: "glasses",
    hair: "color-wand"
  }
  const candidates: Omit<ShopCategoryOption, "count">[] =
    mode === "avatar"
      ? SHOP_AVATAR_CATEGORY_ORDER.map((id) => ({
          id,
          label: categoryCopy[id],
          icon: avatarCategoryIcons[id]
        }))
      : [
          { id: "all", label: categoryCopy.all, icon: "grid" },
          { id: "owned", label: categoryCopy.owned, icon: "checkmark-circle" },
          { id: "seating", label: categoryCopy.seating, icon: "bed" },
          { id: "table", label: categoryCopy.table, icon: "ellipse" },
          { id: "lighting", label: categoryCopy.lighting, icon: "bulb" },
          { id: "rug", label: categoryCopy.rug, icon: "layers" },
          { id: "wallDecor", label: categoryCopy.wallDecor, icon: "image" },
          { id: "plant", label: categoryCopy.plant, icon: "leaf" },
          { id: "misc", label: categoryCopy.misc, icon: "sparkles" }
        ]

  return candidates
    .map((candidate) => ({
      ...candidate,
      count: filterProductsByCategory(products, mode, candidate.id).length
    }))
    .filter((category) => category.count > 0)
}

export function filterProductsByCategory(
  products: ShopCatalogItem[],
  mode: ShopMode,
  categoryId: string
): ShopCatalogItem[] {
  if (mode === "avatar") {
    return filterAvatarShopProductsByCategory(
      products,
      categoryId
    )
  }

  if (categoryId === "all") return products
  if (categoryId === "owned") {
    return products.filter((product) => product.owned)
  }

  return products.filter(
    (product) => product.roomItem?.category === (categoryId as FurnitureCategory)
  )
}

export function getPrimaryProductCategoryId(
  product: ShopCatalogItem,
  mode: ShopMode
): string {
  if (mode === "avatar") {
    return getAvatarShopCategoryId(product) ?? getDefaultShopCategoryId(mode)
  }

  return product.roomItem?.category ?? getDefaultShopCategoryId(mode)
}

const HOME_CATEGORY_SORT_ORDER: Record<FurnitureCategory, number> = {
  seating: 0,
  table: 1,
  lighting: 2,
  rug: 3,
  wallDecor: 4,
  plant: 5,
  misc: 6
}

export function sortRoomShopProducts(products: ShopCatalogItem[]): ShopCatalogItem[] {
  return [...products].sort((left, right) => {
    const leftCategory = left.roomItem?.category ?? "misc"
    const rightCategory = right.roomItem?.category ?? "misc"
    const categoryDelta =
      HOME_CATEGORY_SORT_ORDER[leftCategory] - HOME_CATEGORY_SORT_ORDER[rightCategory]
    if (categoryDelta !== 0) return categoryDelta
    return left.title.localeCompare(right.title)
  })
}

/**
 * Whether the paged product shelf owns horizontal drags that start on it.
 * With a single page (the 1/1 counter) there is nothing to scroll, so the
 * drag goes to the main-page pager instead of being swallowed by the shelf.
 */
export function shouldShopShelfOwnHorizontalDrags(pageCount: number): boolean {
  return pageCount > 1
}
