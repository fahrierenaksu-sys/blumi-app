import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  ECONOMY_CATALOG as DOMAIN_ECONOMY_CATALOG,
  resolvePublishedReleaseCatalogItemIds,
  resolveR1PublishedEconomyCatalog
} from "@blumi/domain"
import { resolveProductionEconomyCatalog } from "./economyCatalog"

test("the production economy projection keeps the 2.5D starters and excludes old, held, retired and Room V3 items", () => {
  const catalog = resolveProductionEconomyCatalog(DOMAIN_ECONOMY_CATALOG)
  const ids = new Set(catalog.map((item) => item.itemId))

  // the 2.5D starters (plan X15): free, owned by every account, never receipted
  for (const starterId of [
    DEFAULT_FEMALE_AVATAR_LOADOUT.hairId,
    DEFAULT_FEMALE_AVATAR_LOADOUT.topId,
    DEFAULT_FEMALE_AVATAR_LOADOUT.bottomId,
    DEFAULT_FEMALE_AVATAR_LOADOUT.shoesId,
    DEFAULT_MALE_AVATAR_LOADOUT.hairId
  ]) {
    const item = catalog.find((entry) => entry.itemId === starterId)
    assert.ok(item, starterId)
    assert.equal(item.ownedByDefault, true, starterId)
    assert.equal(item.priceCoins, 0, starterId)
  }
  // a paid item is sold in production only with an owner-approved receipt
  const receipted = new Set(resolvePublishedReleaseCatalogItemIds())
  for (const item of catalog) {
    if (item.ownedByDefault !== true) assert.ok(receipted.has(item.itemId), `${item.itemId} is sold without a receipt`)
  }
  // the old avatarV2 items lost their receipts in X15; promotion hold, retired art and Room V3 candidates stay unsellable
  for (const excludedId of [
    "avatar_v2_top_sage_ribbon_knit_jacket",
    "avatar_v2_top_boho_patchwork_maxi_dress",
    "avatar_v2_top_male_tonal_geometric_camp_collar_shirt",
    "avatar_v2_hair_male_soft_textured_crop",
    "avatar_v2_top_cherry_heart_milkmaid_blouse",
    "avatar_v2_top_blush_lace_cardigan",
    "avatar_v2_top_male_acid_washed_boxy_sweatshirt",
    "universal_cloud_loveseat_a",
    // the old flat room pieces were retired in X8 (legacy registry), the free cozy bed included
    "room_v2_cozy_bed",
    "room_v2_cute_bookshelf",
    "universal_bench_a"
  ]) {
    assert.equal(ids.has(excludedId), false, excludedId)
  }
  // the owner-approved home pieces are sold once receipted, and only then
  for (const homeId of ["room_v2_chair_blush", "room_v3_sofa_japon_cream"]) {
    assert.equal(ids.has(homeId), receipted.has(homeId), `${homeId} is sold exactly when it has a receipt`)
    assert.equal(receipted.has(homeId), true, `${homeId} was approved by the owner and receipted`)
  }
})

test("mobile Shop and server publish the same semantic IDs, prices and grants", () => {
  const mobileProjection = resolveR1PublishedEconomyCatalog(DOMAIN_ECONOMY_CATALOG)
  const serverProjection = resolveProductionEconomyCatalog(DOMAIN_ECONOMY_CATALOG)
  assert.deepEqual(serverProjection, mobileProjection)

  const allIds = DOMAIN_ECONOMY_CATALOG.map(item => item.itemId)
  assert.equal(new Set(allIds).size, allIds.length, "economy IDs must be unique")
  const loadoutIds = new Set(AVATAR_LOADOUT_CATALOG.map(item => item.itemId))
  for (const item of mobileProjection) {
    if (item.type === "avatar") {
      assert.ok(loadoutIds.has(item.itemId), `${item.itemId} lacks a loadout definition`)
    }
    // Grants are loadout pieces of a purchased outfit (dress bottoms), not
    // separately sold economy items, so they must be known loadout IDs.
    for (const grantedId of item.grantedItemIds ?? []) {
      assert.ok(loadoutIds.has(grantedId), `${item.itemId} grants an unknown ID`)
    }
  }
})
