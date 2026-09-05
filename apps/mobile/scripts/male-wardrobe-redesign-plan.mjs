const REQUIRED_STATES = Object.freeze([
  "static",
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01",
])

const CANDIDATE_ROOT =
  "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/candidates"

const groups = Object.freeze([
  ["top", "tshirt_closed_crew", [
    "cream_basic_tee",
    "powder_blue_crew_tee",
    "sage_basic_tee",
    "dusty_navy_tee",
    "pixel_heart_boxy_tee",
  ]],
  ["top", "shirt_open_camp_collar", [
    "mist_blue_oxford_shirt",
    "soft_sage_linen_shirt",
    "tonal_geometric_camp_collar_shirt",
    "abstract_resort_shirt",
    "contemporary_resort_street_top",
  ]],
  ["top", "polo_placket_opening", [
    "textured_knit_polo",
    "colorblock_rugby_polo",
  ]],
  ["top", "hoodie_or_sweat_closed_neck", [
    "acid_washed_boxy_sweatshirt",
    {
      slug: "dusty_blue_weekend_crew_sweatshirt",
      replacesRuntimeFilename:
        "avatar_room_top_male_diagonal_seam_zip_mock_neck_v1.png",
    },
    "modern_track_luxury_top",
  ]],
  ["top", "jacket_open_lapel", [
    "dusty_navy_chore_jacket",
    "midnight_relaxed_tailoring_jacket",
    "warm_sand_deconstructed_jacket",
    "monochrome_street_tailoring_top",
    "creative_utility_top",
    "striped_chunky_cardigan",
    {
      slug: "cocoa_sage_canvas_shacket",
      replacesRuntimeFilename:
        "avatar_room_top_male_cropped_cocoa_moto_jacket_v1.png",
    },
  ]],
  ["top", "jacket_closed_high_neck", [
    "cocoa_varsity_jacket",
    "asymmetric_utility_overshirt",
    "charcoal_leather_bomber_hybrid",
    "soft_varsity_knit_jacket",
    "soft_panel_overshirt_bomber",
  ]],
  ["bottom", "male_slim_tapered", [
    "charcoal_tapered_chinos",
  ]],
  ["bottom", "male_straight", [
    "navy_straight_pants",
    "mid_blue_straight_jeans",
    "straight_utility_tailored_trousers",
    "warm_sand_deconstructed_trousers",
  ]],
  ["bottom", "male_relaxed_baggy", [
    "warm_sand_relaxed_pants",
    "wide_pleated_technical_trousers",
    "midnight_relaxed_tailoring_trousers",
    "monochrome_street_tailoring_bottom",
    "contemporary_resort_street_bottom",
    "washed_baggy_denim",
  ]],
  ["bottom", "male_cargo_parachute_track", [
    "creative_utility_bottom",
    "modern_track_luxury_bottom",
    "soft_parachute_cargo_pants",
    "colorblock_nylon_track_pants",
  ]],
  ["bottom", "male_shorts", [
    "sage_cuffed_shorts",
    "relaxed_tailored_shorts",
    "refined_utility_cargo_shorts",
    "technical_sport_shorts",
  ]],
  ["shoes", "court_trainer", [
    "milk_tea_court",
    "cloud_white_trainers",
  ]],
  ["shoes", "canvas_skate", [
    "dusty_blue_canvas_sneakers",
    "chunky_skate_sneakers",
  ]],
  ["shoes", "loafer_mule", [
    "cocoa_penny_loafers",
    "suede_penny_mules",
  ]],
  ["shoes", "runner_trail", [
    "retro_colorblock_runner",
    "lightweight_trail_sneakers",
  ]],
])

const item = (category, family, entry) => {
  const { slug, replacesRuntimeFilename } =
    typeof entry === "string" ? { slug: entry } : entry
  const candidateRoot = `${CANDIDATE_ROOT}/${category}/${slug}`
  return Object.freeze({
    assetId: `blumi-male-${category}-${slug}-v0.1`,
    category,
    slug,
    family,
    runtimeFilename: `avatar_room_${category}_male_${slug}_v1.png`,
    ...(replacesRuntimeFilename ? { replacesRuntimeFilename } : {}),
    candidateRoot,
    candidatePaths: Object.freeze(
      Object.fromEntries(REQUIRED_STATES.map((state) => [state, `${candidateRoot}/${state}.png`])),
    ),
    requiredStates: REQUIRED_STATES,
    rigStates: Object.freeze(
      Object.fromEntries(REQUIRED_STATES.map((state) => [state, Object.freeze({ status: "PENDING" })])),
    ),
    independentReview: Object.freeze({ status: "PENDING" }),
    status: "planned",
    userApproved: false,
    runtimePromoted: false,
  })
}

export const MALE_WARDROBE_REDESIGN_ITEMS = Object.freeze(
  groups.flatMap(([category, family, entries]) =>
    entries.map((entry) => item(category, family, entry)),
  ),
)

export const MALE_WARDROBE_REDESIGN_PLAN = Object.freeze({
  schemaVersion: 1,
  projectId: "blumi-male-wardrobe-redesign-2026-07-27",
  rigId: "blumi_2_5d_layered_v1",
  fitProfileId: "blumi_male_room_avatar_v1",
  canonicalBase:
    "apps/mobile/src/features/avatarV2/assets/room/avatar_room_base_male_light_v1.png",
  canvas: Object.freeze({ width: 256, height: 384, format: "RGBA" }),
  premiumMaster: Object.freeze({ width: 1024, height: 1536 }),
  motionMethod: "approved-static-seed-strip-first",
  promotionEligible: false,
  liveCatalogPromoted: false,
  runtimePromotionAllowed: false,
  userApprovalRequired: true,
  board: Object.freeze({ rows: 6, columns: 9, itemCount: 54 }),
  stopRules: Object.freeze([
    "canonical_identity_drift",
    "rear_collar_or_cropped_collar",
    "pasted_or_warped_fit",
    "waist_double_edge",
    "crotch_or_inner_gap_tear",
    "unnatural_hem_shoe_contact",
    "alpha_halo_or_detached_island",
    "missing_independent_visual_review",
  ]),
})
