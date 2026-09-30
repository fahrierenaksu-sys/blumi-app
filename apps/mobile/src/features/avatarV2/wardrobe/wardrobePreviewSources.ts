import type { ImageSourcePropType } from "react-native"
import { roomAvatarLayerAssets } from "../room/avatarRoomAssets"
import { MALE_CAPSULE_PREVIEW_SOURCES } from "../maleCapsulePreviewSources"
import {
  FEMALE_SWEET_CAPSULE_RIG_PREVIEW_SOURCES,
  FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES
} from "../femaleSweetCapsulePreviewSources"
import { PREMIUM_FACE_PREVIEW_SOURCES } from "../avatarV2PreviewAssets"
import type { AvatarCatalogItem } from "../avatarV2.types"
import { getGarmentThumbnailOverride } from "../garmentThumbnailOverrides"

const AVATAR_ITEM_PREVIEW_SOURCES: Partial<Record<string, ImageSourcePropType>> = {
  ...MALE_CAPSULE_PREVIEW_SOURCES,
  ...FEMALE_SWEET_CAPSULE_RIG_PREVIEW_SOURCES,
  ...PREMIUM_FACE_PREVIEW_SOURCES,
  avatar_v2_eyes_mocha_doe:
    require("../assets/shop-thumbnails/avatar_v2_eyes_mocha_doe.png"),
  avatar_v2_eyes_sage_glass:
    require("../assets/shop-thumbnails/avatar_v2_eyes_sage_glass.png"),
  avatar_v2_eyes_twilight_plum:
    require("../assets/shop-thumbnails/avatar_v2_eyes_twilight_plum.png"),
  avatar_v2_nose_soft_button:
    require("../assets/shop-thumbnails/avatar_v2_nose_soft_button.png"),
  avatar_v2_nose_petal_curve:
    require("../assets/shop-thumbnails/avatar_v2_nose_petal_curve.png"),
  avatar_v2_nose_gentle_bridge:
    require("../assets/shop-thumbnails/avatar_v2_nose_gentle_bridge.png"),
  avatar_v2_mouth_peach_whisper_smile:
    require("../assets/shop-thumbnails/avatar_v2_mouth_peach_whisper_smile.png"),
  avatar_v2_mouth_rose_gloss_smile:
    require("../assets/shop-thumbnails/avatar_v2_mouth_rose_gloss_smile.png"),
  avatar_v2_mouth_berry_soft_kiss:
    require("../assets/shop-thumbnails/avatar_v2_mouth_berry_soft_kiss.png"),
  avatar_v2_hair_mocha_ribbon_blowout:
    require("../assets/shop-thumbnails/avatar_v2_hair_mocha_ribbon_blowout.png"),
  avatar_v2_hair_midnight_french_bob:
    require("../assets/shop-thumbnails/avatar_v2_hair_midnight_french_bob.png"),
  avatar_v2_hair_honey_halfup_waves:
    require("../assets/shop-thumbnails/avatar_v2_hair_honey_halfup_waves.png"),
  avatar_v2_hair_cherry_ribbon_twin_braids:
    require("../assets/shop-thumbnails/avatar_v2_hair_cherry_ribbon_twin_braids.png"),
  avatar_v2_hair_rosewood_butterfly_layers:
    require("../assets/shop-thumbnails/avatar_v2_hair_rosewood_butterfly_layers.png"),
  avatar_v2_hair_caramel_braided_crown:
    require("../assets/shop-thumbnails/avatar_v2_hair_caramel_braided_crown.png"),
  avatar_v2_hair_berry_velvet_soft_updo:
    require("../assets/shop-thumbnails/avatar_v2_hair_berry_velvet_soft_updo.png"),
  avatar_v2_hair_chestnut_butterfly_bob:
    require("../assets/shop-thumbnails/avatar_v2_hair_chestnut_butterfly_bob.png"),
  avatar_v2_hair_golden_waves:
    require("../assets/shop-thumbnails/avatar_v2_hair_golden_waves.png"),
  avatar_v2_hair_ink_pageboy_star:
    require("../assets/shop-thumbnails/avatar_v2_hair_ink_pageboy_star.png"),
  avatar_v2_hair_ink_twin_braids:
    require("../assets/shop-thumbnails/avatar_v2_hair_ink_twin_braids.png"),
  avatar_v2_hair_pale_golden_bow_bob:
    require("../assets/shop-thumbnails/avatar_v2_hair_pale_golden_bow_bob.png"),
  avatar_v2_hair_copper_bow_waves:
    require("../assets/shop-thumbnails/avatar_v2_hair_copper_bow_waves.png"),
  avatar_v2_face_warm_peach_foundation:
    require("../assets/shop-thumbnails/avatar_v2_face_warm_peach_foundation.png"),
  avatar_v2_face_rose_heart_foundation:
    require("../assets/shop-thumbnails/avatar_v2_face_rose_heart_foundation.png"),
  avatar_v2_top_default: roomAvatarLayerAssets.topFemaleCreamBasicTeeV2.source,
  avatar_v2_top_blush_lace_cardigan:
    roomAvatarLayerAssets.topFemaleBlushLaceCardiganV2.source,
  avatar_v2_top_sage_ribbon_knit_jacket:
    roomAvatarLayerAssets.topFemaleSageRibbonKnitJacketV2.source,
  avatar_v2_top_cherry_heart_milkmaid_blouse:
    roomAvatarLayerAssets.topFemaleCherryHeartMilkmaidBlouseV2.source,
  avatar_v2_top_powder_blue_ribbon_corset_top:
    roomAvatarLayerAssets.topFemalePowderBlueRibbonCorsetTopV2.source,
  avatar_v2_top_noir_rose_heart_cardigan:
    roomAvatarLayerAssets.topFemaleNoirRoseHeartCardiganV2.source,
  avatar_v2_bottom_default: roomAvatarLayerAssets.bottomFemaleDenimSkortShortsV2.source,
  avatar_v2_shoes_milk_tea_court_sneakers: roomAvatarLayerAssets.shoesFemaleMilkTeaCourtSneakersV2.source,
  avatar_v2_shoes_cherry_satin_ballets:
    roomAvatarLayerAssets.shoesFemaleCherrySatinBalletsV2.source,
  avatar_v2_shoes_onyx_heart_mary_janes:
    roomAvatarLayerAssets.shoesFemaleOnyxHeartMaryJanesV2.source,
  avatar_v2_shoes_rosewood_platform_loafers:
    roomAvatarLayerAssets.shoesFemaleRosewoodPlatformLoafersV2.source,
  avatar_v2_shoes_pearl_slingback_sandals:
    roomAvatarLayerAssets.shoesFemalePearlSlingbackSandalsV2.source,
  avatar_v2_top_boho_patchwork_maxi_dress:
    roomAvatarLayerAssets.topFemaleBohoPatchworkMaxiDressV2.source,
  avatar_v2_bottom_boho_patchwork_maxi_dress:
    roomAvatarLayerAssets.bottomFemaleBohoPatchworkMaxiDressV2.source,
  avatar_v2_top_embroidered_halter_wrap_dress:
    roomAvatarLayerAssets.topFemaleEmbroideredHalterWrapDressV2.source,
  avatar_v2_bottom_embroidered_halter_wrap_dress:
    roomAvatarLayerAssets.bottomFemaleEmbroideredHalterWrapDressV2.source,
  avatar_v2_top_ruched_patchwork_mini_dress:
    roomAvatarLayerAssets.topFemaleRuchedPatchworkMiniDressV2.source,
  avatar_v2_bottom_ruched_patchwork_mini_dress:
    roomAvatarLayerAssets.bottomFemaleRuchedPatchworkMiniDressV2.source,
  avatar_v2_top_white_lace_cami_mini_dress:
    roomAvatarLayerAssets.topFemaleWhiteLaceCamiMiniDressV2.source,
  avatar_v2_bottom_white_lace_cami_mini_dress:
    roomAvatarLayerAssets.bottomFemaleWhiteLaceCamiMiniDressV2.source,
  avatar_v2_accessory_ivory_ribbon_beret:
    require("../assets/shop-thumbnails/avatar_v2_accessory_ivory_ribbon_beret.png"),
  avatar_v2_accessory_cherry_bow_headband:
    require("../assets/shop-thumbnails/avatar_v2_accessory_cherry_bow_headband.png"),
  avatar_v2_accessory_sage_heart_glasses:
    require("../assets/shop-thumbnails/avatar_v2_accessory_sage_heart_glasses.png"),
  avatar_v2_accessory_rose_round_glasses:
    require("../assets/shop-thumbnails/avatar_v2_accessory_rose_round_glasses.png"),
  avatar_v2_accessory_lavender_pearl_cat_eye_glasses:
    require("../assets/shop-thumbnails/avatar_v2_accessory_lavender_pearl_cat_eye_glasses.png"),
  avatar_v2_accessory_mint_star_oval_glasses:
    require("../assets/shop-thumbnails/avatar_v2_accessory_mint_star_oval_glasses.png"),
  avatar_v2_accessory_honey_blossom_square_glasses:
    require("../assets/shop-thumbnails/avatar_v2_accessory_honey_blossom_square_glasses.png"),
  avatar_v2_accessory_pearl_drop_earrings:
    require("../assets/shop-thumbnails/avatar_v2_accessory_pearl_drop_earrings.png"),
  avatar_v2_accessory_golden_heart_locket:
    require("../assets/shop-thumbnails/avatar_v2_accessory_golden_heart_locket.png"),
  avatar_v2_accessory_buttercream_neck_scarf:
    require("../assets/shop-thumbnails/avatar_v2_accessory_buttercream_neck_scarf.png"),
  avatar_v2_accessory_cherry_micro_bag:
    require("../assets/shop-thumbnails/avatar_v2_accessory_cherry_micro_bag.png"),
  avatar_v2_accessory_sunny_star_clips:
    require("../assets/shop-thumbnails/avatar_v2_accessory_sunny_star_clips.png")
}

export const WARDROBE_SQUARE_THUMBNAIL_SOURCES: Partial<Record<string, ImageSourcePropType>> = {
  ...FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES,
  avatar_v2_top_blush_lace_cardigan:
    require("../assets/shop-thumbnails/avatar_v2_top_buttercream_bow_tee.png"),
  avatar_v2_top_sage_ribbon_knit_jacket:
    require("../assets/shop-thumbnails/avatar_v2_top_sage_ribbon_knit_jacket.png"),
  avatar_v2_top_cherry_heart_milkmaid_blouse:
    require("../assets/shop-thumbnails/avatar_v2_top_cherry_heart_milkmaid_blouse.png"),
  avatar_v2_top_powder_blue_ribbon_corset_top:
    require("../assets/shop-thumbnails/avatar_v2_top_powder_blue_ribbon_corset_top.png"),
  avatar_v2_top_noir_rose_heart_cardigan:
    require("../assets/shop-thumbnails/avatar_v2_top_buttercream_bow_tee.png"),
  avatar_v2_top_boho_patchwork_maxi_dress:
    require("../assets/shop-thumbnails/avatar_v2_top_boho_patchwork_maxi_dress.png"),
  avatar_v2_top_embroidered_halter_wrap_dress:
    require("../assets/shop-thumbnails/avatar_v2_top_embroidered_halter_wrap_dress.png"),
  avatar_v2_top_ruched_patchwork_mini_dress:
    require("../assets/shop-thumbnails/avatar_v2_top_ruched_patchwork_mini_dress.png"),
  avatar_v2_top_white_lace_cami_mini_dress:
    require("../assets/shop-thumbnails/avatar_v2_top_white_lace_cami_mini_dress.png"),
  avatar_v2_bottom_striped_crochet_shorts:
    require("../assets/shop-thumbnails/avatar_v2_bottom_striped_crochet_shorts.png"),
  avatar_v2_bottom_layered_lace_ruffle_mini_skirt:
    require("../assets/shop-thumbnails/avatar_v2_bottom_layered_lace_ruffle_mini_skirt.png"),
  avatar_v2_bottom_black_palm_embellished_pants:
    require("../assets/shop-thumbnails/avatar_v2_bottom_black_palm_embellished_pants.png"),
  avatar_v2_bottom_coral_embellished_laceup_pants:
    require("../assets/shop-thumbnails/avatar_v2_bottom_coral_embellished_laceup_pants.png"),
  avatar_v2_bottom_smoky_floral_mesh_pants:
    require("../assets/shop-thumbnails/avatar_v2_bottom_smoky_floral_mesh_pants.png"),
  avatar_v2_bottom_yellow_bow_lace_ruffle_skirt:
    require("../assets/shop-thumbnails/avatar_v2_bottom_yellow_bow_lace_ruffle_skirt.png"),
  avatar_v2_shoes_milk_tea_court_sneakers:
    require("../assets/shop-thumbnails/avatar_v2_shoes_milk_tea_court_sneakers.png"),
  avatar_v2_shoes_cherry_satin_ballets:
    require("../assets/shop-thumbnails/avatar_v2_shoes_cherry_satin_ballets.png"),
  avatar_v2_shoes_onyx_heart_mary_janes:
    require("../assets/shop-thumbnails/avatar_v2_shoes_onyx_heart_mary_janes.png"),
  avatar_v2_shoes_rosewood_platform_loafers:
    require("../assets/shop-thumbnails/avatar_v2_shoes_rosewood_platform_loafers.png"),
  avatar_v2_shoes_pearl_slingback_sandals:
    require("../assets/shop-thumbnails/avatar_v2_shoes_pearl_slingback_sandals.png")
}

export function getAvatarItemPreviewSource(
  item: AvatarCatalogItem
): ImageSourcePropType | undefined {
  return getGarmentThumbnailOverride(item.id)?.source
    ?? WARDROBE_SQUARE_THUMBNAIL_SOURCES[item.id]
    ?? AVATAR_ITEM_PREVIEW_SOURCES[item.id]
}
