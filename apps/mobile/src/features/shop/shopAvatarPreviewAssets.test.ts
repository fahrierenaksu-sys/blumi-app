import assert from "node:assert/strict"
import test from "node:test"

// Node tests use paths for Metro's static image modules.
require.extensions[".png"] = (module, filename) => { module.exports = filename }
require.extensions[".webp"] = require.extensions[".png"]

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset fixture setup must precede imports.
const { AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2 } = require("../avatarV2/avatarV2Catalog") as typeof import("../avatarV2/avatarV2Catalog")
const {
  getShopPreviewAddedAssets
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset fixture setup must precede imports.
} = require("./shopAvatarPreviewAssets") as typeof import("./shopAvatarPreviewAssets")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset fixture setup must precede imports.
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } = require("../avatarV2/room/avatarRoomProjection") as typeof import("../avatarV2/room/avatarRoomProjection") // eslint-disable-line @typescript-eslint/no-require-imports
const { getIdleAvatarLayerAssets } = require("../avatarV2/room/avatarIdleAssets") as typeof import("../avatarV2/room/avatarIdleAssets")

test("current-scene warmup selects only equipped front/idle layers", () => {
  const assets = getIdleAvatarLayerAssets(DEFAULT_AVATAR_V2)
  assert.ok(assets.length > 0 && assets.length <= 14)
  assert.equal(new Set(assets.map((asset) => asset.key)).size, assets.length)
  assert.ok(assets.some((asset) => asset.key.includes("base_female")))
  assert.ok(assets.every((asset) => !asset.key.includes("walking")))
})

test("shop warms only the new live outfit layer, not the whole avatar", () => {
  // Plan X15 made the coral polo the girl's worn starter top and retired the old paid tops, so the product is a
  // fixture copy of an old paid top (same art) under a fixture ID the room mapping knows.
  const cream = AVATAR_V2_CATALOG.find((item) => item.id === "avatar_v2_top_sage_ribbon_knit_jacket")
  assert.ok(cream)
  const fixtureTop = { ...cream, id: "fixture_shop_top", hiddenFromShop: false, hiddenFromWardrobe: false }
  const source = {
    avatarCatalog: [...AVATAR_V2_CATALOG, fixtureTop],
    projectionMap: { ...DEFAULT_AVATAR_ROOM_PROJECTION_MAP, [fixtureTop.id]: DEFAULT_AVATAR_ROOM_PROJECTION_MAP[cream.id] }
  }
  const assets = getShopPreviewAddedAssets(DEFAULT_AVATAR_V2, fixtureTop, source)
  assert.equal(assets.length, 1)
  assert.match(assets[0].key, /sage_ribbon_knit_jacket/)
})

test("already equipped shop item requests no extra asset", () => {
  const top = AVATAR_V2_CATALOG.find((item) => item.id === DEFAULT_AVATAR_V2.topId)
  assert.ok(top)
  assert.deepEqual(getShopPreviewAddedAssets(DEFAULT_AVATAR_V2, top), [])
})
