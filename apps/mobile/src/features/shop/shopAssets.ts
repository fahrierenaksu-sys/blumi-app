import type { ImageSourcePropType } from "react-native"
import {
  FEMALE_SWEET_CAPSULE_RIG_PREVIEW_SOURCES,
  FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES
} from "../avatarV2/femaleSweetCapsulePreviewSources"
import { MALE_CAPSULE_PREVIEW_SOURCES } from "../avatarV2/maleCapsulePreviewSources"
import { PREMIUM_FACE_PREVIEW_SOURCES } from "../avatarV2/avatarV2PreviewAssets"
import { roomAvatarLayerAssets } from "../avatarV2/room/avatarRoomAssets"

export const PRODUCT_REFERENCE_AVATAR_ITEM_IDS = new Set([
  "avatar_v2_eyes_sage_glass",
  "avatar_v2_eyes_twilight_plum",
  "avatar_v2_nose_petal_curve",
  "avatar_v2_nose_gentle_bridge",
  "avatar_v2_mouth_rose_gloss_smile",
  "avatar_v2_mouth_berry_soft_kiss",
  "avatar_v2_hair_midnight_french_bob",
  "avatar_v2_hair_honey_halfup_waves",
  "avatar_v2_eyes_hazel_almond_doe",
  "avatar_v2_eyes_deep_brown_star",
  "avatar_v2_eyes_cocoa_puppy",
  "avatar_v2_eyes_honey_amber",
  "avatar_v2_eyes_chestnut_luminous",
  "avatar_v2_nose_tiny_upturned",
  "avatar_v2_nose_petite_rounded",
  "avatar_v2_nose_heart_tip",
  "avatar_v2_nose_narrow_button",
  "avatar_v2_nose_sculpted_doll",
  "avatar_v2_mouth_coral_bow_smile",
  "avatar_v2_mouth_nude_pink_whisper",
  "avatar_v2_mouth_cherry_balm_smile",
  "avatar_v2_mouth_soft_mauve_smile",
  "avatar_v2_mouth_rosewater_cupid_bow",
  "avatar_v2_hair_cherry_ribbon_twin_braids",
  "avatar_v2_hair_cocoa_cloud_ponytail",
  "avatar_v2_hair_espresso_sleek_ribbon_pony",
  "avatar_v2_hair_rosewood_butterfly_layers",
  "avatar_v2_hair_caramel_braided_crown",
  "avatar_v2_hair_berry_velvet_soft_updo",
  "avatar_v2_hair_chestnut_butterfly_bob",
  "avatar_v2_hair_golden_waves",
  "avatar_v2_hair_ink_pageboy_star",
  "avatar_v2_hair_ink_twin_braids",
  "avatar_v2_hair_pale_golden_bow_bob",
  "avatar_v2_hair_copper_bow_waves",
  "avatar_v2_face_warm_peach_foundation",
  "avatar_v2_face_rose_heart_foundation",
  "avatar_v2_accessory_rose_round_glasses",
  "avatar_v2_accessory_lavender_pearl_cat_eye_glasses",
  "avatar_v2_accessory_mint_star_oval_glasses",
  "avatar_v2_accessory_honey_blossom_square_glasses",
  "avatar_v2_shoes_cherry_satin_ballets",
  "avatar_v2_shoes_onyx_heart_mary_janes",
  "avatar_v2_shoes_rosewood_platform_loafers",
  "avatar_v2_shoes_pearl_slingback_sandals",
  "avatar_v2_top_blush_lace_cardigan",
  "avatar_v2_top_sage_ribbon_knit_jacket",
  "avatar_v2_top_cherry_heart_milkmaid_blouse",
  "avatar_v2_top_powder_blue_ribbon_corset_top",
  "avatar_v2_top_noir_rose_heart_cardigan",
  "avatar_v2_bottom_striped_crochet_shorts",
  "avatar_v2_bottom_layered_lace_ruffle_mini_skirt",
  "avatar_v2_bottom_black_palm_embellished_pants",
  "avatar_v2_bottom_coral_embellished_laceup_pants",
  "avatar_v2_bottom_smoky_floral_mesh_pants",
  "avatar_v2_bottom_yellow_bow_lace_ruffle_skirt",
  "avatar_v2_top_boho_patchwork_maxi_dress",
  "avatar_v2_top_embroidered_halter_wrap_dress",
  "avatar_v2_top_ruched_patchwork_mini_dress",
  "avatar_v2_top_white_lace_cami_mini_dress",
  "avatar_v2_accessory_ivory_ribbon_beret",
  "avatar_v2_accessory_cherry_bow_headband",
  "avatar_v2_accessory_sage_heart_glasses",
  "avatar_v2_accessory_pearl_drop_earrings",
  "avatar_v2_accessory_golden_heart_locket",
  "avatar_v2_accessory_buttercream_neck_scarf",
  "avatar_v2_accessory_cherry_micro_bag",
  "avatar_v2_accessory_sunny_star_clips",
  ...Object.keys(FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES)
])

export const RIG_LAYER_THUMBNAIL_ITEM_IDS = new Set(
  Object.keys(MALE_CAPSULE_PREVIEW_SOURCES)
)

export const AVATAR_ITEM_PREVIEW_SOURCES: Partial<Record<string, ImageSourcePropType>> = {
  ...MALE_CAPSULE_PREVIEW_SOURCES,
  ...FEMALE_SWEET_CAPSULE_RIG_PREVIEW_SOURCES,
  ...PREMIUM_FACE_PREVIEW_SOURCES,
  avatar_v2_eyes_mocha_doe: require("../avatarV2/assets/shop-thumbnails/avatar_v2_eyes_mocha_doe.png"),
  avatar_v2_eyes_sage_glass: require("../avatarV2/assets/shop-thumbnails/avatar_v2_eyes_sage_glass.png"),
  avatar_v2_eyes_twilight_plum: require("../avatarV2/assets/shop-thumbnails/avatar_v2_eyes_twilight_plum.png"),
  avatar_v2_nose_soft_button: require("../avatarV2/assets/shop-thumbnails/avatar_v2_nose_soft_button.png"),
  avatar_v2_nose_petal_curve: require("../avatarV2/assets/shop-thumbnails/avatar_v2_nose_petal_curve.png"),
  avatar_v2_nose_gentle_bridge: require("../avatarV2/assets/shop-thumbnails/avatar_v2_nose_gentle_bridge.png"),
  avatar_v2_mouth_peach_whisper_smile: require("../avatarV2/assets/shop-thumbnails/avatar_v2_mouth_peach_whisper_smile.png"),
  avatar_v2_mouth_rose_gloss_smile: require("../avatarV2/assets/shop-thumbnails/avatar_v2_mouth_rose_gloss_smile.png"),
  avatar_v2_mouth_berry_soft_kiss: require("../avatarV2/assets/shop-thumbnails/avatar_v2_mouth_berry_soft_kiss.png"),
  avatar_v2_hair_mocha_ribbon_blowout: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_mocha_ribbon_blowout.png"),
  avatar_v2_hair_midnight_french_bob: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_midnight_french_bob.png"),
  avatar_v2_hair_honey_halfup_waves: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_honey_halfup_waves.png"),
  avatar_v2_hair_cherry_ribbon_twin_braids: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_cherry_ribbon_twin_braids.png"),
  avatar_v2_hair_rosewood_butterfly_layers: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_rosewood_butterfly_layers.png"),
  avatar_v2_hair_caramel_braided_crown: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_caramel_braided_crown.png"),
  avatar_v2_hair_berry_velvet_soft_updo: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_berry_velvet_soft_updo.png"),
  avatar_v2_top_default: roomAvatarLayerAssets.topFemaleCreamBasicTeeV2.source,
  avatar_v2_top_blush_lace_cardigan: roomAvatarLayerAssets.topFemaleBlushLaceCardiganV2.source,
  avatar_v2_top_sage_ribbon_knit_jacket: roomAvatarLayerAssets.topFemaleSageRibbonKnitJacketV2.source,
  avatar_v2_top_cherry_heart_milkmaid_blouse: roomAvatarLayerAssets.topFemaleCherryHeartMilkmaidBlouseV2.source,
  avatar_v2_top_powder_blue_ribbon_corset_top: roomAvatarLayerAssets.topFemalePowderBlueRibbonCorsetTopV2.source,
  avatar_v2_top_noir_rose_heart_cardigan: roomAvatarLayerAssets.topFemaleNoirRoseHeartCardiganV2.source,
  avatar_v2_bottom_default: roomAvatarLayerAssets.bottomFemaleDenimSkortShortsV2.source,
  avatar_v2_shoes_milk_tea_court_sneakers: roomAvatarLayerAssets.shoesFemaleMilkTeaCourtSneakersV2.source,
  avatar_v2_shoes_cherry_satin_ballets: roomAvatarLayerAssets.shoesFemaleCherrySatinBalletsV2.source,
  avatar_v2_shoes_onyx_heart_mary_janes: roomAvatarLayerAssets.shoesFemaleOnyxHeartMaryJanesV2.source,
  avatar_v2_shoes_rosewood_platform_loafers: roomAvatarLayerAssets.shoesFemaleRosewoodPlatformLoafersV2.source,
  avatar_v2_shoes_pearl_slingback_sandals: roomAvatarLayerAssets.shoesFemalePearlSlingbackSandalsV2.source,
  avatar_v2_bottom_striped_crochet_shorts: roomAvatarLayerAssets.bottomFemaleStripedCrochetShortsV2.source,
  avatar_v2_bottom_layered_lace_ruffle_mini_skirt: roomAvatarLayerAssets.bottomFemaleLayeredLaceRuffleMiniSkirtV2.source,
  avatar_v2_bottom_black_palm_embellished_pants: roomAvatarLayerAssets.bottomFemaleBlackPalmEmbellishedPantsV2.source,
  avatar_v2_bottom_coral_embellished_laceup_pants: roomAvatarLayerAssets.bottomFemaleCoralEmbellishedLaceupPantsV2.source,
  avatar_v2_bottom_smoky_floral_mesh_pants: roomAvatarLayerAssets.bottomFemaleSmokyFloralMeshPantsV2.source,
  avatar_v2_bottom_yellow_bow_lace_ruffle_skirt: roomAvatarLayerAssets.bottomFemaleYellowBowLaceRuffleSkirtV2.source,
  avatar_v2_top_boho_patchwork_maxi_dress: roomAvatarLayerAssets.topFemaleBohoPatchworkMaxiDressV2.source,
  avatar_v2_top_embroidered_halter_wrap_dress: roomAvatarLayerAssets.topFemaleEmbroideredHalterWrapDressV2.source,
  avatar_v2_top_ruched_patchwork_mini_dress: roomAvatarLayerAssets.topFemaleRuchedPatchworkMiniDressV2.source,
  avatar_v2_top_white_lace_cami_mini_dress: roomAvatarLayerAssets.topFemaleWhiteLaceCamiMiniDressV2.source,
  avatar_v2_accessory_ivory_ribbon_beret: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_ivory_ribbon_beret.png"),
  avatar_v2_accessory_cherry_bow_headband: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_cherry_bow_headband.png"),
  avatar_v2_accessory_sage_heart_glasses: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_sage_heart_glasses.png"),
  avatar_v2_accessory_pearl_drop_earrings: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_pearl_drop_earrings.png"),
  avatar_v2_accessory_golden_heart_locket: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_golden_heart_locket.png"),
  avatar_v2_accessory_buttercream_neck_scarf: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_buttercream_neck_scarf.png"),
  avatar_v2_accessory_cherry_micro_bag: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_cherry_micro_bag.png"),
  avatar_v2_accessory_sunny_star_clips: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_sunny_star_clips.png")
}

export const SHOP_THUMBNAIL_SOURCES: Partial<Record<string, ImageSourcePropType>> = {
  ...MALE_CAPSULE_PREVIEW_SOURCES,
  ...FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES,
  ...PREMIUM_FACE_PREVIEW_SOURCES,
  avatar_v2_eyes_mocha_doe: require("../avatarV2/assets/shop-thumbnails/avatar_v2_eyes_mocha_doe.png"),
  avatar_v2_eyes_sage_glass: require("../avatarV2/assets/shop-thumbnails/avatar_v2_eyes_sage_glass.png"),
  avatar_v2_eyes_twilight_plum: require("../avatarV2/assets/shop-thumbnails/avatar_v2_eyes_twilight_plum.png"),
  avatar_v2_nose_soft_button: require("../avatarV2/assets/shop-thumbnails/avatar_v2_nose_soft_button.png"),
  avatar_v2_nose_petal_curve: require("../avatarV2/assets/shop-thumbnails/avatar_v2_nose_petal_curve.png"),
  avatar_v2_nose_gentle_bridge: require("../avatarV2/assets/shop-thumbnails/avatar_v2_nose_gentle_bridge.png"),
  avatar_v2_mouth_peach_whisper_smile: require("../avatarV2/assets/shop-thumbnails/avatar_v2_mouth_peach_whisper_smile.png"),
  avatar_v2_mouth_rose_gloss_smile: require("../avatarV2/assets/shop-thumbnails/avatar_v2_mouth_rose_gloss_smile.png"),
  avatar_v2_mouth_berry_soft_kiss: require("../avatarV2/assets/shop-thumbnails/avatar_v2_mouth_berry_soft_kiss.png"),
  avatar_v2_hair_mocha_ribbon_blowout: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_mocha_ribbon_blowout.png"),
  avatar_v2_hair_midnight_french_bob: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_midnight_french_bob.png"),
  avatar_v2_hair_honey_halfup_waves: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_honey_halfup_waves.png"),
  avatar_v2_hair_cherry_ribbon_twin_braids: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_cherry_ribbon_twin_braids.png"),
  avatar_v2_hair_rosewood_butterfly_layers: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_rosewood_butterfly_layers.png"),
  avatar_v2_hair_caramel_braided_crown: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_caramel_braided_crown.png"),
  avatar_v2_hair_berry_velvet_soft_updo: require("../avatarV2/assets/shop-thumbnails/avatar_v2_hair_berry_velvet_soft_updo.png"),
  avatar_v2_shoes_milk_tea_court_sneakers: require("../avatarV2/assets/shop-thumbnails/avatar_v2_shoes_milk_tea_court_sneakers.png"),
  avatar_v2_shoes_cherry_satin_ballets: require("../avatarV2/assets/shop-thumbnails/avatar_v2_shoes_cherry_satin_ballets.png"),
  avatar_v2_shoes_onyx_heart_mary_janes: require("../avatarV2/assets/shop-thumbnails/avatar_v2_shoes_onyx_heart_mary_janes.png"),
  avatar_v2_shoes_rosewood_platform_loafers: require("../avatarV2/assets/shop-thumbnails/avatar_v2_shoes_rosewood_platform_loafers.png"),
  avatar_v2_shoes_pearl_slingback_sandals: require("../avatarV2/assets/shop-thumbnails/avatar_v2_shoes_pearl_slingback_sandals.png"),
  avatar_v2_top_blush_lace_cardigan: require("../avatarV2/assets/shop-thumbnails/avatar_v2_top_blush_lace_cardigan.png"),
  avatar_v2_top_sage_ribbon_knit_jacket: require("../avatarV2/assets/shop-thumbnails/avatar_v2_top_sage_ribbon_knit_jacket.png"),
  avatar_v2_top_cherry_heart_milkmaid_blouse: require("../avatarV2/assets/shop-thumbnails/avatar_v2_top_cherry_heart_milkmaid_blouse.png"),
  avatar_v2_top_powder_blue_ribbon_corset_top: require("../avatarV2/assets/shop-thumbnails/avatar_v2_top_powder_blue_ribbon_corset_top.png"),
  avatar_v2_top_noir_rose_heart_cardigan: require("../avatarV2/assets/shop-thumbnails/avatar_v2_top_noir_rose_heart_cardigan.png"),
  avatar_v2_bottom_striped_crochet_shorts: require("../avatarV2/assets/shop-thumbnails/avatar_v2_bottom_striped_crochet_shorts.png"),
  avatar_v2_bottom_layered_lace_ruffle_mini_skirt: require("../avatarV2/assets/shop-thumbnails/avatar_v2_bottom_layered_lace_ruffle_mini_skirt.png"),
  avatar_v2_bottom_black_palm_embellished_pants: require("../avatarV2/assets/shop-thumbnails/avatar_v2_bottom_black_palm_embellished_pants.png"),
  avatar_v2_bottom_coral_embellished_laceup_pants: require("../avatarV2/assets/shop-thumbnails/avatar_v2_bottom_coral_embellished_laceup_pants.png"),
  avatar_v2_bottom_smoky_floral_mesh_pants: require("../avatarV2/assets/shop-thumbnails/avatar_v2_bottom_smoky_floral_mesh_pants.png"),
  avatar_v2_bottom_yellow_bow_lace_ruffle_skirt: require("../avatarV2/assets/shop-thumbnails/avatar_v2_bottom_yellow_bow_lace_ruffle_skirt.png"),
  avatar_v2_top_boho_patchwork_maxi_dress: require("../avatarV2/assets/shop-thumbnails/avatar_v2_top_boho_patchwork_maxi_dress.png"),
  avatar_v2_top_embroidered_halter_wrap_dress: require("../avatarV2/assets/shop-thumbnails/avatar_v2_top_embroidered_halter_wrap_dress.png"),
  avatar_v2_top_ruched_patchwork_mini_dress: require("../avatarV2/assets/shop-thumbnails/avatar_v2_top_ruched_patchwork_mini_dress.png"),
  avatar_v2_top_white_lace_cami_mini_dress: require("../avatarV2/assets/shop-thumbnails/avatar_v2_top_white_lace_cami_mini_dress.png"),
  avatar_v2_accessory_ivory_ribbon_beret: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_ivory_ribbon_beret.png"),
  avatar_v2_accessory_cherry_bow_headband: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_cherry_bow_headband.png"),
  avatar_v2_accessory_sage_heart_glasses: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_sage_heart_glasses.png"),
  avatar_v2_accessory_pearl_drop_earrings: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_pearl_drop_earrings.png"),
  avatar_v2_accessory_golden_heart_locket: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_golden_heart_locket.png"),
  avatar_v2_accessory_buttercream_neck_scarf: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_buttercream_neck_scarf.png"),
  avatar_v2_accessory_cherry_micro_bag: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_cherry_micro_bag.png"),
  avatar_v2_accessory_sunny_star_clips: require("../avatarV2/assets/shop-thumbnails/avatar_v2_accessory_sunny_star_clips.png")
}

export const ROOM_SHOP_THUMBNAIL_SOURCES: Partial<Record<string, ImageSourcePropType>> = {
  room_v2_chair_blush: require("../roomV2/assets/shop-thumbnails/room_v2_chair_blush.png"),
  room_v2_table_round: require("../roomV2/assets/shop-thumbnails/room_v2_table_round.png"),
  room_v2_lamp_heart: require("../roomV2/assets/shop-thumbnails/room_v2_lamp_heart.png"),
  room_v2_cozy_bed: require("../roomV2/assets/shop-thumbnails/room_v2_cozy_bed.png"),
  room_v2_cute_bookshelf: require("../roomV2/assets/shop-thumbnails/room_v2_cute_bookshelf.png"),
  room_v2_heart_rug: require("../roomV2/assets/shop-thumbnails/room_v2_heart_rug.png"),
  room_v2_side_table: require("../roomV2/assets/shop-thumbnails/room_v2_side_table.png")
}

export function getAvatarItemPreviewSource(
  item: { id: string } | string
): ImageSourcePropType | undefined {
  return AVATAR_ITEM_PREVIEW_SOURCES[typeof item === "string" ? item : item.id]
}

export function getShopProductThumbnailSource(
  sourceItemId: string
): ImageSourcePropType | undefined {
  return SHOP_THUMBNAIL_SOURCES[sourceItemId]
}

export function getRoomProductThumbnailSource(
  sourceItemId: string
): ImageSourcePropType | undefined {
  return ROOM_SHOP_THUMBNAIL_SOURCES[sourceItemId]
}
