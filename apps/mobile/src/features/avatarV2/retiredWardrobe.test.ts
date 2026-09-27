import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import test from "node:test"
import { RETIRED_AVATAR_ITEM_IDS, DEFAULT_MALE_AVATAR_LOADOUT, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"

require.extensions[".png"] = (module, filename) => { module.exports = filename }
require.extensions[".webp"] = require.extensions[".png"]
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AVATAR_V2_CATALOG } = require("./avatarV2.mock") as typeof import("./avatarV2.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveAvatarV2, canEquipAvatarV2Item } = require("./avatarV2Selectors") as typeof import("./avatarV2Selectors")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ROOM_AVATAR_CATALOG } = require("./room/avatarRoom.mock") as typeof import("./room/avatarRoom.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")

function assertRoomAssetExists(id: string, slot: "topId" | "bottomId" | "hairFrontId") {
  const roomId = DEFAULT_AVATAR_ROOM_PROJECTION_MAP[id]?.[slot]
  const roomItem = ROOM_AVATAR_CATALOG.find(x => x.id === roomId)
  assert.ok(roomItem && existsSync(String(roomItem.asset.source)), id)
}

const RETIRED_ITEM_IDS = [
  "avatar_v2_hair_male_espresso_crop",
  "avatar_v2_hair_male_controlled_modern_mullet",
  "avatar_v2_hair_male_copper_compact_quiff",
  "avatar_v2_top_male_charcoal_leather_bomber_hybrid",
  "avatar_v2_bottom_male_straight_utility_tailored_trousers",
  "avatar_v2_top_male_midnight_relaxed_tailoring_jacket",
  "avatar_v2_top_male_warm_sand_deconstructed_jacket",
  "avatar_v2_bottom_male_warm_sand_deconstructed_trousers",
  "avatar_v2_top_male_acid_washed_boxy_sweatshirt",
  "avatar_v2_top_male_dusty_blue_weekend_crew_sweatshirt",
  "avatar_v2_top_male_modern_track_luxury_top",
  "avatar_v2_top_male_cocoa_sage_canvas_shacket",
  "avatar_v2_bottom_male_modern_track_luxury_bottom",
  "avatar_v2_bottom_male_contemporary_resort_street_bottom",
  "avatar_v2_top_male_striped_chunky_cardigan",
  "avatar_v2_top_male_colorblock_rugby_polo",
  "avatar_v2_top_male_soft_varsity_knit_jacket",
  "avatar_v2_top_male_soft_panel_overshirt_bomber",
  "avatar_v2_top_lilac_cloud_wrap_top",
  "avatar_v2_top_cherry_varsity_cardigan",
  "avatar_v2_bottom_midnight_ribbon_wide_leg_pants",
  "avatar_v2_bottom_buttercream_pearl_tailored_pants",
  "avatar_v2_top_blush_lace_cardigan",
  "avatar_v2_top_noir_rose_heart_cardigan",
  "avatar_v2_top_ivory_tweed_crop_jacket",
  "avatar_v2_top_midnight_velvet_bolero"
] as const

test("retired wardrobe entries preserve IDs but cannot be browsed or equipped even when owned", () => {
  assert.equal(RETIRED_AVATAR_ITEM_IDS.size, RETIRED_ITEM_IDS.length)
  for (const id of RETIRED_ITEM_IDS) {
    const item = AVATAR_V2_CATALOG.find(x => x.id === id)
    assert.ok(item, id)
    assert.equal(item.hiddenFromShop, true, id)
    assert.equal(item.hiddenFromWardrobe, true, id)
    const starter = id.includes("_male_") ? DEFAULT_MALE_AVATAR_LOADOUT : DEFAULT_FEMALE_AVATAR_LOADOUT
    assert.equal(canEquipAvatarV2Item({ ownedItemIds: [id] }, item, starter.bodyId), false, id)
    const slot = item.type === "hair" ? "hairId" : item.type === "bottom" ? "bottomId" : "topId"
    const result = resolveAvatarV2({ ...starter, accessoryIds: [...starter.accessoryIds], [slot]: id })
    assert.equal(result[slot], starter[slot], id)
    assertRoomAssetExists(id, slot === "hairId" ? "hairFrontId" : slot)
  }
})

test("the six explicitly retained products remain available with their original asset files", () => {
  for (const id of [
    "avatar_v2_top_male_pixel_heart_boxy_tee",
    "avatar_v2_bottom_male_washed_baggy_denim",
    "avatar_v2_bottom_male_technical_sport_shorts",
    "avatar_v2_bottom_male_refined_utility_cargo_shorts",
    "avatar_v2_bottom_male_relaxed_tailored_shorts",
    "avatar_v2_bottom_male_sage_cuffed_shorts"
  ]) {
    assert.equal(RETIRED_AVATAR_ITEM_IDS.has(id), false)
    const item = AVATAR_V2_CATALOG.find(x => x.id === id)
    assert.ok(item)
    // Sage shorts are an existing free wardrobe-only starter, not a paid shop row.
    assert.equal(item.hiddenFromShop === true, id === "avatar_v2_bottom_male_sage_cuffed_shorts")
    assert.notEqual(item.hiddenFromWardrobe, true)
    assert.equal(canEquipAvatarV2Item({ ownedItemIds: [id] }, item, DEFAULT_MALE_AVATAR_LOADOUT.bodyId), true)
    assertRoomAssetExists(id, item.type === "bottom" ? "bottomId" : "topId")
  }
})
