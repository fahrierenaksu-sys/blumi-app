import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_LOADOUT_CATALOG,
  ECONOMY_CATALOG as DOMAIN_ECONOMY_CATALOG,
  resolveR1PublishedEconomyCatalog
} from "@blumi/domain"
import { resolveProductionEconomyCatalog } from "./economyCatalog"

test("the production economy projection sells receipted paid items and excludes held, retired and Room V3 candidates", () => {
  const catalog = resolveProductionEconomyCatalog(DOMAIN_ECONOMY_CATALOG)
  const ids = new Set(catalog.map((item) => item.itemId))

  for (const starterId of [
    "avatar_v2_top_default",
    "avatar_v2_face_warm_peach_foundation",
    "avatar_v2_eyes_sage_glass",
    "avatar_v2_nose_petal_curve",
    "avatar_v2_mouth_rose_gloss_smile",
    "room_v2_cozy_bed"
  ]) {
    assert.ok(ids.has(starterId), starterId)
  }
  // Owner-approved paid items (docs/quality/SHOP_CATALOG_PUBLICATION_2026-09-30.md).
  for (const paidId of [
    "avatar_v2_top_sage_ribbon_knit_jacket",
    "avatar_v2_top_boho_patchwork_maxi_dress",
    "avatar_v2_top_male_tonal_geometric_camp_collar_shirt",
    "avatar_v2_hair_male_soft_textured_crop",
    "room_v2_chair_blush",
    "room_v2_cute_bookshelf"
  ]) {
    const item = catalog.find((entry) => entry.itemId === paidId)
    assert.ok(item, paidId)
    assert.notEqual(item.ownedByDefault, true, paidId)
  }
  // Promotion hold, retired art, and Room V3 candidates stay unsellable.
  for (const excludedId of [
    "avatar_v2_top_cherry_heart_milkmaid_blouse",
    "avatar_v2_top_blush_lace_cardigan",
    "avatar_v2_top_male_acid_washed_boxy_sweatshirt",
    "universal_cloud_loveseat_a"
  ]) {
    assert.equal(ids.has(excludedId), false, excludedId)
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
