import assert from "node:assert/strict"
import test from "node:test"
import { ECONOMY_CATALOG as DOMAIN_ECONOMY_CATALOG } from "@blumi/domain"
import { resolveProductionEconomyCatalog } from "./economyCatalog"

test("the production economy projection excludes unreceipted paid cosmetics and held Room V3 candidates", () => {
  const catalog = resolveProductionEconomyCatalog(DOMAIN_ECONOMY_CATALOG)

  assert.ok(catalog.some((item) => item.itemId === "avatar_v2_top_default"))
  assert.ok(catalog.some((item) => item.itemId === "avatar_v2_face_warm_peach_foundation"))
  assert.ok(catalog.some((item) => item.itemId === "avatar_v2_eyes_sage_glass"))
  assert.ok(catalog.some((item) => item.itemId === "avatar_v2_nose_petal_curve"))
  assert.ok(catalog.some((item) => item.itemId === "avatar_v2_mouth_rose_gloss_smile"))
  assert.ok(catalog.some((item) => item.itemId === "room_v2_cozy_bed"))
  assert.equal(
    catalog.some((item) => item.itemId === "room_v2_chair_blush"),
    false
  )
  assert.equal(
    catalog.some((item) => item.itemId === "avatar_v2_top_blush_lace_cardigan"),
    false
  )
  assert.equal(
    catalog.some((item) => item.itemId === "avatar_v2_top_male_acid_washed_boxy_sweatshirt"),
    false
  )
  assert.equal(
    catalog.some((item) => item.itemId === "universal_cloud_loveseat_a"),
    false
  )
})
