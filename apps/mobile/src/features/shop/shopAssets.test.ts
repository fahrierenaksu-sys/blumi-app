import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import thumbnailBounds from "./shopThumbnailBounds.json"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]

const {
  SHOP_THUMBNAIL_SOURCES,
  getShopProductThumbnailBounds,
  getShopProductThumbnailSource
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./shopAssets") as typeof import("./shopAssets")
const { AVATAR_V2_CATALOG } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/avatarV2Catalog") as typeof import("../avatarV2/avatarV2Catalog")
const { getGarmentThumbnailOverride } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/garmentThumbnailOverrides") as typeof import("../avatarV2/garmentThumbnailOverrides")

async function measureVisibleBounds(source: string): Promise<number[]> {
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
  return [info.width, info.height, left, top, right - left, bottom - top]
}

test("visible thumbnail metadata stays bound to the resolved source geometry", async () => {
  for (const [id, source] of Object.entries(SHOP_THUMBNAIL_SOURCES)) {
    const expected = (thumbnailBounds as Record<string, number[]>)[id]
    assert.ok(expected, `${id}: missing visible bounds`)
    assert.deepEqual(expected, await measureVisibleBounds(source as string), `${id}: regenerate presentation bounds after changing the source`)
  }

  // Garment-only overrides replace square thumbnails that show the whole
  // character; their bounds must match the garment layer they point at.
  for (const { id } of AVATAR_V2_CATALOG) {
    if (!getGarmentThumbnailOverride(id)) continue
    const source = getShopProductThumbnailSource(id) as string
    const bounds = getShopProductThumbnailBounds(id)
    assert.ok(bounds, `${id}: missing visible bounds`)
    assert.deepEqual(bounds, await measureVisibleBounds(source), `${id}: regenerate the garment override bounds`)
  }
})
