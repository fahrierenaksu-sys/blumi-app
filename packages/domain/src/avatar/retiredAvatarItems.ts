/** Stable IDs remain in purchase history, but these assets are not fit to render or sell. */
export const RETIRED_AVATAR_ITEM_IDS = new Set<string>([
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
])

export function isRetiredAvatarItemId(itemId: string): boolean {
  return RETIRED_AVATAR_ITEM_IDS.has(itemId)
}
