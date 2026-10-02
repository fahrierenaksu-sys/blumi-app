import assert from "node:assert/strict"
import test from "node:test"
import type { FurnitureItem, UserRoomDecor } from "../../roomV2/roomV2.types"
import type { ShopCatalogItem } from "../shopCatalog"
import { resolveHorizontalScrollerDragOwner } from "../../../ui/mainTabPagerEdgeHandoffModel"
import {
  buildShopCategoryOptions,
  buildShopShelfPages,
  findShopShelfPageIndex,
  formatShopShelfCounter,
  getShopShelfPageIndex,
  resolveShopProductFocus,
  createRoomPreviewDecor,
  filterProductsByCategory,
  getAvatarPurchaseFailureTitle,
  getCompactCategoryLabel,
  getDefaultFurnitureRotation,
  getDefaultShopCategoryId,
  getPrimaryProductCategoryId,
  getShopShelfMaxScrollOffset,
  getShopSurfacePolicy,
  shouldShopShelfOwnHorizontalDrags,
  maskUnverifiedProductOwnership,
  sortRoomShopProducts
} from "./shopScreenModel"

function avatarProduct(
  id: string,
  type: string,
  overrides: Partial<ShopCatalogItem> = {},
  outfitKey?: string
): ShopCatalogItem {
  return {
    id: `avatar:${id}`,
    title: id,
    sourceItemId: id,
    sectionId: "avatar",
    previewType: "avatar",
    owned: false,
    priceCoins: 50,
    avatarItem: { id, type, outfitKey },
    ...overrides
  } as unknown as ShopCatalogItem
}

function roomProduct(
  id: string,
  category: FurnitureItem["category"] | undefined,
  overrides: Partial<ShopCatalogItem> = {}
): ShopCatalogItem {
  return {
    id: `room:${id}`,
    title: id,
    sourceItemId: id,
    sectionId: "room",
    previewType: "room",
    owned: false,
    priceCoins: 50,
    roomItem: category ? { id, category } : undefined,
    ...overrides
  } as unknown as ShopCatalogItem
}

test("surface policy keeps the production catalog visible but closed until a connected server snapshot", () => {
  const base = {
    requiresServerInventory: true,
    isConnected: true,
    isReady: false,
    hydrationStatus: "loading" as const,
    state: "loading" as const,
    productCount: 3
  }
  assert.deepEqual(getShopSurfacePolicy(base), {
    showShopContent: true,
    inventoryVerified: false,
    canPerformShopActions: false
  })
  assert.deepEqual(
    getShopSurfacePolicy({ ...base, isReady: true, hydrationStatus: "ready", state: "ready" }),
    { showShopContent: true, inventoryVerified: true, canPerformShopActions: true }
  )
  assert.deepEqual(
    getShopSurfacePolicy({ ...base, isConnected: false, isReady: true, hydrationStatus: "ready", state: "offline" }),
    { showShopContent: true, inventoryVerified: true, canPerformShopActions: false }
  )
  // A ready flag without a ready hydration is not an ownership proof.
  assert.equal(
    getShopSurfacePolicy({ ...base, isReady: true, hydrationStatus: "failed", state: "error" }).inventoryVerified,
    false
  )
  // An empty production catalog falls back to the presentation model.
  assert.equal(
    getShopSurfacePolicy({ ...base, productCount: 0, state: "empty" }).showShopContent,
    false
  )
})

test("surface policy treats local catalogs as verified and actionable while offline", () => {
  assert.deepEqual(
    getShopSurfacePolicy({
      requiresServerInventory: false,
      isConnected: false,
      isReady: false,
      hydrationStatus: "idle",
      state: "ready",
      productCount: 4
    }),
    { showShopContent: true, inventoryVerified: true, canPerformShopActions: true }
  )
})

test("unverified ownership masking is neutral and preserves identity", () => {
  const product = avatarProduct("top-1", "top", {
    owned: true,
    priceCoins: 80,
    actionType: "avatarEquip",
    stateLabel: "Owned",
    actionLabel: "Wear now"
  })
  assert.equal(maskUnverifiedProductOwnership(product, true, "Pending"), product)
  assert.equal(maskUnverifiedProductOwnership(undefined, false, "Pending"), undefined)
  const masked = maskUnverifiedProductOwnership(product, false, "Pending")
  assert.deepEqual(masked, {
    ...product,
    owned: false,
    priceCoins: null,
    actionType: "disabled",
    stateLabel: "Pending",
    actionLabel: "Pending",
    disabledReason: "Pending"
  })
  assert.equal(masked?.avatarItem, product.avatarItem)
})

test("default categories and compact rail labels are locale-stable", () => {
  assert.equal(getDefaultShopCategoryId("avatar"), "top")
  assert.equal(getDefaultShopCategoryId("home"), "all")
  const shoes = { id: "shoes", label: "Ayakkabılar", count: 1, icon: "walk" as const }
  const accessory = { id: "accessory", label: "Aksesuarlar", count: 1, icon: "glasses" as const }
  assert.equal(getCompactCategoryLabel(shoes, "tr"), "Ayakkabı")
  assert.equal(getCompactCategoryLabel(accessory, "tr"), "Aksesuar")
  assert.equal(getCompactCategoryLabel({ ...shoes, label: "Shoes" }, "en"), "Shoes")
  assert.equal(getCompactCategoryLabel({ ...shoes, id: "top", label: "Üstler" }, "tr"), "Üstler")
})

test("purchase failure titles come from the localized copy", () => {
  assert.equal(getAvatarPurchaseFailureTitle("not_enough_coins", "en"), "Not enough coins")
  assert.equal(getAvatarPurchaseFailureTitle(undefined, "en"), "The purchase could not be completed")
  assert.notEqual(getAvatarPurchaseFailureTitle("not_enough_coins", "tr"), "Not enough coins")
})

test("avatar categories follow the Shop order, drop empty ones and count outfits as dresses", () => {
  const products = [
    avatarProduct("shoe-1", "shoes"),
    avatarProduct("top-1", "top"),
    avatarProduct("top-2", "top"),
    avatarProduct("outfit-1", "top", {}, "outfit-1"),
    avatarProduct("hair-1", "hair")
  ]
  assert.deepEqual(
    buildShopCategoryOptions("avatar", products, "en").map(({ id, count }) => ({ id, count })),
    [
      { id: "top", count: 2 },
      { id: "dress", count: 1 },
      { id: "shoes", count: 1 },
      { id: "hair", count: 1 }
    ]
  )
  const english = buildShopCategoryOptions("avatar", products, "en")
  const turkish = buildShopCategoryOptions("avatar", products, "tr")
  assert.ok(english.every((option) => option.label.trim().length > 0))
  assert.notEqual(turkish[0].label, english[0].label)
})

test("home categories lead with All and Owned and include only populated furniture groups", () => {
  const products = [
    roomProduct("lamp", "lighting", { owned: true }),
    roomProduct("sofa", "seating"),
    roomProduct("poster", "wallDecor")
  ]
  assert.deepEqual(
    buildShopCategoryOptions("home", products, "en").map(({ id, count }) => ({ id, count })),
    [
      { id: "all", count: 3 },
      { id: "owned", count: 1 },
      { id: "seating", count: 1 },
      { id: "lighting", count: 1 },
      { id: "wallDecor", count: 1 }
    ]
  )
  assert.deepEqual(buildShopCategoryOptions("home", [], "en"), [])
})

test("category filtering delegates avatar rules and keeps home identity for All", () => {
  const room = [roomProduct("sofa", "seating", { owned: true }), roomProduct("rug", "rug")]
  assert.equal(filterProductsByCategory(room, "home", "all"), room)
  assert.deepEqual(filterProductsByCategory(room, "home", "owned"), [room[0]])
  assert.deepEqual(filterProductsByCategory(room, "home", "rug"), [room[1]])
  assert.deepEqual(filterProductsByCategory(room, "home", "plant"), [])
  const avatar = [avatarProduct("top-1", "top"), avatarProduct("outfit", "top", {}, "o")]
  assert.deepEqual(filterProductsByCategory(avatar, "avatar", "top"), [avatar[0]])
  assert.deepEqual(filterProductsByCategory(avatar, "avatar", "dress"), [avatar[1]])
  assert.deepEqual(filterProductsByCategory(avatar, "avatar", "all"), [])
})

test("primary category jumps to the product's own group or the mode default", () => {
  assert.equal(getPrimaryProductCategoryId(avatarProduct("shoe", "shoes"), "avatar"), "shoes")
  assert.equal(getPrimaryProductCategoryId(avatarProduct("o", "top", {}, "o"), "avatar"), "dress")
  assert.equal(getPrimaryProductCategoryId(avatarProduct("eyes", "eyes"), "avatar"), "top")
  assert.equal(getPrimaryProductCategoryId(roomProduct("lamp", "lighting"), "home"), "lighting")
  assert.equal(getPrimaryProductCategoryId(roomProduct("none", undefined), "home"), "all")
})

test("room products sort by furniture group then title", () => {
  const sorted = sortRoomShopProducts([
    roomProduct("B plant", "plant"),
    roomProduct("Z seat", "seating"),
    roomProduct("A seat", "seating"),
    roomProduct("unknown", undefined),
    roomProduct("lamp", "lighting")
  ])
  assert.deepEqual(sorted.map((item) => item.title), ["A seat", "Z seat", "lamp", "B plant", "unknown"])
})

test("room preview decor replaces the previous preview item and keeps the base decor", () => {
  const baseDecor = {
    schemaVersion: 3,
    roomShellId: "",
    placedItems: [
      { instanceId: "bed-1", itemId: "bed", x: 0.2, y: 0.8, rotation: "front" },
      { instanceId: "shop-preview-item", itemId: "old", x: 0.5, y: 0.5, rotation: "front" }
    ]
  } as unknown as UserRoomDecor
  const lamp = { id: "lamp", category: "lighting" } as FurnitureItem
  const decor = createRoomPreviewDecor(lamp, baseDecor, "default-shell")
  assert.equal(decor.roomShellId, "default-shell")
  assert.equal(decor.placedItems.length, 2)
  assert.equal(decor.placedItems[0], baseDecor.placedItems[0])
  const preview = decor.placedItems[1]
  assert.equal(preview.instanceId, "shop-preview-item")
  assert.equal(preview.itemId, "lamp")
  assert.equal(preview.rotation, "front")
  assert.ok(preview.x >= 0 && preview.x <= 1 && preview.y >= 0 && preview.y <= 1)
  const poster = { id: "poster", category: "wallDecor", assetsByRotation: { left: {}, right: {} } } as unknown as FurnitureItem
  const wallDecor = createRoomPreviewDecor(poster, { roomShellId: "shell-a", placedItems: [] }, "default-shell")
  assert.equal(wallDecor.roomShellId, "shell-a")
  assert.equal(wallDecor.placedItems.length, 1)
  assert.equal(wallDecor.placedItems[0].itemId, "poster")
  assert.equal(wallDecor.placedItems[0].rotation, "left", "a wall item uses its first authored rotation")
})

test("default furniture rotation prefers front, then the first authored rotation", () => {
  assert.equal(getDefaultFurnitureRotation({} as FurnitureItem), "front")
  assert.equal(getDefaultFurnitureRotation({ assetsByRotation: {} } as unknown as FurnitureItem), "front")
  assert.equal(getDefaultFurnitureRotation({ assetsByRotation: { right: {}, front: {} } } as unknown as FurnitureItem), "front")
  assert.equal(getDefaultFurnitureRotation({ assetsByRotation: { back: {}, left: {} } } as unknown as FurnitureItem), "back")
})

test("the product shelf owns horizontal drags only when it has another page to show", () => {
  // 1/1: nothing to scroll, so a horizontal drag there switches the main page.
  assert.equal(shouldShopShelfOwnHorizontalDrags(0), false, "empty category")
  assert.equal(shouldShopShelfOwnHorizontalDrags(1), false, "single page")
  assert.equal(shouldShopShelfOwnHorizontalDrags(2), true)
  assert.equal(shouldShopShelfOwnHorizontalDrags(12), true)
  assert.equal(shouldShopShelfOwnHorizontalDrags(Number.NaN), false)
})

test("the product shelf hands a drag past its first or last page to the main pager", () => {
  const shelfWidth = 212
  const maxScrollOffset = getShopShelfMaxScrollOffset(3, shelfWidth)
  assert.equal(maxScrollOffset, 2 * shelfWidth)
  assert.equal(getShopShelfMaxScrollOffset(1, shelfWidth), 0, "1/1")
  assert.equal(getShopShelfMaxScrollOffset(0, shelfWidth), 0, "empty category")
  assert.equal(getShopShelfMaxScrollOffset(Number.NaN, shelfWidth), 0)
  assert.equal(getShopShelfMaxScrollOffset(3, Number.NaN), 0)
  const drag = (dx: number, page: number) => resolveHorizontalScrollerDragOwner({
    dx,
    dy: 0,
    scrollOffset: page * shelfWidth,
    maxScrollOffset
  })
  // 1/3: dragging right (towards a previous page that does not exist) moves
  // the main page to Chats; dragging left shows 2/3.
  assert.equal(drag(20, 0), "release")
  assert.equal(drag(-20, 0), "scroller")
  // 2/3: the shelf keeps both directions.
  assert.equal(drag(20, 1), "scroller")
  assert.equal(drag(-20, 1), "scroller")
  // 3/3: dragging left (past the last page) goes to the main pager, which
  // rubber-bands because Shop is the last main page.
  assert.equal(drag(-20, 2), "release")
  assert.equal(drag(20, 2), "scroller")
})

test("shelf pages hold columns of two cards, two columns per page or one under Large Text", () => {
  const items = Array.from({ length: 9 }, (_, index) => ({ id: `p${index}` }))
  const pages = buildShopShelfPages(items, 2)
  assert.equal(pages.length, 3)
  assert.deepEqual(pages[0].map((column) => column.map((item) => item.id)), [["p0", "p1"], ["p2", "p3"]])
  assert.deepEqual(pages[2].map((column) => column.map((item) => item.id)), [["p8"]])
  assert.equal(buildShopShelfPages(items, 1).length, 5, "Large Text: one column per page")
  assert.deepEqual(buildShopShelfPages([], 2), [])
  assert.equal(buildShopShelfPages(items, 0).length, 5, "never fewer than one column per page")
})

test("the shelf counter follows the live offset and clamps to existing pages", () => {
  const width = 212
  assert.equal(getShopShelfPageIndex(0, width, 3), 0)
  assert.equal(getShopShelfPageIndex(width * 0.49, width, 3), 0, "still closer to the first page")
  assert.equal(getShopShelfPageIndex(width * 0.51, width, 3), 1, "past the middle the counter moves")
  assert.equal(getShopShelfPageIndex(width * 2, width, 3), 2)
  assert.equal(getShopShelfPageIndex(width * 5, width, 3), 2, "overscroll stays on the last page")
  assert.equal(getShopShelfPageIndex(-40, width, 3), 0)
  assert.equal(getShopShelfPageIndex(width, width, 1), 0, "1/1")
  assert.equal(getShopShelfPageIndex(Number.NaN, width, 3), 0)
  assert.equal(getShopShelfPageIndex(width, 0, 3), 0)
  assert.equal(formatShopShelfCounter(1, 3), "2/3")
  assert.equal(formatShopShelfCounter(0, 0), "1/1", "an empty shelf still reads 1/1")
})

test("the page holding a product is found for deep links and re-selection", () => {
  const items = Array.from({ length: 7 }, (_, index) => ({ id: `p${index}` }))
  const pages = buildShopShelfPages(items, 2)
  assert.equal(findShopShelfPageIndex(pages, "p0"), 0)
  assert.equal(findShopShelfPageIndex(pages, "p5"), 1)
  assert.equal(findShopShelfPageIndex(pages, "p6"), 1)
  assert.equal(findShopShelfPageIndex(buildShopShelfPages(items, 1), "p6"), 3)
  assert.equal(findShopShelfPageIndex(pages, "missing"), -1)
  assert.equal(findShopShelfPageIndex(pages, undefined), -1)
})

test("a See-in-Shop link focuses the product on its own category shelf by canonical id", () => {
  const hair = avatarProduct("hair-mocha", "hair")
  const top = avatarProduct("top-blossom", "top")
  const focus = resolveShopProductFocus([top, hair], "hair-mocha")
  assert.equal(focus?.product, hair)
  assert.equal(focus?.categoryId, getPrimaryProductCategoryId(hair, "avatar"))
  assert.equal(resolveShopProductFocus([top, hair], "unlisted"), null)
  assert.equal(resolveShopProductFocus([top, hair], undefined), null)
})

test("T-2: every shelf size hands drags past its ends to the main pager, from the real page model", () => {
  const width = 212
  const drag = (pageCount: number, page: number, dx: number) => resolveHorizontalScrollerDragOwner({
    dx,
    dy: 0,
    scrollOffset: page * width,
    maxScrollOffset: getShopShelfMaxScrollOffset(pageCount, width)
  })
  for (const productCount of [0, 1, 3, 4, 5, 8, 9, 16, 17]) {
    for (const columnsPerPage of [1, 2]) {
      const products = Array.from({ length: productCount }, (_, id) => ({ id: `${id}` }))
      const pageCount = buildShopShelfPages(products, columnsPerPage).length
      const owns = shouldShopShelfOwnHorizontalDrags(pageCount)
      assert.equal(owns, pageCount > 1, `${productCount} products / ${columnsPerPage} columns`)
      if (!owns) {
        // 1/1 (or empty): the gestures are off and the model releases both directions.
        assert.equal(drag(pageCount, 0, 20), "release")
        assert.equal(drag(pageCount, 0, -20), "release")
        continue
      }
      const last = pageCount - 1
      assert.equal(drag(pageCount, 0, 20), "release", "first page, towards the previous tab")
      assert.equal(drag(pageCount, 0, -20), "scroller")
      assert.equal(drag(pageCount, last, -20), "release", "last page, towards the next tab")
      assert.equal(drag(pageCount, last, 20), "scroller")
      for (let page = 1; page < last; page += 1) {
        assert.equal(drag(pageCount, page, 20), "scroller")
        assert.equal(drag(pageCount, page, -20), "scroller")
      }
    }
  }
})
