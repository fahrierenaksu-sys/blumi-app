import type Ionicons from "@expo/vector-icons/Ionicons"
import { MAIN_TAB_ROUTE_NAMES } from "../../../navigation/mainTabPager/mainTabPagerConfig"
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

/**
 * The Shop is a main tab, so its header has no back button. Only when a
 * detail screen (the wardrobe, the room editor) pushed the Shop above itself
 * does a back button return there. `routeNameBelow` is the stack route right
 * under the Shop, or undefined when the Shop is the bottom route.
 */
export function shouldShowShopBackButton(routeNameBelow: string | undefined): boolean {
  return routeNameBelow !== undefined &&
    !(MAIN_TAB_ROUTE_NAMES as readonly string[]).includes(routeNameBelow)
}

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

/**
 * Largest horizontal content offset (px) of the paged product shelf: its
 * last page. Pages are exactly one shelf width wide. A drag past the first
 * page (offset 0) or this offset is handed to the main-page pager.
 */
export function getShopShelfMaxScrollOffset(pageCount: number, shelfWidth: number): number {
  if (!Number.isFinite(pageCount) || !Number.isFinite(shelfWidth) || pageCount <= 1 || shelfWidth <= 0) return 0
  return (Math.floor(pageCount) - 1) * shelfWidth
}

/**
 * MICRO-3: a "See in Shop" link names a product by its canonical source item
 * id. Returns the avatar product and the category whose shelf shows it, or
 * null when the Shop does not list it (the link then just opens the Shop).
 */
export function resolveShopProductFocus(
  avatarProducts: readonly ShopCatalogItem[],
  sourceItemId: string | undefined
): { product: ShopCatalogItem; categoryId: string } | null {
  if (!sourceItemId) return null
  const product = avatarProducts.find((candidate) =>
    candidate.sourceItemId === sourceItemId && candidate.previewType === "avatar"
  )
  if (!product) return null
  return { product, categoryId: getPrimaryProductCategoryId(product, "avatar") }
}

const SHOP_SHELF_CARDS_PER_COLUMN = 2

/**
 * The product shelf's pages: columns of two cards, `columnsPerPage` columns
 * per page (two, or one in the Large Text layout). Catalog order is kept.
 */
export function buildShopShelfPages<T>(products: readonly T[], columnsPerPage: number): T[][][] {
  const perPage = Math.max(1, Math.floor(Number.isFinite(columnsPerPage) ? columnsPerPage : 1))
  const columns: T[][] = []
  for (let index = 0; index < products.length; index += SHOP_SHELF_CARDS_PER_COLUMN) {
    columns.push(products.slice(index, index + SHOP_SHELF_CARDS_PER_COLUMN))
  }
  const pages: T[][][] = []
  for (let index = 0; index < columns.length; index += perPage) {
    pages.push(columns.slice(index, index + perPage))
  }
  return pages
}

/**
 * The page the shelf shows at a horizontal offset: the nearest page, clamped
 * to the existing ones. Runs on the UI thread while the shelf scrolls, so the
 * counter moves with the finger instead of after the momentum ends.
 */
export function getShopShelfPageIndex(scrollOffset: number, shelfWidth: number, pageCount: number): number {
  "worklet"
  if (!(shelfWidth > 0) || !(pageCount > 1) || !Number.isFinite(scrollOffset)) return 0
  const index = Math.round(scrollOffset / shelfWidth)
  return Math.max(0, Math.min(Math.floor(pageCount) - 1, index))
}

/** "2/3"; an empty shelf reads "1/1". Runs on the UI thread for the counter. */
export function formatShopShelfCounter(pageIndex: number, pageCount: number): string {
  "worklet"
  return `${pageIndex + 1}/${getShopShelfCounterTotal(pageCount)}`
}

/**
 * The page a paged shelf will settle on when the finger lifts. A quick
 * release (a flick) pages one step in the direction the content last moved;
 * a slow release settles on the nearest page, like a paging scroll view.
 * `lastDelta` is the last offset change, so the direction never depends on a
 * platform's velocity sign; `releaseSpeed` is only compared by magnitude.
 */
export function getShopShelfReleasePageIndex(
  scrollOffset: number,
  shelfWidth: number,
  pageCount: number,
  lastDelta: number,
  releaseSpeed: number
): number {
  "worklet"
  if (!(shelfWidth > 0) || !(pageCount > 1) || !Number.isFinite(scrollOffset)) return 0
  const position = scrollOffset / shelfWidth
  // Points per millisecond; slower releases are not flicks.
  const flick = Number.isFinite(releaseSpeed) && Math.abs(releaseSpeed) >= 0.1 && lastDelta !== 0
  const index = flick
    ? lastDelta > 0 ? Math.ceil(position) : Math.floor(position)
    : Math.round(position)
  return Math.max(0, Math.min(Math.floor(pageCount) - 1, index))
}

/**
 * SHOP-4: the shelf counter's page, stepped by the shelf's scroll events on
 * the UI thread. While a finger drags, the page follows the nearest page;
 * when it lifts, the page jumps to where paging will settle, before the snap
 * animation runs; when the momentum ends, the settled offset has the last
 * word. Momentum frames never move the page, so it cannot flicker back.
 */
export interface ShopShelfPageTracker {
  /**
   * The shelf this page belongs to (mode and category). A tracker from
   * another shelf never shows its page: a new category reads page 1 on the
   * frame it appears, before the reset effect runs.
   */
  scope: string
  page: number
  dragging: boolean
  offset: number
  lastDelta: number
}

export type ShopShelfScrollStep =
  | { type: "begin_drag"; offset: number }
  | { type: "scroll"; offset: number }
  | { type: "end_drag"; offset: number; speed: number }
  | { type: "momentum_end"; offset: number }
  | { type: "jump"; page: number }

export function createShopShelfPageTracker(page: number, scope = ""): ShopShelfPageTracker {
  "worklet"
  return { scope, page, dragging: false, offset: 0, lastDelta: 0 }
}

/** The shelf scope a tracker belongs to: one per mode and category. */
export function getShopShelfScope(mode: string, categoryId: string): string {
  return `${mode}:${categoryId}`
}

/**
 * The page index the counter and page buttons show for the shelf `scope`
 * with `pageCount` pages: the tracker's page, clamped to existing pages, or
 * the first page when the tracker still belongs to another shelf.
 */
export function getShopShelfCounterPage(tracker: ShopShelfPageTracker, scope: string, pageCount: number): number {
  "worklet"
  if (tracker.scope !== scope || !Number.isFinite(tracker.page)) return 0
  const lastPage = Math.max(0, Math.floor(Number.isFinite(pageCount) ? pageCount : 1) - 1)
  return Math.max(0, Math.min(lastPage, Math.round(tracker.page)))
}

/** The page buttons for a shown page: each is disabled at its end. */
export function getShopShelfPageButtons(pageIndex: number, pageCount: number): {
  canShowPrevious: boolean
  canShowNext: boolean
} {
  const lastPage = getShopShelfCounterTotal(pageCount) - 1
  return { canShowPrevious: pageIndex > 0, canShowNext: pageIndex < lastPage }
}

/** Total pages the counter shows: "1/1" for an empty shelf. */
export function getShopShelfCounterTotal(pageCount: number): number {
  "worklet"
  return Number.isFinite(pageCount) ? Math.max(1, Math.floor(pageCount)) : 1
}

export function stepShopShelfPageTracker(
  tracker: ShopShelfPageTracker,
  step: ShopShelfScrollStep,
  shelfWidth: number,
  pageCount: number
): ShopShelfPageTracker {
  "worklet"
  if (step.type === "jump") {
    const lastPage = Math.max(0, Math.floor(pageCount) - 1)
    const page = Number.isFinite(step.page) ? Math.max(0, Math.min(lastPage, Math.round(step.page))) : 0
    return { scope: tracker.scope, page, dragging: false, offset: tracker.offset, lastDelta: 0 }
  }
  const delta = step.offset - tracker.offset
  const lastDelta = Number.isFinite(delta) && delta !== 0 ? delta : tracker.lastDelta
  if (step.type === "begin_drag") {
    return { scope: tracker.scope, page: tracker.page, dragging: true, offset: step.offset, lastDelta: 0 }
  }
  if (step.type === "scroll") {
    return {
      scope: tracker.scope,
      page: tracker.dragging ? getShopShelfPageIndex(step.offset, shelfWidth, pageCount) : tracker.page,
      dragging: tracker.dragging,
      offset: step.offset,
      lastDelta
    }
  }
  if (step.type === "end_drag") {
    return {
      scope: tracker.scope,
      page: getShopShelfReleasePageIndex(step.offset, shelfWidth, pageCount, lastDelta, step.speed),
      dragging: false,
      offset: step.offset,
      lastDelta
    }
  }
  return {
    scope: tracker.scope,
    page: getShopShelfPageIndex(step.offset, shelfWidth, pageCount),
    dragging: false,
    offset: step.offset,
    lastDelta
  }
}

/** The page that holds `productId`, or -1. */
export function findShopShelfPageIndex<T extends { id: string }>(
  pages: readonly (readonly (readonly T[])[])[],
  productId: string | undefined
): number {
  if (!productId) return -1
  return pages.findIndex((page) => page.some((column) => column.some((product) => product.id === productId)))
}
