import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import sharp from "sharp"
import thumbnailBounds from "./shopThumbnailBounds.json"

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
  getShopProductThumbnailBounds,
  getShopProductThumbnailSource
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./shopAssets") as typeof import("./shopAssets")

const shopAssetsSource = readFileSync(
  resolve(process.cwd(), "src/features/shop/shopAssets.ts"),
  "utf8"
)
// The screen plus every module it was decomposed into.
const shopScreenSource = [
  readFileSync(resolve(process.cwd(), "src/screens/CosmeticShopScreen.tsx"), "utf8"),
  ...readdirSync(resolve(process.cwd(), "src/features/shop/screen"))
    .filter((fileName) => /\.tsx?$/.test(fileName) && !/\.test\.tsx?$/.test(fileName))
    .sort()
    .map((fileName) => readFileSync(resolve(process.cwd(), "src/features/shop/screen", fileName), "utf8"))
].join("\n")

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

test("visible thumbnail metadata stays bound to the resolved source geometry", async () => {
  for (const [id, source] of Object.entries(SHOP_THUMBNAIL_SOURCES)) {
    const expected = (thumbnailBounds as Record<string, number[]>)[id]
    assert.ok(expected, `${id}: missing visible bounds`)
    const { data, info } = await sharp(source as string).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let left = info.width, top = info.height, right = 0, bottom = 0
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] <= 8) continue
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x + 1)
        bottom = Math.max(bottom, y + 1)
      }
    }
    assert.deepEqual(expected, [info.width, info.height, left, top, right - left, bottom - top], `${id}: regenerate presentation bounds after changing the source`)
  }
})

test("garment thumbnails never substitute a full-character square image", async () => {
  for (const id of [
    "avatar_v2_bottom_midnight_ribbon_wide_leg_pants",
    "avatar_v2_bottom_buttercream_pearl_tailored_pants",
    "avatar_v2_bottom_rose_picnic_pleated_shorts",
    "avatar_v2_bottom_lavender_bow_twill_shorts",
    "avatar_v2_shoes_rose_satin_bow_heels",
    "avatar_v2_shoes_ivory_pearl_slingback_heels",
    "avatar_v2_shoes_lilac_star_platform_sneakers",
    "avatar_v2_shoes_mint_ribbon_court_sneakers"
  ]) {
    const source = getShopProductThumbnailSource(id) as string
    const bounds = getShopProductThumbnailBounds(id)
    assert.match(source, /\/assets\/(?:room|layers)\//, `${id}: use the garment-only source`)
    assert.ok(bounds, `${id}: missing visible bounds`)
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let left = info.width, top = info.height, right = 0, bottom = 0
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] <= 8) continue
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x + 1)
        bottom = Math.max(bottom, y + 1)
      }
    }
    assert.deepEqual(bounds, [info.width, info.height, left, top, right - left, bottom - top])
  }
})

test("sweet capsule shoe cards use the 512x768 profile layer, not the half-size room layer", () => {
  // A wide shoe fills the card width (~100pt). The 256x384 room layer holds it in
  // 58x29 px, a >5x upscale on a 3x iPhone; the profile layer is the same artwork
  // at 118x60 px.
  for (const [id, layer] of [
    ["avatar_v2_shoes_rose_satin_bow_heels", "avatar_shoes_rose_satin_bow_heels.png"],
    ["avatar_v2_shoes_ivory_pearl_slingback_heels", "avatar_shoes_ivory_pearl_slingback_heels.png"],
    ["avatar_v2_shoes_lilac_star_platform_sneakers", "avatar_shoes_lilac_star_platform_sneakers.png"],
    ["avatar_v2_shoes_mint_ribbon_court_sneakers", "avatar_shoes_mint_ribbon_court_sneakers.png"]
  ] as const) {
    const source = getShopProductThumbnailSource(id) as string
    assert.ok(source.endsWith(`/assets/layers/${layer}`), `${id}: ${source}`)
    const bounds = getShopProductThumbnailBounds(id)
    assert.ok(bounds && bounds[4] >= 110, `${id}: visible width ${bounds?.[4]}px is too small for the card`)
  }
})
