import {
  resolvePromotedUniversalCoreRoomEconomyItems,
  UNIVERSAL_CORE_ROOM_PROMOTION_RECORD,
  type UniversalCoreRoomPromotionRecord
} from "./universalCoreRoomEconomy"

export type EconomyItemType = "avatar" | "room"

export interface EconomyCatalogItem {
  readonly itemId: string
  readonly type: EconomyItemType
  readonly title: string
  readonly priceCoins: number
  readonly ownedByDefault?: boolean
  readonly grantedItemIds?: readonly string[]
}

export const STARTER_COIN_BALANCE = 1250

const avatarItem = (
  itemId: string,
  title: string,
  priceCoins: number,
  ownedByDefault = false,
  grantedItemIds: readonly string[] = []
): EconomyCatalogItem => ({
  itemId,
  type: "avatar",
  title,
  priceCoins,
  ...(ownedByDefault ? { ownedByDefault: true } : {}),
  ...(grantedItemIds.length > 0 ? { grantedItemIds: [...grantedItemIds] } : {})
})

const roomItem = (
  itemId: string,
  title: string,
  priceCoins: number,
  ownedByDefault = false
): EconomyCatalogItem => ({
  itemId,
  type: "room",
  title,
  priceCoins,
  ...(ownedByDefault ? { ownedByDefault: true } : {})
})

const BASE_ECONOMY_CATALOG: readonly EconomyCatalogItem[] = [
  avatarItem("avatar_v2_body_default", "Warm Base", 0, true),
  avatarItem("avatar_v2_body_male_light", "Masculine Light Base", 0, true),
  avatarItem("avatar_v2_face_male_warm_friendly", "Warm Friendly Face", 0, true),
  avatarItem("avatar_v2_eyes_male_warm_brown", "Warm Brown Eyes", 0, true),
  avatarItem("avatar_v2_nose_male_gentle_bridge", "Gentle Bridge", 0, true),
  avatarItem("avatar_v2_mouth_male_soft_smile", "Soft Smile", 0, true),
  avatarItem("avatar_v2_hair_male_espresso_crop", "Espresso Crop", 0, true),
  avatarItem("avatar_v2_hair_male_cocoa_textured_quiff", "Cocoa Textured Quiff", 0, true),
  avatarItem("avatar_v2_hair_male_soft_black_side_part", "Soft Black Side Part", 0, true),
  avatarItem("avatar_v2_hair_male_chestnut_short_waves", "Chestnut Short Waves", 0, true),
  avatarItem("avatar_v2_top_male_cream_basic_tee", "Cream Basic Tee", 0, true),
  avatarItem(
    "avatar_v2_top_male_powder_blue_crew_tee",
    "Powder Blue Basic Crew Tee",
    0,
    true
  ),
  avatarItem("avatar_v2_top_male_sage_basic_tee", "Sage Basic Tee", 0, true),
  avatarItem("avatar_v2_top_male_dusty_navy_tee", "Dusty Navy Tee", 0, true),
  avatarItem("avatar_v2_top_male_mist_blue_oxford_shirt", "Mist Blue Oxford Shirt", 0, true),
  avatarItem("avatar_v2_top_male_soft_sage_linen_shirt", "Soft Sage Linen Shirt", 0, true),
  avatarItem("avatar_v2_top_male_cocoa_varsity_jacket", "Cocoa Varsity Jacket", 0, true),
  avatarItem("avatar_v2_top_male_dusty_navy_chore_jacket", "Dusty Navy Chore Jacket", 0, true),
  avatarItem("avatar_v2_bottom_male_sage_cuffed_shorts", "Sage Cuffed Shorts", 0, true),
  avatarItem(
    "avatar_v2_bottom_male_navy_straight_pants",
    "Navy Basic Straight Pants",
    0,
    true
  ),
  avatarItem("avatar_v2_bottom_male_mid_blue_straight_jeans", "Mid Blue Straight Jeans", 0, true),
  avatarItem("avatar_v2_bottom_male_charcoal_tapered_chinos", "Charcoal Tapered Chinos", 0, true),
  avatarItem("avatar_v2_bottom_male_warm_sand_relaxed_pants", "Warm Sand Relaxed Pants", 0, true),
  avatarItem("avatar_v2_shoes_male_milk_tea_court", "Milk Tea Court Sneakers", 0, true),
  avatarItem("avatar_v2_shoes_male_cloud_white_trainers", "Cloud White Trainers", 0, true),
  avatarItem("avatar_v2_shoes_male_cocoa_penny_loafers", "Cocoa Penny Loafers", 0, true),
  avatarItem("avatar_v2_shoes_male_dusty_blue_canvas_sneakers", "Dusty Blue Canvas Sneakers", 0, true),
  avatarItem("avatar_v2_top_male_tonal_geometric_camp_collar_shirt", "Tonal Geometric Camp-Collar Shirt", 320),
  avatarItem("avatar_v2_bottom_male_wide_pleated_technical_trousers", "Wide Pleated Technical Trousers", 360),
  avatarItem("avatar_v2_top_male_midnight_relaxed_tailoring_jacket", "Midnight Relaxed Tailoring Jacket", 460),
  avatarItem("avatar_v2_bottom_male_midnight_relaxed_tailoring_trousers", "Midnight Relaxed Tailoring Trousers", 390),
  avatarItem("avatar_v2_top_male_acid_washed_boxy_sweatshirt", "Acid-Washed Boxy Sweatshirt", 340),
  avatarItem("avatar_v2_top_male_dusty_blue_weekend_crew_sweatshirt", "Dusty Blue Weekend Crew Sweatshirt", 360),
  avatarItem("avatar_v2_top_male_modern_track_luxury_top", "Modern Track-Luxury Top", 380),
  avatarItem("avatar_v2_top_male_cocoa_sage_canvas_shacket", "Cocoa Sage Canvas Shacket", 380),
  avatarItem("avatar_v2_hair_male_soft_textured_crop", "Soft Textured Crop", 260),
  avatarItem("avatar_v2_top_male_asymmetric_utility_overshirt", "Asymmetric Utility Overshirt", 390),
  avatarItem("avatar_v2_top_male_abstract_resort_shirt", "Abstract Resort Shirt", 350),
  avatarItem("avatar_v2_top_male_charcoal_leather_bomber_hybrid", "Charcoal Leather Bomber Hybrid", 510),
  avatarItem("avatar_v2_bottom_male_straight_utility_tailored_trousers", "Straight Utility-Tailored Trousers", 370),
  avatarItem("avatar_v2_top_male_warm_sand_deconstructed_jacket", "Warm Sand Deconstructed Jacket", 450),
  avatarItem("avatar_v2_bottom_male_warm_sand_deconstructed_trousers", "Warm Sand Deconstructed Trousers", 380),
  avatarItem("avatar_v2_top_male_textured_knit_polo", "Textured Knit Polo", 350),
  avatarItem("avatar_v2_top_male_monochrome_street_tailoring_top", "Monochrome Street Tailoring Top", 430),
  avatarItem("avatar_v2_bottom_male_monochrome_street_tailoring_bottom", "Monochrome Street Tailoring Trousers", 380),
  avatarItem("avatar_v2_bottom_male_modern_track_luxury_bottom", "Modern Track-Luxury Trousers", 370),
  avatarItem("avatar_v2_top_male_contemporary_resort_street_top", "Contemporary Resort-Street Top", 360),
  avatarItem("avatar_v2_bottom_male_contemporary_resort_street_bottom", "Contemporary Resort-Street Fluid Bottom", 350),
  avatarItem("avatar_v2_top_male_creative_utility_top", "Creative Utility Overshirt", 400),
  avatarItem("avatar_v2_bottom_male_creative_utility_bottom", "Creative Utility Trousers", 370),
  avatarItem("avatar_v2_bottom_male_relaxed_tailored_shorts", "Relaxed Tailored Shorts", 300),
  avatarItem("avatar_v2_bottom_male_refined_utility_cargo_shorts", "Refined Utility Cargo Shorts", 320),
  avatarItem("avatar_v2_bottom_male_technical_sport_shorts", "Premium Technical Sport Shorts", 330),
  avatarItem("avatar_v2_hair_male_controlled_modern_mullet", "Controlled Modern Mullet", 290),
  avatarItem("avatar_v2_hair_male_voluminous_wavy_quiff", "Voluminous Wavy Quiff", 300),
  avatarItem("avatar_v2_hair_male_short_twists_textured_style", "Short Twists Textured Style", 310),
  avatarItem("avatar_v2_shoes_male_retro_colorblock_runner", "Retro Color-Block Runner", 340),
  avatarItem("avatar_v2_shoes_male_chunky_skate_sneakers", "Chunky Skate Sneakers", 360),
  avatarItem("avatar_v2_shoes_male_suede_penny_mules", "Suede Penny Mules", 330),
  avatarItem("avatar_v2_shoes_male_lightweight_trail_sneakers", "Lightweight Trail Sneakers", 350),
  avatarItem("avatar_v2_accessory_male_soft_patch_beanie", "Soft Patch Beanie", 190),
  avatarItem("avatar_v2_accessory_male_nylon_crossbody_bag", "Nylon Crossbody Bag", 280),
  avatarItem("avatar_v2_accessory_male_beaded_charm_necklace", "Beaded Charm Necklace", 210),
  avatarItem("avatar_v2_hair_male_copper_compact_quiff", "Copper Compact Quiff", 320),
  avatarItem("avatar_v2_hair_male_ash_blond_low_fade_crop", "Ash-Blond Low-Fade Crop", 320),
  avatarItem("avatar_v2_hair_male_blue_black_short_curls", "Blue-Black Short Curls", 330),
  avatarItem("avatar_v2_accessory_male_tortoiseshell_smoke_sunglasses", "Tortoiseshell Smoke Sunglasses", 280),
  avatarItem("avatar_v2_accessory_male_matte_black_panto_sunglasses", "Matte Black Panto Sunglasses", 290),
  avatarItem("avatar_v2_bottom_male_washed_baggy_denim", "Washed Baggy Denim", 360),
  avatarItem("avatar_v2_bottom_male_soft_parachute_cargo_pants", "Soft Parachute Cargo Pants", 390),
  avatarItem("avatar_v2_bottom_male_colorblock_nylon_track_pants", "Color-Block Nylon Track Pants", 370),
  avatarItem("avatar_v2_top_male_striped_chunky_cardigan", "Striped Chunky Cardigan", 400),
  avatarItem("avatar_v2_top_male_colorblock_rugby_polo", "Color-Block Rugby Polo", 370),
  avatarItem("avatar_v2_top_male_pixel_heart_boxy_tee", "Pixel Heart Boxy Tee", 300),
  avatarItem("avatar_v2_top_male_soft_varsity_knit_jacket", "Soft Varsity Knit Jacket", 430),
  avatarItem("avatar_v2_top_male_soft_panel_overshirt_bomber", "Soft Panel Overshirt Bomber", 460),
  avatarItem("avatar_v2_face_default", "Soft Doll Face Foundation", 0, true),
  avatarItem("avatar_v2_face_warm_peach_foundation", "Warm Peach Face Foundation", 0, true),
  avatarItem("avatar_v2_face_rose_heart_foundation", "Rose Heart Face Foundation", 0, true),
  avatarItem("avatar_v2_eyes_mocha_doe", "Mocha Doe Eyes", 0, true),
  avatarItem("avatar_v2_nose_soft_button", "Soft Button Nose", 0, true),
  avatarItem(
    "avatar_v2_mouth_peach_whisper_smile",
    "Peach Whisper Smile",
    0,
    true
  ),
  avatarItem(
    "avatar_v2_hair_mocha_ribbon_blowout",
    "Mocha Ribbon Blowout",
    0,
    true
  ),
  avatarItem("avatar_v2_top_default", "Basic Tee", 0, true),
  avatarItem("avatar_v2_bottom_default", "Classic Shorts", 0, true),
  avatarItem(
    "avatar_v2_shoes_milk_tea_court_sneakers",
    "Milk Tea Court Sneakers",
    0,
    true
  ),
  avatarItem(
    "avatar_v2_accessory_ivory_ribbon_beret",
    "Ivory Ribbon Beret",
    0,
    true
  ),

  avatarItem("avatar_v2_eyes_sage_glass", "Sage Glass Eyes", 0, true),
  avatarItem("avatar_v2_eyes_twilight_plum", "Twilight Plum Eyes", 0, true),
  avatarItem("avatar_v2_eyes_hazel_almond_doe", "Hazel Almond Doe Eyes", 0, true),
  avatarItem("avatar_v2_eyes_deep_brown_star", "Deep Brown Star Eyes", 0, true),
  avatarItem("avatar_v2_eyes_cocoa_puppy", "Cocoa Puppy Eyes", 0, true),
  avatarItem("avatar_v2_eyes_honey_amber", "Honey Amber Eyes", 0, true),
  avatarItem("avatar_v2_eyes_chestnut_luminous", "Luminous Chestnut Eyes", 0, true),
  avatarItem("avatar_v2_nose_petal_curve", "Petal Curve Nose", 0, true),
  avatarItem("avatar_v2_nose_gentle_bridge", "Gentle Bridge Nose", 0, true),
  avatarItem("avatar_v2_nose_tiny_upturned", "Tiny Upturned Nose", 0, true),
  avatarItem("avatar_v2_nose_petite_rounded", "Petite Rounded Nose", 0, true),
  avatarItem("avatar_v2_nose_heart_tip", "Soft Heart-Tip Nose", 0, true),
  avatarItem("avatar_v2_nose_narrow_button", "Narrow Button Nose", 0, true),
  avatarItem("avatar_v2_nose_sculpted_doll", "Sculpted Doll Nose", 0, true),
  avatarItem("avatar_v2_mouth_rose_gloss_smile", "Rose Gloss Smile", 0, true),
  avatarItem("avatar_v2_mouth_berry_soft_kiss", "Berry Soft Kiss", 0, true),
  avatarItem("avatar_v2_mouth_coral_bow_smile", "Coral Bow Smile", 0, true),
  avatarItem("avatar_v2_mouth_nude_pink_whisper", "Nude Pink Whisper", 0, true),
  avatarItem("avatar_v2_mouth_cherry_balm_smile", "Cherry Balm Smile", 0, true),
  avatarItem("avatar_v2_mouth_soft_mauve_smile", "Soft Mauve Smile", 0, true),
  avatarItem(
    "avatar_v2_mouth_rosewater_cupid_bow",
    "Rosewater Cupid Bow",
    0,
    true
  ),
  avatarItem("avatar_v2_hair_midnight_french_bob", "Midnight French Bob", 0, true),
  avatarItem(
    "avatar_v2_hair_honey_halfup_waves",
    "Golden Blonde Half-Up Waves",
    360
  ),
  avatarItem(
    "avatar_v2_hair_cherry_ribbon_twin_braids",
    "Cherry Ribbon Twin Braids",
    380
  ),
  avatarItem(
    "avatar_v2_hair_rosewood_butterfly_layers",
    "Rosewood Butterfly Layers",
    410
  ),
  avatarItem(
    "avatar_v2_hair_caramel_braided_crown",
    "Caramel Braided Crown",
    420
  ),
  avatarItem(
    "avatar_v2_hair_berry_velvet_soft_updo",
    "Berry Velvet Soft Updo",
    430
  ),
  avatarItem("avatar_v2_hair_chestnut_butterfly_bob", "Chestnut Butterfly Bob", 440),
  avatarItem("avatar_v2_hair_golden_waves", "Golden Waves", 450),
  avatarItem("avatar_v2_hair_ink_pageboy_star", "Ink Pageboy Star", 460),
  avatarItem("avatar_v2_hair_ink_twin_braids", "Ink Twin Braids", 470),
  avatarItem("avatar_v2_hair_pale_golden_bow_bob", "Pale Golden Bow Bob", 480),
  avatarItem("avatar_v2_hair_copper_bow_waves", "Copper Bow Waves", 490),
  avatarItem("avatar_v2_shoes_cherry_satin_ballets", "Cherry Satin Ballets", 260),
  avatarItem(
    "avatar_v2_shoes_onyx_heart_mary_janes",
    "Onyx Heart Mary Janes",
    280
  ),
  avatarItem(
    "avatar_v2_shoes_rosewood_platform_loafers",
    "Rosewood Platform Loafers",
    320
  ),
  avatarItem(
    "avatar_v2_shoes_pearl_slingback_sandals",
    "Pearl Slingback Sandals",
    300
  ),
  avatarItem(
    "avatar_v2_accessory_cherry_bow_headband",
    "Cherry Bow Headband",
    220
  ),
  avatarItem(
    "avatar_v2_accessory_sage_heart_glasses",
    "Sage Heart Glasses",
    210
  ),
  avatarItem("avatar_v2_accessory_rose_round_glasses", "Rose Round Glasses", 220),
  avatarItem(
    "avatar_v2_accessory_lavender_pearl_cat_eye_glasses",
    "Lavender Pearl Cat-Eye Glasses",
    230
  ),
  avatarItem("avatar_v2_accessory_mint_star_oval_glasses", "Mint Star Oval Glasses", 230),
  avatarItem(
    "avatar_v2_accessory_honey_blossom_square_glasses",
    "Honey Blossom Square Glasses",
    240
  ),
  avatarItem(
    "avatar_v2_accessory_pearl_drop_earrings",
    "Pearl Drop Earrings",
    190
  ),
  avatarItem(
    "avatar_v2_accessory_golden_heart_locket",
    "Golden Heart Locket",
    180
  ),
  avatarItem(
    "avatar_v2_accessory_buttercream_neck_scarf",
    "Buttercream Neck Scarf",
    170
  ),
  avatarItem(
    "avatar_v2_accessory_cherry_micro_bag",
    "Cherry Micro Bag",
    300
  ),
  avatarItem(
    "avatar_v2_accessory_sunny_star_clips",
    "Sunny Star Clips",
    150
  ),
  avatarItem("avatar_v2_top_blush_lace_cardigan", "Blush Lace Cardigan", 390),
  avatarItem(
    "avatar_v2_top_sage_ribbon_knit_jacket",
    "Sage Ribbon Knit Jacket",
    410
  ),
  avatarItem(
    "avatar_v2_top_cherry_heart_milkmaid_blouse",
    "Cherry Heart Milkmaid Blouse",
    430
  ),
  avatarItem(
    "avatar_v2_top_powder_blue_ribbon_corset_top",
    "Powder Blue Ribbon Corset Top",
    400
  ),
  avatarItem(
    "avatar_v2_top_noir_rose_heart_cardigan",
    "Noir Rose Heart Cardigan",
    440
  ),
  avatarItem(
    "avatar_v2_bottom_striped_crochet_shorts",
    "Striped Crochet Shorts",
    320
  ),
  avatarItem(
    "avatar_v2_bottom_layered_lace_ruffle_mini_skirt",
    "Layered Lace Ruffle Mini Skirt",
    360
  ),
  avatarItem(
    "avatar_v2_bottom_black_palm_embellished_pants",
    "Black Palm Pants",
    420
  ),
  avatarItem(
    "avatar_v2_bottom_coral_embellished_laceup_pants",
    "Coral Lace-Up Pants",
    430
  ),
  avatarItem(
    "avatar_v2_bottom_smoky_floral_mesh_pants",
    "Smoky Floral Mesh Pants",
    410
  ),
  avatarItem(
    "avatar_v2_bottom_yellow_bow_lace_ruffle_skirt",
    "Yellow Bow Lace Ruffle Skirt",
    370
  ),
  avatarItem(
    "avatar_v2_top_boho_patchwork_maxi_dress",
    "Boho Patchwork Maxi Dress",
    430,
    false,
    ["avatar_v2_bottom_boho_patchwork_maxi_dress"]
  ),
  avatarItem(
    "avatar_v2_top_embroidered_halter_wrap_dress",
    "Embroidered Halter Wrap Dress",
    420,
    false,
    ["avatar_v2_bottom_embroidered_halter_wrap_dress"]
  ),
  avatarItem(
    "avatar_v2_top_ruched_patchwork_mini_dress",
    "Ruched Patchwork Mini Dress",
    400,
    false,
    ["avatar_v2_bottom_ruched_patchwork_mini_dress"]
  ),
  avatarItem(
    "avatar_v2_top_white_lace_cami_mini_dress",
    "White Lace Cami Mini Dress",
    390,
    false,
    ["avatar_v2_bottom_white_lace_cami_mini_dress"]
  ),

  avatarItem("avatar_v2_top_rosebud_picnic_peplum", "Rosebud Picnic Peplum", 80),
  avatarItem("avatar_v2_top_lilac_cloud_wrap_top", "Lilac Cloud Wrap Top", 75),
  avatarItem("avatar_v2_top_buttercream_bow_tee", "Buttercream Bow Tee", 0, true),
  avatarItem("avatar_v2_top_azure_garden_halter", "Azure Garden Halter", 85),
  avatarItem("avatar_v2_top_ivory_tweed_crop_jacket", "Ivory Tweed Crop Jacket", 130),
  avatarItem("avatar_v2_top_cherry_varsity_cardigan", "Cherry Picnic Cardigan", 120),
  avatarItem("avatar_v2_top_midnight_velvet_bolero", "Midnight Velvet Bolero", 140),
  avatarItem("avatar_v2_bottom_midnight_ribbon_wide_leg_pants", "Midnight Ribbon Wide-Leg Pants", 460),
  avatarItem("avatar_v2_bottom_buttercream_pearl_tailored_pants", "Buttercream Pearl Tailored Pants", 440),
  avatarItem("avatar_v2_bottom_rose_picnic_pleated_shorts", "Rose Picnic Pleated Shorts", 360),
  avatarItem("avatar_v2_bottom_lavender_bow_twill_shorts", "Lavender Bow Twill Shorts", 0, true),
  avatarItem("avatar_v2_shoes_rose_satin_bow_heels", "Rose Satin Bow Heels", 520),
  avatarItem("avatar_v2_shoes_ivory_pearl_slingback_heels", "Ivory Pearl Slingback Heels", 500),
  avatarItem("avatar_v2_shoes_lilac_star_platform_sneakers", "Lilac Star Platform Sneakers", 480),
  avatarItem("avatar_v2_shoes_mint_ribbon_court_sneakers", "Mint Ribbon Court Sneakers", 0, true),
  avatarItem("avatar_v2_top_rose_ribbon_tea_dress", "Rose Ribbon Tea Dress", 190, false, ["avatar_v2_bottom_rose_ribbon_tea_dress"]),
  avatarItem("avatar_v2_top_moonlit_velvet_ballet_dress", "Moonlit Velvet Ballet Dress", 220, false, ["avatar_v2_bottom_moonlit_velvet_ballet_dress"]),
  avatarItem("avatar_v2_top_buttercup_picnic_pinafore_dress", "Buttercup Picnic Pinafore Dress", 180, false, ["avatar_v2_bottom_buttercup_picnic_pinafore_dress"]),
  avatarItem("avatar_v2_top_lavender_garden_ribbon_dress", "Lavender Garden Ribbon Dress", 200, false, ["avatar_v2_bottom_lavender_garden_ribbon_dress"]),

  roomItem("room_v2_chair_blush", "Blush Lounge Chair", 0),
  roomItem("room_v2_table_round", "Cozy Round Table", 0),
  roomItem("room_v2_lamp_heart", "Heart Glow Lamp", 0),
  roomItem("room_v2_heart_rug", "Heart Cloud Rug", 0),
  roomItem("room_v2_cozy_bed", "Pink Cloud Bed", 0, true),
  roomItem("room_v2_cute_bookshelf", "Cozy Bookshelf", 360),
  roomItem("room_v2_side_table", "Petal Side Table", 240)
]

export function resolveEconomyCatalog(
  record: UniversalCoreRoomPromotionRecord | null =
    UNIVERSAL_CORE_ROOM_PROMOTION_RECORD
): EconomyCatalogItem[] {
  return [
    ...BASE_ECONOMY_CATALOG,
    ...resolvePromotedUniversalCoreRoomEconomyItems(record)
  ].map(cloneEconomyCatalogItem)
}

export const ECONOMY_CATALOG: readonly EconomyCatalogItem[] =
  resolveEconomyCatalog()

export function findEconomyCatalogItem(
  itemId: string,
  type: EconomyItemType,
  catalog: readonly EconomyCatalogItem[] = ECONOMY_CATALOG
): EconomyCatalogItem | null {
  return (
    catalog.find((item) => item.itemId === itemId && item.type === type) ??
    null
  )
}

export function getDefaultOwnedItemIds(
  type: EconomyItemType,
  catalog: readonly EconomyCatalogItem[] = ECONOMY_CATALOG
): string[] {
  return catalog
    .filter((item) => item.type === type && item.ownedByDefault === true)
    .map((item) => item.itemId)
}

function cloneEconomyCatalogItem(item: EconomyCatalogItem): EconomyCatalogItem {
  return {
    ...item,
    grantedItemIds: item.grantedItemIds ? [...item.grantedItemIds] : undefined
  }
}

export const LEGACY_AVATAR_ITEM_REPLACEMENTS: Readonly<Record<string, string>> = {
  avatar_v2_top_locked_luxe: "avatar_v2_top_noir_rose_heart_cardigan",
  avatar_v2_top_lilac_offshoulder_bow_blouse:
    "avatar_v2_top_powder_blue_ribbon_corset_top",
  avatar_v2_bottom_floral_embroidered_skort_shorts:
    "avatar_v2_bottom_layered_lace_ruffle_mini_skirt",
  avatar_v2_top_silver_sequin_halter_top:
    "avatar_v2_top_sage_ribbon_knit_jacket",
  avatar_v2_bottom_pink_embellished_wide_pants:
    "avatar_v2_bottom_coral_embellished_laceup_pants",
  avatar_v2_bottom_patchwork_bow_mini_skirt:
    "avatar_v2_bottom_yellow_bow_lace_ruffle_skirt",
  avatar_v2_top_silver_lace_ruffle_dress_top:
    "avatar_v2_top_white_lace_cami_mini_dress",
  avatar_v2_bottom_silver_lace_ruffle_dress_bottom:
    "avatar_v2_bottom_white_lace_cami_mini_dress",
  avatar_v2_top_red_floral_bikini_top:
    "avatar_v2_top_cherry_heart_milkmaid_blouse",
  avatar_v2_bottom_white_embellished_wide_pants:
    "avatar_v2_bottom_smoky_floral_mesh_pants"
}

export function getLegacyAvatarReplacementIds(
  ownedItemIds: readonly string[]
): string[] {
  return ownedItemIds.reduce<string[]>((replacementIds, itemId) => {
    const replacementId = LEGACY_AVATAR_ITEM_REPLACEMENTS[itemId]
    if (!replacementId || replacementIds.includes(replacementId)) {
      return replacementIds
    }
    return [...replacementIds, replacementId]
  }, [])
}
