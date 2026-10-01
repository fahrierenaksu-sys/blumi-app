import assert from "node:assert/strict"
import test from "node:test"
import type { EconomyCatalogItem } from "@blumi/domain"
import type { AvatarCatalogItem } from "../avatarV2/avatarV2.types"
import { isAvatarItemSoldInShop } from "./shopListingModel"

const item = (overrides: Partial<AvatarCatalogItem> = {}): AvatarCatalogItem => ({
  id: "top-sold",
  type: "top",
  name: "Sold top",
  ...overrides
} as AvatarCatalogItem)
const catalog = [
  { itemId: "top-sold", type: "avatar", priceCoins: 120 },
  { itemId: "top-free", type: "avatar", priceCoins: 0 },
  { itemId: "room-chair", type: "room", priceCoins: 50 }
] as unknown as EconomyCatalogItem[]
const listing = { publishedCatalog: catalog, hasShopThumbnail: () => true }

test("an item is sold in the Shop when it is published with a price and has Shop art", () => {
  assert.equal(isAvatarItemSoldInShop(item(), listing), true)
  assert.equal(isAvatarItemSoldInShop(item({ id: "top-free" }), listing), true, "a free listed item is still listed")
})

test("unpublished, room-only, unpriced, hidden, outfit or art-less items never appear as Shop links", () => {
  assert.equal(isAvatarItemSoldInShop(item({ id: "top-unpublished" }), listing), false)
  assert.equal(isAvatarItemSoldInShop(item({ id: "room-chair" }), listing), false, "economy type must be avatar")
  assert.equal(isAvatarItemSoldInShop(item({ hiddenFromShop: true }), listing), false)
  assert.equal(isAvatarItemSoldInShop(item({ outfitKey: "look" } as Partial<AvatarCatalogItem>), listing), false,
    "production never merchandises semantic outfits")
  assert.equal(isAvatarItemSoldInShop(item(), { ...listing, hasShopThumbnail: () => false }), false)
  assert.equal(isAvatarItemSoldInShop(item({ type: "face" }), listing), false, "faces are not Shop types")
  const unpriced = [{ itemId: "top-sold", type: "avatar", priceCoins: null }] as unknown as EconomyCatalogItem[]
  assert.equal(isAvatarItemSoldInShop(item(), { ...listing, publishedCatalog: unpriced }), false)
})
