import assert from "node:assert/strict"
import test from "node:test"
import { statSync } from "node:fs"
import { RETIRED_AVATAR_ITEM_IDS } from "@blumi/domain"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]

const {
  getAvatarItemPreviewSource,
  getShopProductThumbnailSource
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./shopAssets") as typeof import("./shopAssets")
const { AVATAR_V2_CATALOG } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/avatarV2Catalog") as typeof import("../avatarV2/avatarV2Catalog")
const { getAvatarItemStillThumbnail } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatar/stills/stillThumbnail") as typeof import("../avatar/stills/stillThumbnail")

test("a Shop picture is the item's baked 2.5D thumbnail, never retired pre-2.5D artwork", () => {
  let withPicture = 0
  for (const { id } of AVATAR_V2_CATALOG) {
    const source = getShopProductThumbnailSource(id)
    assert.equal(source, getAvatarItemStillThumbnail(id), `${id}: the Shop shows only the 2.5D thumbnail`)
    assert.equal(getAvatarItemPreviewSource(id), source)
    if (source === undefined) continue
    withPicture += 1
    assert.match(String(source), /\/avatar\/stills\/layers\/(female|male)\/thumb\//)
    assert.ok(statSync(String(source)).size > 1024, `${id}: thumbnail is empty`)
  }
  assert.ok(withPicture > 0)
})

test("a retired item has no Shop picture, so the Shop cannot list it even if it were unhidden", () => {
  for (const id of RETIRED_AVATAR_ITEM_IDS) {
    assert.equal(getShopProductThumbnailSource(id), undefined, id)
  }
  assert.equal(getShopProductThumbnailSource("avatar_v2_unknown_item"), undefined)
})
