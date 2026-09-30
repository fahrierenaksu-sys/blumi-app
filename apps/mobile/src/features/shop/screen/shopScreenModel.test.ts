import assert from "node:assert/strict"
import test from "node:test"
import type { FurnitureItem, UserRoomDecor } from "../../roomV2/roomV2.types"
import type { ShopCatalogItem } from "../shopCatalog"
import {
  buildShopCategoryOptions,
  createRoomPreviewDecor,
  filterProductsByCategory,
  getAvatarIcon,
  getAvatarPurchaseFailureTitle,
  getCompactCategoryLabel,
  getDefaultFurnitureRotation,
  getDefaultShopCategoryId,
  getPrimaryProductCategoryId,
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

test("avatar placeholder icons cover every wearable type", () => {
  const expected = {
    eyes: "eye",
    nose: "ellipse",
    mouth: "chatbubble-ellipses",
    hair: "sparkles",
    top: "shirt",
    bottom: "layers",
    shoes: "walk",
    accessory: "glasses",
    body: "person"
  } as const
  for (const [type, icon] of Object.entries(expected)) {
    assert.equal(getAvatarIcon(type as Parameters<typeof getAvatarIcon>[0]), icon, type)
  }
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
    buildShopCategoryOptions("avatar", products, "en").map(({ id, label, count, icon }) => ({ id, label, count, icon })),
    [
      { id: "top", label: "Tops", count: 2, icon: "shirt" },
      { id: "dress", label: "Dresses", count: 1, icon: "sparkles" },
      { id: "shoes", label: "Shoes", count: 1, icon: "walk" },
      { id: "hair", label: "Hair", count: 1, icon: "color-wand" }
    ]
  )
  assert.equal(buildShopCategoryOptions("avatar", products, "tr")[0].label, "Üstler")
})

test("home categories lead with All and Owned and include only populated furniture groups", () => {
  const products = [
    roomProduct("lamp", "lighting", { owned: true }),
    roomProduct("sofa", "seating"),
    roomProduct("poster", "wallDecor")
  ]
  assert.deepEqual(
    buildShopCategoryOptions("home", products, "en").map(({ id, count, icon }) => ({ id, count, icon })),
    [
      { id: "all", count: 3, icon: "grid" },
      { id: "owned", count: 1, icon: "checkmark-circle" },
      { id: "seating", count: 1, icon: "bed" },
      { id: "lighting", count: 1, icon: "bulb" },
      { id: "wallDecor", count: 1, icon: "image" }
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
  assert.deepEqual(decor, {
    roomShellId: "default-shell",
    placedItems: [
      baseDecor.placedItems[0],
      { instanceId: "shop-preview-item", itemId: "lamp", x: 0.54, y: 0.76, rotation: "front" }
    ]
  })
  const poster = { id: "poster", category: "wallDecor", assetsByRotation: { left: {}, right: {} } } as unknown as FurnitureItem
  const wallDecor = createRoomPreviewDecor(poster, { roomShellId: "shell-a", placedItems: [] }, "default-shell")
  assert.deepEqual(wallDecor, {
    roomShellId: "shell-a",
    placedItems: [{ instanceId: "shop-preview-item", itemId: "poster", x: 0.28, y: 0.5, rotation: "left" }]
  })
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
