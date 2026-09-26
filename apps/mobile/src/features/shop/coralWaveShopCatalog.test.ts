import assert from "node:assert/strict"
import { createRequire, Module } from "node:module"
import test from "node:test"

const testRequire = createRequire(import.meta.url)

testRequire.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// The Shop avatar path does not depend on room furniture. Stub only that
// unrelated catalog so this focused test does not load the historical Room V3
// fixture graph from a sparse checkout.
const roomMockPath = testRequire.resolve("../roomV2/roomV2.mock")
const roomMock = new Module(roomMockPath)
roomMock.filename = roomMockPath
roomMock.loaded = true
roomMock.exports = { ROOM_V2_FURNITURE_CATALOG: [] }
testRequire.cache[roomMockPath] = roomMock

const { AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2 } = testRequire("../avatarV2/avatarV2.mock") as typeof import("../avatarV2/avatarV2.mock")
const { ECONOMY_CATALOG } = testRequire("@blumi/domain") as typeof import("@blumi/domain")
const { buildShopCatalogItems } = testRequire("./shopCatalog") as typeof import("./shopCatalog")

const coralWaveProducts = [
  { itemId: "avatar_v2_top_coral_wave_polo", title: "Coral Wave Polo" },
  { itemId: "avatar_v2_bottom_coral_wave_pants", title: "Coral Wave Pants" },
  { itemId: "avatar_v2_shoes_coral_wave_shoes", title: "Coral Wave Shoes" }
] as const

test("Shop builds purchasable Coral Wave rows from the female avatar catalog", () => {
  const products = buildShopCatalogItems({
    avatar: DEFAULT_AVATAR_V2,
    inventory: {
      coins: 1250,
      ownedAvatarItemIds: [],
      ownedRoomItemIds: [],
      unlockedFeatureIds: [],
      updatedAt: "2026-09-26T00:00:00.000Z"
    },
    roomDecor: {
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: []
    },
    economyCatalog: ECONOMY_CATALOG
  })

  for (const expected of coralWaveProducts) {
    const product = products.find((item) => item.sourceItemId === expected.itemId)
    const catalogItem = AVATAR_V2_CATALOG.find((item) => item.id === expected.itemId)
    const economyItem = ECONOMY_CATALOG.find((item) => item.itemId === expected.itemId)

    assert.ok(catalogItem, expected.itemId)
    assert.ok(economyItem, expected.itemId)
    assert.ok(product, expected.itemId)
    assert.equal(product.id, `avatar:${expected.itemId}`)
    assert.equal(product.kind, "avatarWearable")
    assert.equal(product.title, expected.title)
    assert.equal(product.priceCoins, economyItem.priceCoins)
    assert.equal(product.owned, false)
    assert.equal(product.actionType, "avatarUnlock")
    assert.equal(product.avatarItem?.id, expected.itemId)
  }
})
