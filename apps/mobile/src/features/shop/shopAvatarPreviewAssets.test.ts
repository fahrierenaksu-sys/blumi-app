import assert from "node:assert/strict"
import test from "node:test"

// Node tests use paths for Metro's static image modules.
require.extensions[".png"] = (module, filename) => { module.exports = filename }
require.extensions[".webp"] = require.extensions[".png"]

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset fixture setup must precede imports.
const { AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2 } = require("../avatarV2/avatarV2.mock") as typeof import("../avatarV2/avatarV2.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset fixture setup must precede imports.
const { getShopPreviewAddedAssets } = require("./shopAvatarPreviewAssets") as typeof import("./shopAvatarPreviewAssets")

test("shop warms only the new live outfit layer, not the whole avatar", () => {
  const polo = AVATAR_V2_CATALOG.find((item) => item.name === "Coral Wave Polo")
  assert.ok(polo)
  const assets = getShopPreviewAddedAssets(DEFAULT_AVATAR_V2, polo)
  assert.equal(assets.length, 1)
  assert.match(assets[0].key, /coral_wave_polo/)
})

test("already equipped shop item requests no extra asset", () => {
  const top = AVATAR_V2_CATALOG.find((item) => item.id === DEFAULT_AVATAR_V2.topId)
  assert.ok(top)
  assert.deepEqual(getShopPreviewAddedAssets(DEFAULT_AVATAR_V2, top), [])
})
