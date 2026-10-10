import assert from "node:assert/strict"
import test from "node:test"
import { ECONOMY_CATALOG } from "../economy/economyCatalog"
import { RESERVED_ROOM_ITEM_IDS, ROOM_V3_FURNITURE } from "../economy/roomFurnitureIds"
import {
  BLUMI_R1_RELEASE_CATALOG,
  isReleaseCatalogItemHeld,
  resolveR1PublishedEconomyCatalog,
  resolveUnheldEconomyCatalog
} from "../release/releaseCatalog"
import { isLegacyItemId, LEGACY_AVATAR_ITEM_IDS, LEGACY_ROOM_ITEM_IDS } from "./legacyItemIds"

/** The six old flat room pieces retired in X8: in the registry, never an active economy entry again. */
const RETIRED_FLAT_ROOM_IDS = new Set([
  "room_v2_cozy_bed",
  "room_v2_cute_bookshelf",
  "room_v2_heart_rug",
  "room_v2_lamp_heart",
  "room_v2_side_table",
  "room_v2_table_round"
])

/** The 45 Universal Core candidate IDs removed with their code in X6: kept in the registry forever. */
const RETIRED_UNIVERSAL_CORE_IDS = [
  "universal_petal_side_table_a",
  "universal_cloud_loveseat_a",
  "universal_orbit_floor_lamp_a",
  "universal_tidy_work_desk_a",
  "universal_arc_coffee_table_b",
  "universal_cloud_accent_chair_b",
  "universal_round_dining_table_a",
  "universal_soft_media_console_b",
  "universal_open_bookshelf_a",
  "universal_table_lamp_a",
  "universal_wall_clock_a",
  "universal_small_tabletop_plant_a",
  "universal_ceramic_vase_set_a",
  "universal_books_magazine_stack_a",
  "universal_tea_coffee_tray_a",
  "universal_dining_chair_a",
  "universal_desk_chair_a",
  "universal_bench_a",
  "universal_soft_floor_cushion_a",
  "universal_pet_bed_a",
  "universal_nightstand_a",
  "universal_laundry_basket_a",
  "universal_cushion_set_a",
  "universal_vanity_table_a",
  "universal_shoe_cabinet_a",
  "universal_long_sofa_a",
  "universal_lounge_armchair_a",
  "universal_cloud_bed_b",
  "universal_rounded_wardrobe_a",
  "universal_soft_coat_stand_a",
  "universal_soft_pouf_b",
  "universal_arch_wall_mirror_a",
  "universal_storage_cabinet_a",
  "universal_dresser_a",
  "universal_console_table_a",
  "universal_large_standing_plant_a",
  "universal_wall_artwork_a",
  "universal_ceiling_light_a",
  "universal_curtain_set_a",
  "universal_decorative_object_set_a",
  "universal_small_speaker_a",
  "universal_rug_a",
  "universal_full_length_mirror_a",
  "universal_open_display_shelf_a",
  "universal_room_divider_a",
] as const

/** The 10 QA-only room ids (3 Focus-12 candidates, 7 VNext pilot ids): their code is gone, the ids stay reserved. */
const RETIRED_QA_ROOM_IDS = [
  "universal_cloud_sectional_sofa_a",
  "universal_cozy_tv_media_unit_a",
  "universal_home_arcade_a",
  "room_vnext_lounge_chair",
  "room_vnext_round_table",
  "room_vnext_side_table",
  "room_vnext_lamp",
  "room_vnext_bookshelf",
  "room_vnext_rug",
  "room_vnext_tabletop_plant"
] as const

const ROOM_V3_IDS = ROOM_V3_FURNITURE.map((item) => item.itemId)

test("L14: no new, reserved or kept id is in the legacy registry, and old ids are never reused", () => {
  const registry = [...LEGACY_ROOM_ITEM_IDS, ...LEGACY_AVATAR_ITEM_IDS]
  assert.equal(new Set(registry).size, registry.length, "registry ids are unique")
  for (const id of [...ROOM_V3_IDS, ...RESERVED_ROOM_ITEM_IDS, "room_v2_chair_blush", "room_v2_shell_blumi_world_v1"]) {
    assert.equal(isLegacyItemId(id), false, `${id} is active or reserved but listed as legacy`)
  }
  for (const item of ECONOMY_CATALOG) {
    assert.equal(isLegacyItemId(item.itemId), false, `${item.itemId}: a legacy id is an active economy entry`)
  }
})

test("the room part of the registry holds the six old flat pieces and all 45 universal core candidates", () => {
  for (const id of RETIRED_FLAT_ROOM_IDS) assert.ok(isLegacyItemId(id), id)
  assert.equal(new Set(RETIRED_UNIVERSAL_CORE_IDS).size, 45)
  for (const id of RETIRED_UNIVERSAL_CORE_IDS) {
    assert.ok(isLegacyItemId(id), id)
    assert.equal(ECONOMY_CATALOG.some((item) => item.itemId === id), false, `${id} must never be sold again`)
  }
  assert.equal(LEGACY_ROOM_ITEM_IDS.length, 51 + RETIRED_QA_ROOM_IDS.length)
})

test("the 10 QA-only room ids are reserved: legacy and never sold", () => {
  assert.equal(new Set(RETIRED_QA_ROOM_IDS).size, 10)
  for (const id of RETIRED_QA_ROOM_IDS) {
    assert.ok(isLegacyItemId(id), `${id} must stay reserved`)
    assert.equal(ECONOMY_CATALOG.some((item) => item.itemId === id), false, `${id} must never be sold`)
  }
})

test("the 27 approved 2.5D pieces and the blush chair are held as pricing-pending; the starter bed never is", () => {
  assert.equal(ROOM_V3_IDS.length, 27)
  assert.equal(new Set(ROOM_V3_IDS).size, 27)
  const pricingPending = BLUMI_R1_RELEASE_CATALOG.heldScopes.find((scope) => scope.scope === "pricing-pending")
  assert.ok(pricingPending)
  const inScope = (id: string) => pricingPending.itemIdPatterns.some((pattern) => new RegExp(pattern).test(id))
  for (const id of [...ROOM_V3_IDS, "room_v2_chair_blush"]) {
    assert.ok(inScope(id), `${id} is not pricing-pending`)
    assert.ok(isReleaseCatalogItemHeld(id), id)
    assert.ok(ECONOMY_CATALOG.some((item) => item.itemId === id && item.type === "room"), `${id} has no economy entry`)
  }
  for (const id of RESERVED_ROOM_ITEM_IDS) {
    assert.equal(isReleaseCatalogItemHeld(id), false, `${id} must never be held`)
    assert.equal(ECONOMY_CATALOG.some((item) => item.itemId === id), false, `${id} has no art yet, so no entry`)
  }
})

test("held items are neither sold nor listed in production or development projections", () => {
  for (const projection of [resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG), resolveUnheldEconomyCatalog(ECONOMY_CATALOG)]) {
    for (const id of [...ROOM_V3_IDS, "room_v2_chair_blush"]) {
      assert.equal(projection.some((item) => item.itemId === id), false, id)
    }
  }
  // ownedByDefault starters stay in both
  assert.ok(resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG).some((item) => item.itemId === "avatar_v2_body_default"))
  assert.ok(resolveUnheldEconomyCatalog(ECONOMY_CATALOG).some((item) => item.itemId === "avatar_v2_body_default"))
})
