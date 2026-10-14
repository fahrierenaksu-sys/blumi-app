import { RETIRED_AVATAR_ART } from "../retiredAvatarArt"
import type {
  RoomV2AssetRef,
  RoomV2AvatarAssetSequence
} from "../../roomV2/roomV2.types"
import { femaleSweetCapsuleRoomLayerAssets } from "../femaleSweetCapsuleRoomAssets"
import { roomAvatarMaleCapsuleLayerAssets } from "./avatarRoomMaleCapsuleAssets"
import { roomAvatarMalePremiumCapsuleLayerAssets } from "./avatarRoomMalePremiumCapsuleAssets"
import { ROOM_AVATAR_FRAME_DURATION_MS } from "./avatarRoomMotionContract"
import { roomAvatarFrameAsset, type RoomAvatarFrameSource } from "./roomAvatarMotionAtlas"

// Room avatar v1 assets use one 256x384 transparent canvas, one centerline,
// and one shared feet baseline so clothing layers can stack without offsets.
export const roomAvatarAsset = (
  key: string,
  source: RoomAvatarFrameSource
): RoomV2AssetRef => roomAvatarFrameAsset(key, source)

export const roomAvatarAssetSequence = (
  frames: RoomV2AvatarAssetSequence["frames"],
  frameDurationMs = ROOM_AVATAR_FRAME_DURATION_MS,
  loop = true
): RoomV2AvatarAssetSequence => ({
  frames,
  frameDurationMs,
  loop
})

export const roomAvatarLayerAssets = {
  ...femaleSweetCapsuleRoomLayerAssets,
  baseMaleLightV1: roomAvatarAsset(
    "avatar_room_base_male_light_v1",
    RETIRED_AVATAR_ART
  ),
  faceMaleWarmFriendlyV1: roomAvatarAsset(
    "avatar_room_face_male_warm_friendly_v1",
    RETIRED_AVATAR_ART
  ),
  hairFrontMaleEspressoCropV1: roomAvatarAsset(
    "avatar_room_hair_front_male_espresso_crop_v1",
    RETIRED_AVATAR_ART
  ),
  topMaleCreamBasicTeeV1: roomAvatarAsset(
    "avatar_room_top_male_cream_basic_tee_v1",
    RETIRED_AVATAR_ART
  ),
  topMalePowderBlueCrewTeeV1: roomAvatarAsset(
    "avatar_room_top_male_powder_blue_crew_tee_v1",
    RETIRED_AVATAR_ART
  ),
  bottomMaleSageCuffedShortsV1: roomAvatarAsset(
    "avatar_room_bottom_male_sage_cuffed_shorts_v1",
    RETIRED_AVATAR_ART
  ),
  bottomMaleNavyStraightPantsV1: roomAvatarAsset(
    "avatar_room_bottom_male_navy_straight_pants_v1",
    RETIRED_AVATAR_ART
  ),
  shoesMaleMilkTeaCourtV1: roomAvatarAsset(
    "avatar_room_shoes_male_milk_tea_court_v1",
    RETIRED_AVATAR_ART
  ),
  ...roomAvatarMaleCapsuleLayerAssets,
  ...roomAvatarMalePremiumCapsuleLayerAssets,
  baseFemaleV2: roomAvatarAsset(
    "avatar_room_base_female_v2",
    RETIRED_AVATAR_ART
  ),
  faceFemaleSoftDollFoundationV2: roomAvatarAsset(
    "avatar_room_face_female_soft_doll_foundation_v2",
    RETIRED_AVATAR_ART
  ),
  faceFemaleWarmPeachFoundationV2: roomAvatarAsset(
    "avatar_room_face_female_warm_peach_foundation_v2",
    RETIRED_AVATAR_ART
  ),
  faceFemaleRoseHeartFoundationV2: roomAvatarAsset(
    "avatar_room_face_female_rose_heart_foundation_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleIvoryRibbonBeretV2: roomAvatarAsset(
    "avatar_room_accessory_female_ivory_ribbon_beret_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleCherryBowHeadbandV2: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_bow_headband_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleSageHeartGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_sage_heart_glasses_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleRoseRoundGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_rose_round_glasses_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleLavenderPearlCatEyeGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_lavender_pearl_cat_eye_glasses_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleMintStarOvalGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_mint_star_oval_glasses_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleHoneyBlossomSquareGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_honey_blossom_square_glasses_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemalePearlDropEarringsV2: roomAvatarAsset(
    "avatar_room_accessory_female_pearl_drop_earrings_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemalePearlDropEarringsV2EarringRear: roomAvatarAsset(
    "avatar_room_accessory_female_pearl_drop_earrings_v2_part_earring-rear",
    RETIRED_AVATAR_ART
  ),
  accessoryFemalePearlDropEarringsV2PearlFront: roomAvatarAsset(
    "avatar_room_accessory_female_pearl_drop_earrings_v2_part_pearl-front",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleGoldenHeartLocketV2: roomAvatarAsset(
    "avatar_room_accessory_female_golden_heart_locket_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleButtercreamNeckScarfV2: roomAvatarAsset(
    "avatar_room_accessory_female_buttercream_neck_scarf_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleCherryMicroBagV2: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_micro_bag_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleCherryMicroBagV2BagBack: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_micro_bag_v2_part_bag-back",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleCherryMicroBagV2StrapBack: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_micro_bag_v2_part_strap-back",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleCherryMicroBagV2BagFront: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_micro_bag_v2_part_bag-front",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleSunnyStarClipsV2: roomAvatarAsset(
    "avatar_room_accessory_female_sunny_star_clips_v2",
    RETIRED_AVATAR_ART
  ),
  accessoryFemaleSunnyStarClipsV2ClipsFront: roomAvatarAsset(
    "avatar_room_accessory_female_sunny_star_clips_v2_part_clips-front",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleMochaRibbonBlowoutV2: roomAvatarAsset(
    "avatar_room_hair_back_female_mocha_ribbon_blowout_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleMochaRibbonBlowoutV2: roomAvatarAsset(
    "avatar_room_hair_front_female_mocha_ribbon_blowout_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleMidnightFrenchBobV2: roomAvatarAsset(
    "avatar_room_hair_back_female_midnight_french_bob_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleMidnightFrenchBobV2: roomAvatarAsset(
    "avatar_room_hair_front_female_midnight_french_bob_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleHoneyHalfupWavesV2: roomAvatarAsset(
    "avatar_room_hair_back_female_honey_halfup_waves_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleHoneyHalfupWavesV2: roomAvatarAsset(
    "avatar_room_hair_front_female_honey_halfup_waves_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleCherryRibbonTwinBraidsV2: roomAvatarAsset(
    "avatar_room_hair_back_female_cherry_ribbon_twin_braids_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleCherryRibbonTwinBraidsV2: roomAvatarAsset(
    "avatar_room_hair_front_female_cherry_ribbon_twin_braids_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleCocoaCloudPonytailV2: roomAvatarAsset(
    "avatar_room_hair_back_female_cocoa_cloud_ponytail_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleCocoaCloudPonytailV2: roomAvatarAsset(
    "avatar_room_hair_front_female_cocoa_cloud_ponytail_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleEspressoSleekRibbonPonyV2: roomAvatarAsset(
    "avatar_room_hair_back_female_espresso_sleek_ribbon_pony_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleEspressoSleekRibbonPonyV2: roomAvatarAsset(
    "avatar_room_hair_front_female_espresso_sleek_ribbon_pony_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleRosewoodButterflyLayersV2: roomAvatarAsset(
    "avatar_room_hair_back_female_rosewood_butterfly_layers_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleRosewoodButterflyLayersV2: roomAvatarAsset(
    "avatar_room_hair_front_female_rosewood_butterfly_layers_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleCaramelBraidedCrownV2: roomAvatarAsset(
    "avatar_room_hair_back_female_caramel_braided_crown_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleCaramelBraidedCrownV2: roomAvatarAsset(
    "avatar_room_hair_front_female_caramel_braided_crown_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleBerryVelvetSoftUpdoV2: roomAvatarAsset(
    "avatar_room_hair_back_female_berry_velvet_soft_updo_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleBerryVelvetSoftUpdoV2: roomAvatarAsset(
    "avatar_room_hair_front_female_berry_velvet_soft_updo_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleChestnutButterflyBobV2: roomAvatarAsset(
    "avatar_room_hair_back_female_chestnut_butterfly_bob_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleChestnutButterflyBobV2: roomAvatarAsset(
    "avatar_room_hair_front_female_chestnut_butterfly_bob_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleGoldenWavesV2: roomAvatarAsset(
    "avatar_room_hair_back_female_golden_waves_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleGoldenWavesV2: roomAvatarAsset(
    "avatar_room_hair_front_female_golden_waves_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleInkPageboyStarV2: roomAvatarAsset(
    "avatar_room_hair_back_female_ink_pageboy_star_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleInkPageboyStarV2: roomAvatarAsset(
    "avatar_room_hair_front_female_ink_pageboy_star_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleInkTwinBraidsV2: roomAvatarAsset(
    "avatar_room_hair_back_female_ink_twin_braids_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleInkTwinBraidsV2: roomAvatarAsset(
    "avatar_room_hair_front_female_ink_twin_braids_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemalePaleGoldenBowBobV2: roomAvatarAsset(
    "avatar_room_hair_back_female_pale_golden_bow_bob_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemalePaleGoldenBowBobV2: roomAvatarAsset(
    "avatar_room_hair_front_female_pale_golden_bow_bob_v2",
    RETIRED_AVATAR_ART
  ),
  hairBackFemaleCopperBowWavesV2: roomAvatarAsset(
    "avatar_room_hair_back_female_copper_bow_waves_v2",
    RETIRED_AVATAR_ART
  ),
  hairFrontFemaleCopperBowWavesV2: roomAvatarAsset(
    "avatar_room_hair_front_female_copper_bow_waves_v2",
    RETIRED_AVATAR_ART
  ),
  eyesFemaleMochaDoeV2: roomAvatarAsset(
    "avatar_room_eyes_female_mocha_doe_v2",
    RETIRED_AVATAR_ART
  ),
  eyesFemaleSageGlassV2: roomAvatarAsset(
    "avatar_room_eyes_female_sage_glass_v2",
    RETIRED_AVATAR_ART
  ),
  eyesFemaleTwilightPlumV2: roomAvatarAsset(
    "avatar_room_eyes_female_twilight_plum_v2",
    RETIRED_AVATAR_ART
  ),
  eyesFemaleHazelAlmondDoeV2: roomAvatarAsset(
    "avatar_room_eyes_female_hazel_almond_doe_v2",
    RETIRED_AVATAR_ART
  ),
  eyesFemaleDeepBrownStarV2: roomAvatarAsset(
    "avatar_room_eyes_female_deep_brown_star_v2",
    RETIRED_AVATAR_ART
  ),
  eyesFemaleCocoaPuppyV2: roomAvatarAsset(
    "avatar_room_eyes_female_cocoa_puppy_v2",
    RETIRED_AVATAR_ART
  ),
  eyesFemaleHoneyAmberV2: roomAvatarAsset(
    "avatar_room_eyes_female_honey_amber_v2",
    RETIRED_AVATAR_ART
  ),
  eyesFemaleChestnutLuminousV2: roomAvatarAsset(
    "avatar_room_eyes_female_chestnut_luminous_v2",
    RETIRED_AVATAR_ART
  ),
  noseFemaleSoftButtonV2: roomAvatarAsset(
    "avatar_room_nose_female_soft_button_v2",
    RETIRED_AVATAR_ART
  ),
  noseFemalePetalCurveV2: roomAvatarAsset(
    "avatar_room_nose_female_petal_curve_v2",
    RETIRED_AVATAR_ART
  ),
  noseFemaleGentleBridgeV2: roomAvatarAsset(
    "avatar_room_nose_female_gentle_bridge_v2",
    RETIRED_AVATAR_ART
  ),
  noseFemaleTinyUpturnedV2: roomAvatarAsset(
    "avatar_room_nose_female_tiny_upturned_v2",
    RETIRED_AVATAR_ART
  ),
  noseFemalePetiteRoundedV2: roomAvatarAsset(
    "avatar_room_nose_female_petite_rounded_v2",
    RETIRED_AVATAR_ART
  ),
  noseFemaleHeartTipV2: roomAvatarAsset(
    "avatar_room_nose_female_heart_tip_v2",
    RETIRED_AVATAR_ART
  ),
  noseFemaleNarrowButtonV2: roomAvatarAsset(
    "avatar_room_nose_female_narrow_button_v2",
    RETIRED_AVATAR_ART
  ),
  noseFemaleSculptedDollV2: roomAvatarAsset(
    "avatar_room_nose_female_sculpted_doll_v2",
    RETIRED_AVATAR_ART
  ),
  mouthFemalePeachWhisperSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_peach_whisper_smile_v2",
    RETIRED_AVATAR_ART
  ),
  mouthFemaleRoseGlossSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_rose_gloss_smile_v2",
    RETIRED_AVATAR_ART
  ),
  mouthFemaleBerrySoftKissV2: roomAvatarAsset(
    "avatar_room_mouth_female_berry_soft_kiss_v2",
    RETIRED_AVATAR_ART
  ),
  mouthFemaleCoralBowSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_coral_bow_smile_v2",
    RETIRED_AVATAR_ART
  ),
  mouthFemaleNudePinkWhisperV2: roomAvatarAsset(
    "avatar_room_mouth_female_nude_pink_whisper_v2",
    RETIRED_AVATAR_ART
  ),
  mouthFemaleCherryBalmSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_cherry_balm_smile_v2",
    RETIRED_AVATAR_ART
  ),
  mouthFemaleSoftMauveSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_soft_mauve_smile_v2",
    RETIRED_AVATAR_ART
  ),
  mouthFemaleRosewaterCupidBowV2: roomAvatarAsset(
    "avatar_room_mouth_female_rosewater_cupid_bow_v2",
    RETIRED_AVATAR_ART
  ),
  shoesFemaleMilkTeaCourtSneakersV2: roomAvatarAsset(
    "avatar_room_shoes_female_milk_tea_court_sneakers_v2",
    RETIRED_AVATAR_ART
  ),
  shoesFemaleCherrySatinBalletsV2: roomAvatarAsset(
    "avatar_room_shoes_female_cherry_satin_ballets_v2",
    RETIRED_AVATAR_ART
  ),
  shoesFemaleOnyxHeartMaryJanesV2: roomAvatarAsset(
    "avatar_room_shoes_female_onyx_heart_mary_janes_v2",
    RETIRED_AVATAR_ART
  ),
  shoesFemaleRosewoodPlatformLoafersV2: roomAvatarAsset(
    "avatar_room_shoes_female_rosewood_platform_loafers_v2",
    RETIRED_AVATAR_ART
  ),
  shoesFemalePearlSlingbackSandalsV2: roomAvatarAsset(
    "avatar_room_shoes_female_pearl_slingback_sandals_v2",
    RETIRED_AVATAR_ART
  ),
  // Mapping Coverage v1 — female clothing layers
  topFemaleCreamKnitV2: roomAvatarAsset(
    "avatar_room_top_female_cream_knit_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleDenimStraightV2: roomAvatarAsset(
    "avatar_room_bottom_female_denim_straight_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleCreamBasicTeeV2: roomAvatarAsset(
    "avatar_room_top_female_cream_basic_tee_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleBlushLaceCardiganV2: roomAvatarAsset(
    "avatar_room_top_female_blush_lace_cardigan_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleSageRibbonKnitJacketV2: roomAvatarAsset(
    "avatar_room_top_female_sage_ribbon_knit_jacket_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleCherryHeartMilkmaidBlouseV2: roomAvatarAsset(
    "avatar_room_top_female_cherry_heart_milkmaid_blouse_v2",
    RETIRED_AVATAR_ART
  ),
  topFemalePowderBlueRibbonCorsetTopV2: roomAvatarAsset(
    "avatar_room_top_female_powder_blue_ribbon_corset_top_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleNoirRoseHeartCardiganV2: roomAvatarAsset(
    "avatar_room_top_female_noir_rose_heart_cardigan_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleDenimSkortShortsV2: roomAvatarAsset(
    "avatar_room_bottom_female_denim_skort_shorts_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleStripedCrochetShortsV2: roomAvatarAsset(
    "avatar_room_bottom_female_striped_crochet_shorts_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleLayeredLaceRuffleMiniSkirtV2: roomAvatarAsset(
    "avatar_room_bottom_female_layered_lace_ruffle_mini_skirt_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleBlackPalmEmbellishedPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_black_palm_embellished_pants_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleCoralEmbellishedLaceupPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_coral_embellished_laceup_pants_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleSmokyFloralMeshPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_smoky_floral_mesh_pants_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleYellowBowLaceRuffleSkirtV2: roomAvatarAsset(
    "avatar_room_bottom_female_yellow_bow_lace_ruffle_skirt_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleBohoPatchworkMaxiDressV2: roomAvatarAsset(
    "avatar_room_top_female_boho_patchwork_maxi_dress_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleBohoPatchworkMaxiDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_boho_patchwork_maxi_dress_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleEmbroideredHalterWrapDressV2: roomAvatarAsset(
    "avatar_room_top_female_embroidered_halter_wrap_dress_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleEmbroideredHalterWrapDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_embroidered_halter_wrap_dress_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleRuchedPatchworkMiniDressV2: roomAvatarAsset(
    "avatar_room_top_female_ruched_patchwork_mini_dress_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleRuchedPatchworkMiniDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_ruched_patchwork_mini_dress_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleWhiteLaceCamiMiniDressV2: roomAvatarAsset(
    "avatar_room_top_female_white_lace_cami_mini_dress_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleWhiteLaceCamiMiniDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_white_lace_cami_mini_dress_v2",
    RETIRED_AVATAR_ART
  )
} as const
