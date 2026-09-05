import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

import {
  FEMALE_NONDRESS_CATALOG,
  createPairwisePlan,
  verifyPromotedInventory
} from "./female-wardrobe-combined-promotion-gate.mjs"

const expectedTops = [
  "rosebud_picnic_peplum",
  "lilac_cloud_wrap_top",
  "buttercream_bow_tee",
  "azure_garden_halter",
  "ivory_tweed_crop_jacket",
  "cherry_varsity_cardigan",
  "midnight_velvet_bolero"
]

const expectedBottoms = [
  ["midnight_ribbon_wide_leg_pants", "bottomOverShoeUpper"],
  ["buttercream_pearl_tailored_pants", "bottomOverShoeUpper"],
  ["rose_picnic_pleated_shorts", "bottomBehindShoes"],
  ["lavender_bow_twill_shorts", "bottomBehindShoes"]
]

const expectedShoes = [
  "rose_satin_bow_heels",
  "ivory_pearl_slingback_heels",
  "lilac_star_platform_sneakers",
  "mint_ribbon_court_sneakers"
]

test("female sweet capsule is included in the production nondress promotion contract", () => {
  for (const slug of expectedTops) {
    assert.ok(FEMALE_NONDRESS_CATALOG.tops.includes(slug), `missing top/jacket ${slug}`)
  }
  for (const [slug, occlusionRole] of expectedBottoms) {
    assert.deepEqual(
      FEMALE_NONDRESS_CATALOG.bottoms.find((bottom) => bottom.slug === slug),
      { slug, occlusionRole },
      `missing or mis-layered bottom ${slug}`
    )
  }
  for (const slug of expectedShoes) {
    assert.ok(FEMALE_NONDRESS_CATALOG.shoes.includes(slug), `missing shoe ${slug}`)
  }

  const rows = createPairwisePlan(FEMALE_NONDRESS_CATALOG)
  for (const top of expectedTops) {
    for (const [bottom] of expectedBottoms) {
      assert.ok(rows.some((row) => row.top === top && row.bottom === bottom), `${top}/${bottom}`)
    }
    for (const shoes of expectedShoes) {
      assert.ok(rows.some((row) => row.top === top && row.shoes === shoes), `${top}/${shoes}`)
    }
  }
})

test("female sweet capsule needs every static and fitted motion layer before promotion", () => {
  assert.doesNotThrow(() => verifyPromotedInventory({
    roomRoot: new URL("../src/features/avatarV2/assets/room/", import.meta.url).pathname,
    catalog: FEMALE_NONDRESS_CATALOG
  }))
})

test("female sweet capsule promotion understands the declarative room catalog mapping", () => {
  const roomRoot = new URL("../src/features/avatarV2/assets/room/", import.meta.url).pathname
  const catalogSourcePath = fileURLToPath(
    new URL("../src/features/avatarV2/room/avatarRoom.mock.ts", import.meta.url)
  )
  assert.doesNotThrow(() => verifyPromotedInventory({
    roomRoot,
    catalog: FEMALE_NONDRESS_CATALOG,
    catalogSourcePath
  }))
  assert.match(
    readFileSync(catalogSourcePath, "utf8"),
    /FEMALE_SWEET_CAPSULE_LAYERS/,
    "the runtime room catalog must consume the canonical capsule definition"
  )
})
