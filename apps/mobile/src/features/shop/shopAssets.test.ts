import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]

const {
  AVATAR_ITEM_PREVIEW_SOURCES,
  ROOM_SHOP_THUMBNAIL_SOURCES,
  SHOP_THUMBNAIL_SOURCES,
  getAvatarItemPreviewSource,
  getRoomProductThumbnailSource,
  getShopProductThumbnailSource
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./shopAssets") as typeof import("./shopAssets")

const shopAssetsSource = readFileSync(
  resolve(process.cwd(), "src/features/shop/shopAssets.ts"),
  "utf8"
)
const shopScreenSource = readFileSync(
  resolve(process.cwd(), "src/screens/CosmeticShopScreen.tsx"),
  "utf8"
)

test("shop asset registries live outside the screen monolith", () => {
  assert.match(shopAssetsSource, /export const AVATAR_ITEM_PREVIEW_SOURCES/)
  assert.match(shopAssetsSource, /export const SHOP_THUMBNAIL_SOURCES/)
  assert.match(shopAssetsSource, /export const ROOM_SHOP_THUMBNAIL_SOURCES/)
  assert.match(shopAssetsSource, /export function getShopProductThumbnailSource/)
  assert.doesNotMatch(shopScreenSource, /const AVATAR_ITEM_PREVIEW_SOURCES/)
  assert.doesNotMatch(shopScreenSource, /const SHOP_THUMBNAIL_SOURCES/)
  assert.doesNotMatch(shopScreenSource, /const ROOM_SHOP_THUMBNAIL_SOURCES/)
})

test("shop keeps live avatar previews separate from square product thumbnails", () => {
  const productId = "avatar_v2_top_cherry_heart_milkmaid_blouse"
  const previewSource = getAvatarItemPreviewSource({ id: productId })
  const thumbnailSource = getShopProductThumbnailSource(productId)

  assert.ok(previewSource)
  assert.ok(thumbnailSource)
  assert.notEqual(previewSource, thumbnailSource)
  assert.equal(AVATAR_ITEM_PREVIEW_SOURCES[productId], previewSource)
  assert.equal(SHOP_THUMBNAIL_SOURCES[productId], thumbnailSource)
})

test("shop asset registries retain representative capsule and room entries", () => {
  for (const itemId of [
    "avatar_v2_top_rosebud_picnic_peplum",
    "avatar_v2_bottom_striped_crochet_shorts",
    "avatar_v2_top_male_cream_basic_tee"
  ]) {
    assert.ok(AVATAR_ITEM_PREVIEW_SOURCES[itemId], `${itemId} preview`)
    assert.ok(SHOP_THUMBNAIL_SOURCES[itemId], `${itemId} thumbnail`)
  }

  const roomItemId = "room_v2_chair_blush"
  assert.equal(
    getRoomProductThumbnailSource(roomItemId),
    ROOM_SHOP_THUMBNAIL_SOURCES[roomItemId]
  )
})
