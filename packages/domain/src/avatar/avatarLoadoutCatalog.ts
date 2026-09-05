import type {
  AvatarLoadout,
  AvatarLoadoutV1,
} from "@blumi/contracts";

export type AvatarLoadoutSlot =
  | "body"
  | "face"
  | "eyes"
  | "nose"
  | "mouth"
  | "hair"
  | "top"
  | "bottom"
  | "shoes"
  | "outerwear"
  | "accessory";

export type AvatarAccessoryGroup =
  "headwear" | "eyewear" | "earrings" | "neck" | "bag" | "hairClip";

export interface AvatarLoadoutCatalogItem {
  readonly itemId: string;
  readonly slot: AvatarLoadoutSlot;
  readonly accessoryGroup?: AvatarAccessoryGroup;
  readonly outfitKey?: string;
  readonly pairedItemId?: string;
  readonly supportedBodyIds: readonly string[];
}

export type ReadonlyAvatarLoadout<
  Loadout extends AvatarLoadout = AvatarLoadout,
> = Loadout extends AvatarLoadout
  ? Readonly<
      Omit<Loadout, "accessoryIds"> & {
        readonly accessoryIds: readonly string[];
      }
    >
  : never;

const slotItems = (
  slot: Exclude<AvatarLoadoutSlot, "accessory">,
  itemIds: readonly string[],
  supportedBodyIds: readonly string[] = ["avatar_v2_body_default"],
): AvatarLoadoutCatalogItem[] =>
  itemIds.map((itemId) => ({ itemId, slot, supportedBodyIds }));

const accessoryItem = (
  itemId: string,
  accessoryGroup: AvatarAccessoryGroup,
  supportedBodyIds: readonly string[] = ["avatar_v2_body_default"],
): AvatarLoadoutCatalogItem => ({
  itemId,
  slot: "accessory",
  accessoryGroup,
  supportedBodyIds,
});

const outfitItems = (
  outfitKey: string,
  topId: string,
  bottomId: string,
): AvatarLoadoutCatalogItem[] => [
  {
    itemId: topId,
    slot: "top",
    outfitKey,
    pairedItemId: bottomId,
    supportedBodyIds: ["avatar_v2_body_default"],
  },
  {
    itemId: bottomId,
    slot: "bottom",
    outfitKey,
    pairedItemId: topId,
    supportedBodyIds: ["avatar_v2_body_default"],
  },
];

export const AVATAR_LOADOUT_CATALOG: readonly AvatarLoadoutCatalogItem[] =
  freezeCatalog([
    ...slotItems("body", ["avatar_v2_body_default"]),
    ...slotItems(
      "body",
      ["avatar_v2_body_male_light"],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems("face", [
      "avatar_v2_face_default",
      "avatar_v2_face_warm_peach_foundation",
      "avatar_v2_face_rose_heart_foundation",
    ]),
    ...slotItems("eyes", [
      "avatar_v2_eyes_mocha_doe",
      "avatar_v2_eyes_sage_glass",
      "avatar_v2_eyes_twilight_plum",
      "avatar_v2_eyes_hazel_almond_doe",
      "avatar_v2_eyes_deep_brown_star",
      "avatar_v2_eyes_cocoa_puppy",
      "avatar_v2_eyes_honey_amber",
      "avatar_v2_eyes_chestnut_luminous",
    ]),
    ...slotItems("nose", [
      "avatar_v2_nose_soft_button",
      "avatar_v2_nose_petal_curve",
      "avatar_v2_nose_gentle_bridge",
      "avatar_v2_nose_tiny_upturned",
      "avatar_v2_nose_petite_rounded",
      "avatar_v2_nose_heart_tip",
      "avatar_v2_nose_narrow_button",
      "avatar_v2_nose_sculpted_doll",
    ]),
    ...slotItems("mouth", [
      "avatar_v2_mouth_peach_whisper_smile",
      "avatar_v2_mouth_rose_gloss_smile",
      "avatar_v2_mouth_berry_soft_kiss",
      "avatar_v2_mouth_coral_bow_smile",
      "avatar_v2_mouth_nude_pink_whisper",
      "avatar_v2_mouth_cherry_balm_smile",
      "avatar_v2_mouth_soft_mauve_smile",
      "avatar_v2_mouth_rosewater_cupid_bow",
    ]),
    ...slotItems("hair", [
      "avatar_v2_hair_mocha_ribbon_blowout",
      "avatar_v2_hair_midnight_french_bob",
      "avatar_v2_hair_honey_halfup_waves",
      "avatar_v2_hair_cherry_ribbon_twin_braids",
      "avatar_v2_hair_rosewood_butterfly_layers",
      "avatar_v2_hair_caramel_braided_crown",
      "avatar_v2_hair_berry_velvet_soft_updo",
      "avatar_v2_hair_chestnut_butterfly_bob",
      "avatar_v2_hair_golden_waves",
      "avatar_v2_hair_ink_pageboy_star",
      "avatar_v2_hair_ink_twin_braids",
      "avatar_v2_hair_pale_golden_bow_bob",
      "avatar_v2_hair_copper_bow_waves",
    ]),
    ...slotItems("top", [
      "avatar_v2_top_default",
      "avatar_v2_top_blush_lace_cardigan",
      "avatar_v2_top_sage_ribbon_knit_jacket",
      "avatar_v2_top_cherry_heart_milkmaid_blouse",
      "avatar_v2_top_powder_blue_ribbon_corset_top",
      "avatar_v2_top_noir_rose_heart_cardigan",
      "avatar_v2_top_rosebud_picnic_peplum",
      "avatar_v2_top_lilac_cloud_wrap_top",
      "avatar_v2_top_buttercream_bow_tee",
      "avatar_v2_top_azure_garden_halter",
      "avatar_v2_top_ivory_tweed_crop_jacket",
      "avatar_v2_top_cherry_varsity_cardigan",
      "avatar_v2_top_midnight_velvet_bolero",
    ]),
    ...slotItems("bottom", [
      "avatar_v2_bottom_default",
      "avatar_v2_bottom_striped_crochet_shorts",
      "avatar_v2_bottom_layered_lace_ruffle_mini_skirt",
      "avatar_v2_bottom_black_palm_embellished_pants",
      "avatar_v2_bottom_coral_embellished_laceup_pants",
      "avatar_v2_bottom_smoky_floral_mesh_pants",
      "avatar_v2_bottom_yellow_bow_lace_ruffle_skirt",
      "avatar_v2_bottom_midnight_ribbon_wide_leg_pants",
      "avatar_v2_bottom_buttercream_pearl_tailored_pants",
      "avatar_v2_bottom_rose_picnic_pleated_shorts",
      "avatar_v2_bottom_lavender_bow_twill_shorts",
    ]),
    ...slotItems("shoes", [
      "avatar_v2_shoes_milk_tea_court_sneakers",
      "avatar_v2_shoes_cherry_satin_ballets",
      "avatar_v2_shoes_onyx_heart_mary_janes",
      "avatar_v2_shoes_rosewood_platform_loafers",
      "avatar_v2_shoes_pearl_slingback_sandals",
      "avatar_v2_shoes_rose_satin_bow_heels",
      "avatar_v2_shoes_ivory_pearl_slingback_heels",
      "avatar_v2_shoes_lilac_star_platform_sneakers",
      "avatar_v2_shoes_mint_ribbon_court_sneakers",
    ]),
    ...slotItems(
      "face",
      ["avatar_v2_face_male_warm_friendly"],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "eyes",
      ["avatar_v2_eyes_male_warm_brown"],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "nose",
      ["avatar_v2_nose_male_gentle_bridge"],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "mouth",
      ["avatar_v2_mouth_male_soft_smile"],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "hair",
      [
        "avatar_v2_hair_male_espresso_crop",
        "avatar_v2_hair_male_cocoa_textured_quiff",
        "avatar_v2_hair_male_soft_black_side_part",
        "avatar_v2_hair_male_chestnut_short_waves",
      ],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "hair",
      [
        "avatar_v2_hair_male_soft_textured_crop",
        "avatar_v2_hair_male_controlled_modern_mullet",
        "avatar_v2_hair_male_voluminous_wavy_quiff",
        "avatar_v2_hair_male_short_twists_textured_style",
        "avatar_v2_hair_male_copper_compact_quiff",
        "avatar_v2_hair_male_ash_blond_low_fade_crop",
        "avatar_v2_hair_male_blue_black_short_curls",
      ],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "top",
      [
        "avatar_v2_top_male_cream_basic_tee",
        "avatar_v2_top_male_powder_blue_crew_tee",
        "avatar_v2_top_male_sage_basic_tee",
        "avatar_v2_top_male_dusty_navy_tee",
        "avatar_v2_top_male_mist_blue_oxford_shirt",
        "avatar_v2_top_male_soft_sage_linen_shirt",
        "avatar_v2_top_male_cocoa_varsity_jacket",
        "avatar_v2_top_male_dusty_navy_chore_jacket",
      ],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "top",
      [
        "avatar_v2_top_male_tonal_geometric_camp_collar_shirt",
        "avatar_v2_top_male_asymmetric_utility_overshirt",
        "avatar_v2_top_male_abstract_resort_shirt",
        "avatar_v2_top_male_charcoal_leather_bomber_hybrid",
        "avatar_v2_top_male_midnight_relaxed_tailoring_jacket",
        "avatar_v2_top_male_warm_sand_deconstructed_jacket",
        "avatar_v2_top_male_acid_washed_boxy_sweatshirt",
        "avatar_v2_top_male_dusty_blue_weekend_crew_sweatshirt",
        "avatar_v2_top_male_modern_track_luxury_top",
        "avatar_v2_top_male_cocoa_sage_canvas_shacket",
        "avatar_v2_top_male_textured_knit_polo",
        "avatar_v2_top_male_monochrome_street_tailoring_top",
        "avatar_v2_top_male_contemporary_resort_street_top",
        "avatar_v2_top_male_creative_utility_top",
      ],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "top",
      [
        "avatar_v2_top_male_striped_chunky_cardigan",
        "avatar_v2_top_male_colorblock_rugby_polo",
        "avatar_v2_top_male_pixel_heart_boxy_tee",
        "avatar_v2_top_male_soft_varsity_knit_jacket",
        "avatar_v2_top_male_soft_panel_overshirt_bomber",
      ],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "bottom",
      [
        "avatar_v2_bottom_male_sage_cuffed_shorts",
        "avatar_v2_bottom_male_navy_straight_pants",
        "avatar_v2_bottom_male_mid_blue_straight_jeans",
        "avatar_v2_bottom_male_charcoal_tapered_chinos",
        "avatar_v2_bottom_male_warm_sand_relaxed_pants",
      ],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "bottom",
      [
        "avatar_v2_bottom_male_wide_pleated_technical_trousers",
        "avatar_v2_bottom_male_straight_utility_tailored_trousers",
        "avatar_v2_bottom_male_midnight_relaxed_tailoring_trousers",
        "avatar_v2_bottom_male_warm_sand_deconstructed_trousers",
        "avatar_v2_bottom_male_monochrome_street_tailoring_bottom",
        "avatar_v2_bottom_male_modern_track_luxury_bottom",
        "avatar_v2_bottom_male_contemporary_resort_street_bottom",
        "avatar_v2_bottom_male_creative_utility_bottom",
        "avatar_v2_bottom_male_relaxed_tailored_shorts",
        "avatar_v2_bottom_male_refined_utility_cargo_shorts",
        "avatar_v2_bottom_male_technical_sport_shorts",
      ],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "bottom",
      [
        "avatar_v2_bottom_male_washed_baggy_denim",
        "avatar_v2_bottom_male_soft_parachute_cargo_pants",
        "avatar_v2_bottom_male_colorblock_nylon_track_pants",
      ],
      ["avatar_v2_body_male_light"],
    ),
    accessoryItem("avatar_v2_accessory_male_soft_patch_beanie", "headwear", [
      "avatar_v2_body_male_light",
    ]),
    accessoryItem("avatar_v2_accessory_male_nylon_crossbody_bag", "bag", [
      "avatar_v2_body_male_light",
    ]),
    accessoryItem("avatar_v2_accessory_male_beaded_charm_necklace", "neck", [
      "avatar_v2_body_male_light",
    ]),
    accessoryItem(
      "avatar_v2_accessory_male_tortoiseshell_smoke_sunglasses",
      "eyewear",
      ["avatar_v2_body_male_light"],
    ),
    accessoryItem(
      "avatar_v2_accessory_male_matte_black_panto_sunglasses",
      "eyewear",
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "shoes",
      [
        "avatar_v2_shoes_male_milk_tea_court",
        "avatar_v2_shoes_male_cloud_white_trainers",
        "avatar_v2_shoes_male_cocoa_penny_loafers",
        "avatar_v2_shoes_male_dusty_blue_canvas_sneakers",
      ],
      ["avatar_v2_body_male_light"],
    ),
    ...slotItems(
      "shoes",
      [
        "avatar_v2_shoes_male_retro_colorblock_runner",
        "avatar_v2_shoes_male_chunky_skate_sneakers",
        "avatar_v2_shoes_male_suede_penny_mules",
        "avatar_v2_shoes_male_lightweight_trail_sneakers",
      ],
      ["avatar_v2_body_male_light"],
    ),
    accessoryItem("avatar_v2_accessory_ivory_ribbon_beret", "headwear"),
    accessoryItem("avatar_v2_accessory_cherry_bow_headband", "headwear"),
    accessoryItem("avatar_v2_accessory_sage_heart_glasses", "eyewear"),
    accessoryItem("avatar_v2_accessory_rose_round_glasses", "eyewear"),
    accessoryItem(
      "avatar_v2_accessory_lavender_pearl_cat_eye_glasses",
      "eyewear",
    ),
    accessoryItem("avatar_v2_accessory_mint_star_oval_glasses", "eyewear"),
    accessoryItem(
      "avatar_v2_accessory_honey_blossom_square_glasses",
      "eyewear",
    ),
    accessoryItem("avatar_v2_accessory_pearl_drop_earrings", "earrings"),
    accessoryItem("avatar_v2_accessory_golden_heart_locket", "neck"),
    accessoryItem("avatar_v2_accessory_buttercream_neck_scarf", "neck"),
    accessoryItem("avatar_v2_accessory_cherry_micro_bag", "bag"),
    accessoryItem("avatar_v2_accessory_sunny_star_clips", "hairClip"),
    ...outfitItems(
      "boho_patchwork_maxi_dress",
      "avatar_v2_top_boho_patchwork_maxi_dress",
      "avatar_v2_bottom_boho_patchwork_maxi_dress",
    ),
    ...outfitItems(
      "embroidered_halter_wrap_dress",
      "avatar_v2_top_embroidered_halter_wrap_dress",
      "avatar_v2_bottom_embroidered_halter_wrap_dress",
    ),
    ...outfitItems(
      "ruched_patchwork_mini_dress",
      "avatar_v2_top_ruched_patchwork_mini_dress",
      "avatar_v2_bottom_ruched_patchwork_mini_dress",
    ),
    ...outfitItems(
      "white_lace_cami_mini_dress",
      "avatar_v2_top_white_lace_cami_mini_dress",
      "avatar_v2_bottom_white_lace_cami_mini_dress",
    ),
    ...outfitItems(
      "rose_ribbon_tea_dress",
      "avatar_v2_top_rose_ribbon_tea_dress",
      "avatar_v2_bottom_rose_ribbon_tea_dress",
    ),
    ...outfitItems(
      "moonlit_velvet_ballet_dress",
      "avatar_v2_top_moonlit_velvet_ballet_dress",
      "avatar_v2_bottom_moonlit_velvet_ballet_dress",
    ),
    ...outfitItems(
      "buttercup_picnic_pinafore_dress",
      "avatar_v2_top_buttercup_picnic_pinafore_dress",
      "avatar_v2_bottom_buttercup_picnic_pinafore_dress",
    ),
    ...outfitItems(
      "lavender_garden_ribbon_dress",
      "avatar_v2_top_lavender_garden_ribbon_dress",
      "avatar_v2_bottom_lavender_garden_ribbon_dress",
    ),
  ]);

export const DEFAULT_FEMALE_AVATAR_LOADOUT: ReadonlyAvatarLoadout<AvatarLoadoutV1> =
  freezeLoadout({
    schemaVersion: 1,
    bodyId: "avatar_v2_body_default",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_mocha_ribbon_blowout",
    topId: "avatar_v2_top_default",
    bottomId: "avatar_v2_bottom_default",
    shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
    accessoryIds: [],
  });

export const DEFAULT_MALE_AVATAR_LOADOUT: ReadonlyAvatarLoadout<AvatarLoadoutV1> = freezeLoadout(
  {
    schemaVersion: 1,
    bodyId: "avatar_v2_body_male_light",
    faceId: "avatar_v2_face_male_warm_friendly",
    eyesId: "avatar_v2_eyes_male_warm_brown",
    noseId: "avatar_v2_nose_male_gentle_bridge",
    mouthId: "avatar_v2_mouth_male_soft_smile",
    hairId: "avatar_v2_hair_male_espresso_crop",
    topId: "avatar_v2_top_male_powder_blue_crew_tee",
    bottomId: "avatar_v2_bottom_male_navy_straight_pants",
    shoesId: "avatar_v2_shoes_male_milk_tea_court",
    accessoryIds: [],
  },
);

export function isAvatarLoadoutItemCompatibleWithBody(
  itemId: string,
  bodyId: string,
): boolean {
  const body = AVATAR_LOADOUT_CATALOG.find(
    (item) =>
      item.itemId === bodyId &&
      item.slot === "body" &&
      item.supportedBodyIds.includes(bodyId),
  );
  if (!body) return false;

  const item = AVATAR_LOADOUT_CATALOG.find((entry) => entry.itemId === itemId);
  if (!item) return false;
  if (item.slot === "body") return item.itemId === bodyId;
  return item.supportedBodyIds.includes(bodyId);
}

function freezeCatalog(
  catalog: AvatarLoadoutCatalogItem[],
): readonly AvatarLoadoutCatalogItem[] {
  return Object.freeze(
    catalog.map((item) =>
      Object.freeze({
        ...item,
        supportedBodyIds: Object.freeze([...item.supportedBodyIds]),
      }),
    ),
  );
}

function freezeLoadout<Loadout extends AvatarLoadout>(
  loadout: Loadout,
): ReadonlyAvatarLoadout<Loadout> {
  return Object.freeze({
    ...loadout,
    accessoryIds: Object.freeze([...loadout.accessoryIds]),
  }) as ReadonlyAvatarLoadout<Loadout>;
}
