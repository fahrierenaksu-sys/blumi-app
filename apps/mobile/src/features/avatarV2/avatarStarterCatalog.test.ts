import assert from "node:assert/strict"
import test from "node:test"
import { ECONOMY_CATALOG, isRetiredAvatarItemId } from "@blumi/domain"

require.extensions[".png"] = (module, filename) => { module.exports = filename }
require.extensions[".webp"] = require.extensions[".png"]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset tables contain static requires.
const { AVATAR_V2_CATALOG } = require("./avatarV2Catalog") as typeof import("./avatarV2Catalog")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the asset hooks above.
const { isAvatarV2ItemCompatibleWithBody } = require("./avatarBodyCompatibility") as typeof import("./avatarBodyCompatibility")
const {
  FEMALE_STARTER_BODY_ID,
  MALE_STARTER_BODY_ID,
  getAvatarStarterCategoryItems
// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the asset hooks above.
} = require("./avatarStarterModel") as typeof import("./avatarStarterModel")

// The free starter never leaks premium, retired, hidden or other-body items,
// whichever items the starter lists happen to name.
test("every starter choice is a free, visible, body-compatible, unretired item", () => {
  const priceById = new Map(ECONOMY_CATALOG.map((item) => [item.itemId, item.priceCoins]))
  for (const bodyId of [FEMALE_STARTER_BODY_ID, MALE_STARTER_BODY_ID]) {
    for (const type of ["hair", "top", "bottom", "shoes"] as const) {
      const items = getAvatarStarterCategoryItems(AVATAR_V2_CATALOG, type, bodyId, () => true)
      assert.ok(items.length > 0, `${bodyId} ${type} has starter choices`)
      for (const item of items) {
        const label = `${bodyId} ${type} ${item.id}`
        assert.equal(item.ownedByDefault, true, `${label} is owned by default`)
        assert.equal(priceById.get(item.id), 0, `${label} is free in the economy catalog`)
        assert.equal(isAvatarV2ItemCompatibleWithBody(item, bodyId), true, `${label} fits the body`)
        assert.equal(isRetiredAvatarItemId(item.id), false, `${label} is not retired`)
        assert.notEqual(item.hiddenFromWardrobe, true, `${label} is visible`)
      }
    }
  }
})
