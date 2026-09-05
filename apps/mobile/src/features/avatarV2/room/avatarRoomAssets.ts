import type {
  RoomV2AssetRef,
  RoomV2AvatarAssetSequence
} from "../../roomV2/roomV2.types"
import { femaleSweetCapsuleRoomLayerAssets } from "../femaleSweetCapsuleRoomAssets"
import { roomAvatarMaleCapsuleLayerAssets } from "./avatarRoomMaleCapsuleAssets"
import { roomAvatarMalePremiumCapsuleLayerAssets } from "./avatarRoomMalePremiumCapsuleAssets"
import { ROOM_AVATAR_FRAME_DURATION_MS } from "./avatarRoomMotionContract"

// Room avatar v1 assets use one 256x384 transparent canvas, one centerline,
// and one shared feet baseline so clothing layers can stack without offsets.
export const roomAvatarAsset = (
  key: string,
  source: RoomV2AssetRef["source"]
): RoomV2AssetRef => ({
  key,
  source
})

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
    require("../assets/room/avatar_room_base_male_light_v1.png")
  ),
  faceMaleWarmFriendlyV1: roomAvatarAsset(
    "avatar_room_face_male_warm_friendly_v1",
    require("../assets/room/avatar_room_face_male_warm_friendly_v1.png")
  ),
  hairFrontMaleEspressoCropV1: roomAvatarAsset(
    "avatar_room_hair_front_male_espresso_crop_v1",
    require("../assets/room/avatar_room_hair_front_male_espresso_crop_v1.png")
  ),
  topMaleCreamBasicTeeV1: roomAvatarAsset(
    "avatar_room_top_male_cream_basic_tee_v1",
    require("../assets/room/avatar_room_top_male_cream_basic_tee_v1.png")
  ),
  topMalePowderBlueCrewTeeV1: roomAvatarAsset(
    "avatar_room_top_male_powder_blue_crew_tee_v1",
    require("../assets/room/avatar_room_top_male_powder_blue_crew_tee_v1.png")
  ),
  bottomMaleSageCuffedShortsV1: roomAvatarAsset(
    "avatar_room_bottom_male_sage_cuffed_shorts_v1",
    require("../assets/room/avatar_room_bottom_male_sage_cuffed_shorts_v1.png")
  ),
  bottomMaleNavyStraightPantsV1: roomAvatarAsset(
    "avatar_room_bottom_male_navy_straight_pants_v1",
    require("../assets/room/avatar_room_bottom_male_navy_straight_pants_v1.png")
  ),
  shoesMaleMilkTeaCourtV1: roomAvatarAsset(
    "avatar_room_shoes_male_milk_tea_court_v1",
    require("../assets/room/avatar_room_shoes_male_milk_tea_court_v1.png")
  ),
  ...roomAvatarMaleCapsuleLayerAssets,
  ...roomAvatarMalePremiumCapsuleLayerAssets,
  baseFemaleV2: roomAvatarAsset(
    "avatar_room_base_female_v2",
    require("../assets/room/avatar_room_base_female_v2.png")
  ),
  faceFemaleSoftDollFoundationV2: roomAvatarAsset(
    "avatar_room_face_female_soft_doll_foundation_v2",
    require("../assets/room/avatar_room_face_female_soft_doll_foundation_v2.png")
  ),
  faceFemaleWarmPeachFoundationV2: roomAvatarAsset(
    "avatar_room_face_female_warm_peach_foundation_v2",
    require("../assets/room/avatar_room_face_female_warm_peach_foundation_v2.png")
  ),
  faceFemaleRoseHeartFoundationV2: roomAvatarAsset(
    "avatar_room_face_female_rose_heart_foundation_v2",
    require("../assets/room/avatar_room_face_female_rose_heart_foundation_v2.png")
  ),
  accessoryFemaleIvoryRibbonBeretV2: roomAvatarAsset(
    "avatar_room_accessory_female_ivory_ribbon_beret_v2",
    require("../assets/room/avatar_room_accessory_female_ivory_ribbon_beret_v2.png")
  ),
  accessoryFemaleCherryBowHeadbandV2: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_bow_headband_v2",
    require("../assets/room/avatar_room_accessory_female_cherry_bow_headband_v2.png")
  ),
  accessoryFemaleSageHeartGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_sage_heart_glasses_v2",
    require("../assets/room/avatar_room_accessory_female_sage_heart_glasses_v2.png")
  ),
  accessoryFemaleRoseRoundGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_rose_round_glasses_v2",
    require("../assets/room/avatar_room_accessory_female_rose_round_glasses_v2.png")
  ),
  accessoryFemaleLavenderPearlCatEyeGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_lavender_pearl_cat_eye_glasses_v2",
    require("../assets/room/avatar_room_accessory_female_lavender_pearl_cat_eye_glasses_v2.png")
  ),
  accessoryFemaleMintStarOvalGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_mint_star_oval_glasses_v2",
    require("../assets/room/avatar_room_accessory_female_mint_star_oval_glasses_v2.png")
  ),
  accessoryFemaleHoneyBlossomSquareGlassesV2: roomAvatarAsset(
    "avatar_room_accessory_female_honey_blossom_square_glasses_v2",
    require("../assets/room/avatar_room_accessory_female_honey_blossom_square_glasses_v2.png")
  ),
  accessoryFemalePearlDropEarringsV2: roomAvatarAsset(
    "avatar_room_accessory_female_pearl_drop_earrings_v2",
    require("../assets/room/avatar_room_accessory_female_pearl_drop_earrings_v2.png")
  ),
  accessoryFemalePearlDropEarringsV2EarringRear: roomAvatarAsset(
    "avatar_room_accessory_female_pearl_drop_earrings_v2_part_earring-rear",
    require("../assets/room/avatar_room_accessory_female_pearl_drop_earrings_v2_part_earring-rear.png")
  ),
  accessoryFemalePearlDropEarringsV2PearlFront: roomAvatarAsset(
    "avatar_room_accessory_female_pearl_drop_earrings_v2_part_pearl-front",
    require("../assets/room/avatar_room_accessory_female_pearl_drop_earrings_v2_part_pearl-front.png")
  ),
  accessoryFemaleGoldenHeartLocketV2: roomAvatarAsset(
    "avatar_room_accessory_female_golden_heart_locket_v2",
    require("../assets/room/avatar_room_accessory_female_golden_heart_locket_v2.png")
  ),
  accessoryFemaleButtercreamNeckScarfV2: roomAvatarAsset(
    "avatar_room_accessory_female_buttercream_neck_scarf_v2",
    require("../assets/room/avatar_room_accessory_female_buttercream_neck_scarf_v2.png")
  ),
  accessoryFemaleCherryMicroBagV2: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_micro_bag_v2",
    require("../assets/room/avatar_room_accessory_female_cherry_micro_bag_v2.png")
  ),
  accessoryFemaleCherryMicroBagV2BagBack: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_micro_bag_v2_part_bag-back",
    require("../assets/room/avatar_room_accessory_female_cherry_micro_bag_v2_part_bag-back.png")
  ),
  accessoryFemaleCherryMicroBagV2StrapBack: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_micro_bag_v2_part_strap-back",
    require("../assets/room/avatar_room_accessory_female_cherry_micro_bag_v2_part_strap-back.png")
  ),
  accessoryFemaleCherryMicroBagV2BagFront: roomAvatarAsset(
    "avatar_room_accessory_female_cherry_micro_bag_v2_part_bag-front",
    require("../assets/room/avatar_room_accessory_female_cherry_micro_bag_v2_part_bag-front.png")
  ),
  accessoryFemaleSunnyStarClipsV2: roomAvatarAsset(
    "avatar_room_accessory_female_sunny_star_clips_v2",
    require("../assets/room/avatar_room_accessory_female_sunny_star_clips_v2.png")
  ),
  accessoryFemaleSunnyStarClipsV2ClipsFront: roomAvatarAsset(
    "avatar_room_accessory_female_sunny_star_clips_v2_part_clips-front",
    require("../assets/room/avatar_room_accessory_female_sunny_star_clips_v2_part_clips-front.png")
  ),
  hairBackFemaleMochaRibbonBlowoutV2: roomAvatarAsset(
    "avatar_room_hair_back_female_mocha_ribbon_blowout_v2",
    require("../assets/room/avatar_room_hair_back_female_mocha_ribbon_blowout_v2.png")
  ),
  hairFrontFemaleMochaRibbonBlowoutV2: roomAvatarAsset(
    "avatar_room_hair_front_female_mocha_ribbon_blowout_v2",
    require("../assets/room/avatar_room_hair_front_female_mocha_ribbon_blowout_v2.png")
  ),
  hairBackFemaleMidnightFrenchBobV2: roomAvatarAsset(
    "avatar_room_hair_back_female_midnight_french_bob_v2",
    require("../assets/room/avatar_room_hair_back_female_midnight_french_bob_v2.png")
  ),
  hairFrontFemaleMidnightFrenchBobV2: roomAvatarAsset(
    "avatar_room_hair_front_female_midnight_french_bob_v2",
    require("../assets/room/avatar_room_hair_front_female_midnight_french_bob_v2.png")
  ),
  hairBackFemaleHoneyHalfupWavesV2: roomAvatarAsset(
    "avatar_room_hair_back_female_honey_halfup_waves_v2",
    require("../assets/room/avatar_room_hair_back_female_honey_halfup_waves_v2.png")
  ),
  hairFrontFemaleHoneyHalfupWavesV2: roomAvatarAsset(
    "avatar_room_hair_front_female_honey_halfup_waves_v2",
    require("../assets/room/avatar_room_hair_front_female_honey_halfup_waves_v2.png")
  ),
  hairBackFemaleCherryRibbonTwinBraidsV2: roomAvatarAsset(
    "avatar_room_hair_back_female_cherry_ribbon_twin_braids_v2",
    require("../assets/room/avatar_room_hair_back_female_cherry_ribbon_twin_braids_v2.png")
  ),
  hairFrontFemaleCherryRibbonTwinBraidsV2: roomAvatarAsset(
    "avatar_room_hair_front_female_cherry_ribbon_twin_braids_v2",
    require("../assets/room/avatar_room_hair_front_female_cherry_ribbon_twin_braids_v2.png")
  ),
  hairBackFemaleCocoaCloudPonytailV2: roomAvatarAsset(
    "avatar_room_hair_back_female_cocoa_cloud_ponytail_v2",
    require("../assets/room/avatar_room_hair_back_female_cocoa_cloud_ponytail_v2.png")
  ),
  hairFrontFemaleCocoaCloudPonytailV2: roomAvatarAsset(
    "avatar_room_hair_front_female_cocoa_cloud_ponytail_v2",
    require("../assets/room/avatar_room_hair_front_female_cocoa_cloud_ponytail_v2.png")
  ),
  hairBackFemaleEspressoSleekRibbonPonyV2: roomAvatarAsset(
    "avatar_room_hair_back_female_espresso_sleek_ribbon_pony_v2",
    require("../assets/room/avatar_room_hair_back_female_espresso_sleek_ribbon_pony_v2.png")
  ),
  hairFrontFemaleEspressoSleekRibbonPonyV2: roomAvatarAsset(
    "avatar_room_hair_front_female_espresso_sleek_ribbon_pony_v2",
    require("../assets/room/avatar_room_hair_front_female_espresso_sleek_ribbon_pony_v2.png")
  ),
  hairBackFemaleRosewoodButterflyLayersV2: roomAvatarAsset(
    "avatar_room_hair_back_female_rosewood_butterfly_layers_v2",
    require("../assets/room/avatar_room_hair_back_female_rosewood_butterfly_layers_v2.png")
  ),
  hairFrontFemaleRosewoodButterflyLayersV2: roomAvatarAsset(
    "avatar_room_hair_front_female_rosewood_butterfly_layers_v2",
    require("../assets/room/avatar_room_hair_front_female_rosewood_butterfly_layers_v2.png")
  ),
  hairBackFemaleCaramelBraidedCrownV2: roomAvatarAsset(
    "avatar_room_hair_back_female_caramel_braided_crown_v2",
    require("../assets/room/avatar_room_hair_back_female_caramel_braided_crown_v2.png")
  ),
  hairFrontFemaleCaramelBraidedCrownV2: roomAvatarAsset(
    "avatar_room_hair_front_female_caramel_braided_crown_v2",
    require("../assets/room/avatar_room_hair_front_female_caramel_braided_crown_v2.png")
  ),
  hairBackFemaleBerryVelvetSoftUpdoV2: roomAvatarAsset(
    "avatar_room_hair_back_female_berry_velvet_soft_updo_v2",
    require("../assets/room/avatar_room_hair_back_female_berry_velvet_soft_updo_v2.png")
  ),
  hairFrontFemaleBerryVelvetSoftUpdoV2: roomAvatarAsset(
    "avatar_room_hair_front_female_berry_velvet_soft_updo_v2",
    require("../assets/room/avatar_room_hair_front_female_berry_velvet_soft_updo_v2.png")
  ),
  hairBackFemaleChestnutButterflyBobV2: roomAvatarAsset(
    "avatar_room_hair_back_female_chestnut_butterfly_bob_v2",
    require("../assets/room/avatar_room_hair_back_female_chestnut_butterfly_bob_v2.png")
  ),
  hairFrontFemaleChestnutButterflyBobV2: roomAvatarAsset(
    "avatar_room_hair_front_female_chestnut_butterfly_bob_v2",
    require("../assets/room/avatar_room_hair_front_female_chestnut_butterfly_bob_v2.png")
  ),
  hairBackFemaleGoldenWavesV2: roomAvatarAsset(
    "avatar_room_hair_back_female_golden_waves_v2",
    require("../assets/room/avatar_room_hair_back_female_golden_waves_v2.png")
  ),
  hairFrontFemaleGoldenWavesV2: roomAvatarAsset(
    "avatar_room_hair_front_female_golden_waves_v2",
    require("../assets/room/avatar_room_hair_front_female_golden_waves_v2.png")
  ),
  hairBackFemaleInkPageboyStarV2: roomAvatarAsset(
    "avatar_room_hair_back_female_ink_pageboy_star_v2",
    require("../assets/room/avatar_room_hair_back_female_ink_pageboy_star_v2.png")
  ),
  hairFrontFemaleInkPageboyStarV2: roomAvatarAsset(
    "avatar_room_hair_front_female_ink_pageboy_star_v2",
    require("../assets/room/avatar_room_hair_front_female_ink_pageboy_star_v2.png")
  ),
  hairBackFemaleInkTwinBraidsV2: roomAvatarAsset(
    "avatar_room_hair_back_female_ink_twin_braids_v2",
    require("../assets/room/avatar_room_hair_back_female_ink_twin_braids_v2.png")
  ),
  hairFrontFemaleInkTwinBraidsV2: roomAvatarAsset(
    "avatar_room_hair_front_female_ink_twin_braids_v2",
    require("../assets/room/avatar_room_hair_front_female_ink_twin_braids_v2.png")
  ),
  hairBackFemalePaleGoldenBowBobV2: roomAvatarAsset(
    "avatar_room_hair_back_female_pale_golden_bow_bob_v2",
    require("../assets/room/avatar_room_hair_back_female_pale_golden_bow_bob_v2.png")
  ),
  hairFrontFemalePaleGoldenBowBobV2: roomAvatarAsset(
    "avatar_room_hair_front_female_pale_golden_bow_bob_v2",
    require("../assets/room/avatar_room_hair_front_female_pale_golden_bow_bob_v2.png")
  ),
  hairBackFemaleCopperBowWavesV2: roomAvatarAsset(
    "avatar_room_hair_back_female_copper_bow_waves_v2",
    require("../assets/room/avatar_room_hair_back_female_copper_bow_waves_v2.png")
  ),
  hairFrontFemaleCopperBowWavesV2: roomAvatarAsset(
    "avatar_room_hair_front_female_copper_bow_waves_v2",
    require("../assets/room/avatar_room_hair_front_female_copper_bow_waves_v2.png")
  ),
  eyesFemaleMochaDoeV2: roomAvatarAsset(
    "avatar_room_eyes_female_mocha_doe_v2",
    require("../assets/room/avatar_room_eyes_female_mocha_doe_v2.png")
  ),
  eyesFemaleSageGlassV2: roomAvatarAsset(
    "avatar_room_eyes_female_sage_glass_v2",
    require("../assets/room/avatar_room_eyes_female_sage_glass_v2.png")
  ),
  eyesFemaleTwilightPlumV2: roomAvatarAsset(
    "avatar_room_eyes_female_twilight_plum_v2",
    require("../assets/room/avatar_room_eyes_female_twilight_plum_v2.png")
  ),
  eyesFemaleHazelAlmondDoeV2: roomAvatarAsset(
    "avatar_room_eyes_female_hazel_almond_doe_v2",
    require("../assets/room/avatar_room_eyes_female_hazel_almond_doe_v2.png")
  ),
  eyesFemaleDeepBrownStarV2: roomAvatarAsset(
    "avatar_room_eyes_female_deep_brown_star_v2",
    require("../assets/room/avatar_room_eyes_female_deep_brown_star_v2.png")
  ),
  eyesFemaleCocoaPuppyV2: roomAvatarAsset(
    "avatar_room_eyes_female_cocoa_puppy_v2",
    require("../assets/room/avatar_room_eyes_female_cocoa_puppy_v2.png")
  ),
  eyesFemaleHoneyAmberV2: roomAvatarAsset(
    "avatar_room_eyes_female_honey_amber_v2",
    require("../assets/room/avatar_room_eyes_female_honey_amber_v2.png")
  ),
  eyesFemaleChestnutLuminousV2: roomAvatarAsset(
    "avatar_room_eyes_female_chestnut_luminous_v2",
    require("../assets/room/avatar_room_eyes_female_chestnut_luminous_v2.png")
  ),
  noseFemaleSoftButtonV2: roomAvatarAsset(
    "avatar_room_nose_female_soft_button_v2",
    require("../assets/room/avatar_room_nose_female_soft_button_v2.png")
  ),
  noseFemalePetalCurveV2: roomAvatarAsset(
    "avatar_room_nose_female_petal_curve_v2",
    require("../assets/room/avatar_room_nose_female_petal_curve_v2.png")
  ),
  noseFemaleGentleBridgeV2: roomAvatarAsset(
    "avatar_room_nose_female_gentle_bridge_v2",
    require("../assets/room/avatar_room_nose_female_gentle_bridge_v2.png")
  ),
  noseFemaleTinyUpturnedV2: roomAvatarAsset(
    "avatar_room_nose_female_tiny_upturned_v2",
    require("../assets/room/avatar_room_nose_female_tiny_upturned_v2.png")
  ),
  noseFemalePetiteRoundedV2: roomAvatarAsset(
    "avatar_room_nose_female_petite_rounded_v2",
    require("../assets/room/avatar_room_nose_female_petite_rounded_v2.png")
  ),
  noseFemaleHeartTipV2: roomAvatarAsset(
    "avatar_room_nose_female_heart_tip_v2",
    require("../assets/room/avatar_room_nose_female_heart_tip_v2.png")
  ),
  noseFemaleNarrowButtonV2: roomAvatarAsset(
    "avatar_room_nose_female_narrow_button_v2",
    require("../assets/room/avatar_room_nose_female_narrow_button_v2.png")
  ),
  noseFemaleSculptedDollV2: roomAvatarAsset(
    "avatar_room_nose_female_sculpted_doll_v2",
    require("../assets/room/avatar_room_nose_female_sculpted_doll_v2.png")
  ),
  mouthFemalePeachWhisperSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_peach_whisper_smile_v2",
    require("../assets/room/avatar_room_mouth_female_peach_whisper_smile_v2.png")
  ),
  mouthFemaleRoseGlossSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_rose_gloss_smile_v2",
    require("../assets/room/avatar_room_mouth_female_rose_gloss_smile_v2.png")
  ),
  mouthFemaleBerrySoftKissV2: roomAvatarAsset(
    "avatar_room_mouth_female_berry_soft_kiss_v2",
    require("../assets/room/avatar_room_mouth_female_berry_soft_kiss_v2.png")
  ),
  mouthFemaleCoralBowSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_coral_bow_smile_v2",
    require("../assets/room/avatar_room_mouth_female_coral_bow_smile_v2.png")
  ),
  mouthFemaleNudePinkWhisperV2: roomAvatarAsset(
    "avatar_room_mouth_female_nude_pink_whisper_v2",
    require("../assets/room/avatar_room_mouth_female_nude_pink_whisper_v2.png")
  ),
  mouthFemaleCherryBalmSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_cherry_balm_smile_v2",
    require("../assets/room/avatar_room_mouth_female_cherry_balm_smile_v2.png")
  ),
  mouthFemaleSoftMauveSmileV2: roomAvatarAsset(
    "avatar_room_mouth_female_soft_mauve_smile_v2",
    require("../assets/room/avatar_room_mouth_female_soft_mauve_smile_v2.png")
  ),
  mouthFemaleRosewaterCupidBowV2: roomAvatarAsset(
    "avatar_room_mouth_female_rosewater_cupid_bow_v2",
    require("../assets/room/avatar_room_mouth_female_rosewater_cupid_bow_v2.png")
  ),
  shoesFemaleMilkTeaCourtSneakersV2: roomAvatarAsset(
    "avatar_room_shoes_female_milk_tea_court_sneakers_v2",
    require("../assets/room/avatar_room_shoes_female_milk_tea_court_sneakers_v2.png")
  ),
  shoesFemaleCherrySatinBalletsV2: roomAvatarAsset(
    "avatar_room_shoes_female_cherry_satin_ballets_v2",
    require("../assets/room/avatar_room_shoes_female_cherry_satin_ballets_v2.png")
  ),
  shoesFemaleOnyxHeartMaryJanesV2: roomAvatarAsset(
    "avatar_room_shoes_female_onyx_heart_mary_janes_v2",
    require("../assets/room/avatar_room_shoes_female_onyx_heart_mary_janes_v2.png")
  ),
  shoesFemaleRosewoodPlatformLoafersV2: roomAvatarAsset(
    "avatar_room_shoes_female_rosewood_platform_loafers_v2",
    require("../assets/room/avatar_room_shoes_female_rosewood_platform_loafers_v2.png")
  ),
  shoesFemalePearlSlingbackSandalsV2: roomAvatarAsset(
    "avatar_room_shoes_female_pearl_slingback_sandals_v2",
    require("../assets/room/avatar_room_shoes_female_pearl_slingback_sandals_v2.png")
  ),
  // Mapping Coverage v1 — female clothing layers
  topFemaleCreamKnitV2: roomAvatarAsset(
    "avatar_room_top_female_cream_knit_v2",
    require("../assets/room/avatar_room_top_female_cream_knit_v2.png")
  ),
  bottomFemaleDenimStraightV2: roomAvatarAsset(
    "avatar_room_bottom_female_denim_straight_v2",
    require("../assets/room/avatar_room_bottom_female_denim_straight_v2.png")
  ),
  topFemaleCreamBasicTeeV2: roomAvatarAsset(
    "avatar_room_top_female_cream_basic_tee_v2",
    require("../assets/room/avatar_room_top_female_cream_basic_tee_v2.png")
  ),
  topFemaleBlushLaceCardiganV2: roomAvatarAsset(
    "avatar_room_top_female_blush_lace_cardigan_v2",
    require("../assets/room/avatar_room_top_female_blush_lace_cardigan_v2.png")
  ),
  topFemaleSageRibbonKnitJacketV2: roomAvatarAsset(
    "avatar_room_top_female_sage_ribbon_knit_jacket_v2",
    require("../assets/room/avatar_room_top_female_sage_ribbon_knit_jacket_v2.png")
  ),
  topFemaleCherryHeartMilkmaidBlouseV2: roomAvatarAsset(
    "avatar_room_top_female_cherry_heart_milkmaid_blouse_v2",
    require("../assets/room/avatar_room_top_female_cherry_heart_milkmaid_blouse_v2.png")
  ),
  topFemalePowderBlueRibbonCorsetTopV2: roomAvatarAsset(
    "avatar_room_top_female_powder_blue_ribbon_corset_top_v2",
    require("../assets/room/avatar_room_top_female_powder_blue_ribbon_corset_top_v2.png")
  ),
  topFemaleNoirRoseHeartCardiganV2: roomAvatarAsset(
    "avatar_room_top_female_noir_rose_heart_cardigan_v2",
    require("../assets/room/avatar_room_top_female_noir_rose_heart_cardigan_v2.png")
  ),
  bottomFemaleDenimSkortShortsV2: roomAvatarAsset(
    "avatar_room_bottom_female_denim_skort_shorts_v2",
    require("../assets/room/avatar_room_bottom_female_denim_skort_shorts_v2.png")
  ),
  bottomFemaleStripedCrochetShortsV2: roomAvatarAsset(
    "avatar_room_bottom_female_striped_crochet_shorts_v2",
    require("../assets/room/avatar_room_bottom_female_striped_crochet_shorts_v2.png")
  ),
  bottomFemaleLayeredLaceRuffleMiniSkirtV2: roomAvatarAsset(
    "avatar_room_bottom_female_layered_lace_ruffle_mini_skirt_v2",
    require("../assets/room/avatar_room_bottom_female_layered_lace_ruffle_mini_skirt_v2.png")
  ),
  bottomFemaleBlackPalmEmbellishedPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_black_palm_embellished_pants_v2",
    require("../assets/room/avatar_room_bottom_female_black_palm_embellished_pants_v2.png")
  ),
  bottomFemaleCoralEmbellishedLaceupPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_coral_embellished_laceup_pants_v2",
    require("../assets/room/avatar_room_bottom_female_coral_embellished_laceup_pants_v2.png")
  ),
  bottomFemaleSmokyFloralMeshPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_smoky_floral_mesh_pants_v2",
    require("../assets/room/avatar_room_bottom_female_smoky_floral_mesh_pants_v2.png")
  ),
  bottomFemaleYellowBowLaceRuffleSkirtV2: roomAvatarAsset(
    "avatar_room_bottom_female_yellow_bow_lace_ruffle_skirt_v2",
    require("../assets/room/avatar_room_bottom_female_yellow_bow_lace_ruffle_skirt_v2.png")
  ),
  topFemaleBohoPatchworkMaxiDressV2: roomAvatarAsset(
    "avatar_room_top_female_boho_patchwork_maxi_dress_v2",
    require("../assets/room/avatar_room_top_female_boho_patchwork_maxi_dress_v2.png")
  ),
  bottomFemaleBohoPatchworkMaxiDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_boho_patchwork_maxi_dress_v2",
    require("../assets/room/avatar_room_bottom_female_boho_patchwork_maxi_dress_v2.png")
  ),
  topFemaleEmbroideredHalterWrapDressV2: roomAvatarAsset(
    "avatar_room_top_female_embroidered_halter_wrap_dress_v2",
    require("../assets/room/avatar_room_top_female_embroidered_halter_wrap_dress_v2.png")
  ),
  bottomFemaleEmbroideredHalterWrapDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_embroidered_halter_wrap_dress_v2",
    require("../assets/room/avatar_room_bottom_female_embroidered_halter_wrap_dress_v2.png")
  ),
  topFemaleRuchedPatchworkMiniDressV2: roomAvatarAsset(
    "avatar_room_top_female_ruched_patchwork_mini_dress_v2",
    require("../assets/room/avatar_room_top_female_ruched_patchwork_mini_dress_v2.png")
  ),
  bottomFemaleRuchedPatchworkMiniDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_ruched_patchwork_mini_dress_v2",
    require("../assets/room/avatar_room_bottom_female_ruched_patchwork_mini_dress_v2.png")
  ),
  topFemaleWhiteLaceCamiMiniDressV2: roomAvatarAsset(
    "avatar_room_top_female_white_lace_cami_mini_dress_v2",
    require("../assets/room/avatar_room_top_female_white_lace_cami_mini_dress_v2.png")
  ),
  bottomFemaleWhiteLaceCamiMiniDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_white_lace_cami_mini_dress_v2",
    require("../assets/room/avatar_room_bottom_female_white_lace_cami_mini_dress_v2.png")
  )
} as const
