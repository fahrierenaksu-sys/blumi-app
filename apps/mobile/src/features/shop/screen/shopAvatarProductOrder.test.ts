import assert from "node:assert/strict"
import test from "node:test"
import type { ShopCatalogItem } from "../shopCatalog"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]

const {
  PRODUCT_REFERENCE_AVATAR_ITEM_IDS,
  SHOP_THUMBNAIL_SOURCES
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../shopAssets") as typeof import("../shopAssets")
const {
  getAvatarShopProductPriority,
  isDisplayableAvatarShopProduct,
  sortAvatarShopProducts
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./shopAvatarProductOrder") as typeof import("./shopAvatarProductOrder")

const referenceId = [...PRODUCT_REFERENCE_AVATAR_ITEM_IDS][0]
const thumbnailId = Object.keys(SHOP_THUMBNAIL_SOURCES)[0]

function product(sourceItemId: string, title: string, priceCoins: number | null, avatar = true): ShopCatalogItem {
  return {
    id: `avatar:${sourceItemId}`,
    sourceItemId,
    title,
    priceCoins,
    avatarItem: avatar ? { id: sourceItemId, type: "top" } : undefined
  } as unknown as ShopCatalogItem
}

test("avatar priority puts product references first, then priced, then free items", () => {
  assert.equal(getAvatarShopProductPriority(product(referenceId, "Ref", null)), 0)
  assert.equal(getAvatarShopProductPriority(product("priced", "Priced", 0)), 1)
  assert.equal(getAvatarShopProductPriority(product("free", "Free", null)), 2)
})

test("avatar sort is stable by priority then locale-aware title", () => {
  const sorted = sortAvatarShopProducts([
    product("free-b", "Beta", null),
    product("priced-z", "Zeta", 10),
    product(referenceId, "Omega", null),
    product("priced-a", "Alpha", 20),
    product("free-a", "Alpha", null)
  ], "en")
  assert.deepEqual(sorted.map((item) => item.sourceItemId), [
    referenceId,
    "priced-a",
    "priced-z",
    "free-a",
    "free-b"
  ])
})

test("Turkish titles sort with the Turkish collator", () => {
  const titles = ["Zeytin", "Çiçek", "Cadı", "Şal", "Sarı"]
  const sorted = sortAvatarShopProducts(titles.map((title) => product(title, title, 5)), "tr")
  assert.deepEqual(sorted.map((item) => item.title), ["Cadı", "Çiçek", "Sarı", "Şal", "Zeytin"])
})

test("only avatar products with a square Shop thumbnail are displayable", () => {
  assert.equal(isDisplayableAvatarShopProduct(product(thumbnailId, "Thumb", 5)), true)
  assert.equal(isDisplayableAvatarShopProduct(product("missing-thumbnail", "Missing", 5)), false)
  assert.equal(isDisplayableAvatarShopProduct(product(thumbnailId, "Room", 5, false)), false)
})
