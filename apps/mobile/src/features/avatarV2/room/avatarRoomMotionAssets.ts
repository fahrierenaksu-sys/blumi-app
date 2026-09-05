import {
  roomAvatarAsset,
  roomAvatarAssetSequence,
  roomAvatarLayerAssets
} from "./avatarRoomAssets"
import { femaleSweetCapsuleRoomMotionLayerAssets } from "../femaleSweetCapsuleRoomMotionAssets"
import { roomAvatarMaleCapsuleMotionAssets } from "./avatarRoomMaleCapsuleAssets"
import { roomAvatarMalePremiumCapsuleMotionAssets } from "./avatarRoomMalePremiumCapsuleAssets"

const walkingFrontSequence = (
  prefix: string,
  f01: Parameters<typeof roomAvatarAsset>[1],
  f02: Parameters<typeof roomAvatarAsset>[1],
  f03: Parameters<typeof roomAvatarAsset>[1],
  f04: Parameters<typeof roomAvatarAsset>[1]
) =>
  roomAvatarAssetSequence([
    roomAvatarAsset(`${prefix}_walking_front_f01`, f01),
    roomAvatarAsset(`${prefix}_walking_front_f02`, f02),
    roomAvatarAsset(`${prefix}_walking_front_f03`, f03),
    roomAvatarAsset(`${prefix}_walking_front_f04`, f04)
  ])

const sittingFrontFrame = (
  prefix: string,
  f01: Parameters<typeof roomAvatarAsset>[1]
) => roomAvatarAsset(`${prefix}_sitting_front_f01`, f01)

const fixedHeadMotion = (
  prefix: string,
  source: Parameters<typeof roomAvatarAsset>[1]
) => ({
  walkingFront: roomAvatarAssetSequence([
    roomAvatarAsset(`${prefix}_walking_front_f01`, source),
    roomAvatarAsset(`${prefix}_walking_front_f02`, source),
    roomAvatarAsset(`${prefix}_walking_front_f03`, source),
    roomAvatarAsset(`${prefix}_walking_front_f04`, source)
  ]),
  sittingFront: roomAvatarAsset(`${prefix}_sitting_front_f01`, source)
})

const frameAwareHeadMotion = (
  prefix: string,
  f01: Parameters<typeof roomAvatarAsset>[1],
  f02: Parameters<typeof roomAvatarAsset>[1],
  f03: Parameters<typeof roomAvatarAsset>[1],
  f04: Parameters<typeof roomAvatarAsset>[1],
  sitting: Parameters<typeof roomAvatarAsset>[1]
) => ({
  walkingFront: walkingFrontSequence(prefix, f01, f02, f03, f04),
  sittingFront: sittingFrontFrame(prefix, sitting)
})

export const roomAvatarMotionLayerAssets = {
  ...femaleSweetCapsuleRoomMotionLayerAssets,
  baseMaleLightV1: {
    walkingFront: walkingFrontSequence(
      "room_avatar_base_male_light_v1",
      require("../assets/room/motion/room_avatar_base_male_light_v1_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_base_male_light_v1_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_base_male_light_v1_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_base_male_light_v1_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_base_male_light_v1",
      require("../assets/room/motion/room_avatar_base_male_light_v1_sitting_front_f01.png")
    )
  },
  faceMaleWarmFriendlyV1: fixedHeadMotion(
    "room_avatar_face_male_warm_friendly_v1",
    roomAvatarLayerAssets.faceMaleWarmFriendlyV1.source
  ),
  hairFrontMaleEspressoCropV1: fixedHeadMotion(
    "room_avatar_hair_front_male_espresso_crop_v1",
    roomAvatarLayerAssets.hairFrontMaleEspressoCropV1.source
  ),
  hairFrontMaleCocoaTexturedQuiffV1: fixedHeadMotion(
    "room_avatar_hair_front_male_cocoa_textured_quiff_v1",
    roomAvatarLayerAssets.hairFrontMaleCocoaTexturedQuiffV1.source
  ),
  hairFrontMaleSoftBlackSidePartV1: fixedHeadMotion(
    "room_avatar_hair_front_male_soft_black_side_part_v1",
    roomAvatarLayerAssets.hairFrontMaleSoftBlackSidePartV1.source
  ),
  hairFrontMaleChestnutShortWavesV1: fixedHeadMotion(
    "room_avatar_hair_front_male_chestnut_short_waves_v1",
    roomAvatarLayerAssets.hairFrontMaleChestnutShortWavesV1.source
  ),
  topMalePowderBlueCrewTeeV1: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_male_powder_blue_crew_tee_v1",
      require("../assets/room/motion/room_avatar_top_male_powder_blue_crew_tee_v1_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_male_powder_blue_crew_tee_v1_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_male_powder_blue_crew_tee_v1_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_male_powder_blue_crew_tee_v1_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_male_powder_blue_crew_tee_v1",
      require("../assets/room/motion/room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png")
    )
  },
  bottomMaleNavyStraightPantsV1: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_male_navy_straight_pants_v1",
      require("../assets/room/motion/room_avatar_bottom_male_navy_straight_pants_v1_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_male_navy_straight_pants_v1_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_male_navy_straight_pants_v1_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_male_navy_straight_pants_v1_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_male_navy_straight_pants_v1",
      require("../assets/room/motion/room_avatar_bottom_male_navy_straight_pants_v1_sitting_front_f01.png")
    )
  },
  bottomMaleSageCuffedShortsV1: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_male_sage_cuffed_shorts_v1",
      require("../assets/room/motion/room_avatar_bottom_male_sage_cuffed_shorts_v1_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_male_sage_cuffed_shorts_v1_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_male_sage_cuffed_shorts_v1_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_male_sage_cuffed_shorts_v1_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_male_sage_cuffed_shorts_v1",
      require("../assets/room/motion/room_avatar_bottom_male_sage_cuffed_shorts_v1_sitting_front_f01.png")
    )
  },
  shoesMaleMilkTeaCourtV1: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_male_milk_tea_court_v1",
      require("../assets/room/motion/room_avatar_shoes_male_milk_tea_court_v1_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_shoes_male_milk_tea_court_v1_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_shoes_male_milk_tea_court_v1_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_shoes_male_milk_tea_court_v1_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_male_milk_tea_court_v1",
      require("../assets/room/motion/room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png")
    )
  },
  ...roomAvatarMaleCapsuleMotionAssets,
  ...roomAvatarMalePremiumCapsuleMotionAssets,
  baseFemaleV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_base_female_v2",
      require("../assets/room/motion/room_avatar_base_female_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_base_female_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_base_female_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_base_female_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_base_female_v2",
      require("../assets/room/motion/room_avatar_base_female_v2_sitting_front_f01.png")
    )
  },
  faceFemaleSoftDollFoundationV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_face_female_soft_doll_foundation_v2",
      require("../assets/room/motion/room_avatar_face_female_soft_doll_foundation_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_face_female_soft_doll_foundation_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_face_female_soft_doll_foundation_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_face_female_soft_doll_foundation_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_face_female_soft_doll_foundation_v2",
      require("../assets/room/motion/room_avatar_face_female_soft_doll_foundation_v2_sitting_front_f01.png")
    )
  },
  faceFemaleWarmPeachFoundationV2: frameAwareHeadMotion(
    "room_avatar_face_female_warm_peach_foundation_v2",
    require("../assets/room/motion/room_avatar_face_female_warm_peach_foundation_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_face_female_warm_peach_foundation_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_face_female_warm_peach_foundation_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_face_female_warm_peach_foundation_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_face_female_warm_peach_foundation_v2_sitting_front_f01.png")
  ),
  faceFemaleRoseHeartFoundationV2: frameAwareHeadMotion(
    "room_avatar_face_female_rose_heart_foundation_v2",
    require("../assets/room/motion/room_avatar_face_female_rose_heart_foundation_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_face_female_rose_heart_foundation_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_face_female_rose_heart_foundation_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_face_female_rose_heart_foundation_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_face_female_rose_heart_foundation_v2_sitting_front_f01.png")
  ),
  hairBackFemaleMochaRibbonBlowoutV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_back_female_mocha_ribbon_blowout_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_mocha_ribbon_blowout_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_mocha_ribbon_blowout_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_mocha_ribbon_blowout_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_mocha_ribbon_blowout_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_back_female_mocha_ribbon_blowout_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_mocha_ribbon_blowout_v2_sitting_front_f01.png")
    )
  },
  hairFrontFemaleMochaRibbonBlowoutV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_front_female_mocha_ribbon_blowout_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_mocha_ribbon_blowout_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_mocha_ribbon_blowout_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_mocha_ribbon_blowout_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_mocha_ribbon_blowout_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_front_female_mocha_ribbon_blowout_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_mocha_ribbon_blowout_v2_sitting_front_f01.png")
    )
  },
  hairBackFemaleMidnightFrenchBobV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_back_female_midnight_french_bob_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_midnight_french_bob_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_midnight_french_bob_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_midnight_french_bob_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_midnight_french_bob_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_back_female_midnight_french_bob_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_midnight_french_bob_v2_sitting_front_f01.png")
    )
  },
  hairFrontFemaleMidnightFrenchBobV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_front_female_midnight_french_bob_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_midnight_french_bob_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_midnight_french_bob_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_midnight_french_bob_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_midnight_french_bob_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_front_female_midnight_french_bob_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_midnight_french_bob_v2_sitting_front_f01.png")
    )
  },
  hairBackFemaleHoneyHalfupWavesV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_back_female_honey_halfup_waves_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_honey_halfup_waves_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_honey_halfup_waves_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_honey_halfup_waves_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_honey_halfup_waves_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_back_female_honey_halfup_waves_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_honey_halfup_waves_v2_sitting_front_f01.png")
    )
  },
  hairFrontFemaleHoneyHalfupWavesV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_front_female_honey_halfup_waves_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_honey_halfup_waves_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_honey_halfup_waves_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_honey_halfup_waves_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_honey_halfup_waves_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_front_female_honey_halfup_waves_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_honey_halfup_waves_v2_sitting_front_f01.png")
    )
  },
  hairBackFemaleCocoaCloudPonytailV2: frameAwareHeadMotion(
    "room_avatar_hair_back_female_cocoa_cloud_ponytail_v2",
    require("../assets/room/motion/room_avatar_hair_back_female_cocoa_cloud_ponytail_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_cocoa_cloud_ponytail_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_cocoa_cloud_ponytail_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_cocoa_cloud_ponytail_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_cocoa_cloud_ponytail_v2_sitting_front_f01.png")
  ),
  hairFrontFemaleCocoaCloudPonytailV2: frameAwareHeadMotion(
    "room_avatar_hair_front_female_cocoa_cloud_ponytail_v2",
    require("../assets/room/motion/room_avatar_hair_front_female_cocoa_cloud_ponytail_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_cocoa_cloud_ponytail_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_cocoa_cloud_ponytail_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_cocoa_cloud_ponytail_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_cocoa_cloud_ponytail_v2_sitting_front_f01.png")
  ),
  hairBackFemaleEspressoSleekRibbonPonyV2: frameAwareHeadMotion(
    "room_avatar_hair_back_female_espresso_sleek_ribbon_pony_v2",
    require("../assets/room/motion/room_avatar_hair_back_female_espresso_sleek_ribbon_pony_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_espresso_sleek_ribbon_pony_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_espresso_sleek_ribbon_pony_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_espresso_sleek_ribbon_pony_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_espresso_sleek_ribbon_pony_v2_sitting_front_f01.png")
  ),
  hairFrontFemaleEspressoSleekRibbonPonyV2: frameAwareHeadMotion(
    "room_avatar_hair_front_female_espresso_sleek_ribbon_pony_v2",
    require("../assets/room/motion/room_avatar_hair_front_female_espresso_sleek_ribbon_pony_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_espresso_sleek_ribbon_pony_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_espresso_sleek_ribbon_pony_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_espresso_sleek_ribbon_pony_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_espresso_sleek_ribbon_pony_v2_sitting_front_f01.png")
  ),
  hairBackFemaleCherryRibbonTwinBraidsV2: frameAwareHeadMotion(
    "room_avatar_hair_back_female_cherry_ribbon_twin_braids_v2",
    require("../assets/room/motion/room_avatar_hair_back_female_cherry_ribbon_twin_braids_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_cherry_ribbon_twin_braids_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_cherry_ribbon_twin_braids_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_cherry_ribbon_twin_braids_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_cherry_ribbon_twin_braids_v2_sitting_front_f01.png")
  ),
  hairFrontFemaleCherryRibbonTwinBraidsV2: frameAwareHeadMotion(
    "room_avatar_hair_front_female_cherry_ribbon_twin_braids_v2",
    require("../assets/room/motion/room_avatar_hair_front_female_cherry_ribbon_twin_braids_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_cherry_ribbon_twin_braids_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_cherry_ribbon_twin_braids_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_cherry_ribbon_twin_braids_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_cherry_ribbon_twin_braids_v2_sitting_front_f01.png")
  ),
  hairBackFemaleRosewoodButterflyLayersV2: frameAwareHeadMotion(
    "room_avatar_hair_back_female_rosewood_butterfly_layers_v2",
    require("../assets/room/motion/room_avatar_hair_back_female_rosewood_butterfly_layers_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_rosewood_butterfly_layers_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_rosewood_butterfly_layers_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_rosewood_butterfly_layers_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_rosewood_butterfly_layers_v2_sitting_front_f01.png")
  ),
  hairFrontFemaleRosewoodButterflyLayersV2: frameAwareHeadMotion(
    "room_avatar_hair_front_female_rosewood_butterfly_layers_v2",
    require("../assets/room/motion/room_avatar_hair_front_female_rosewood_butterfly_layers_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_rosewood_butterfly_layers_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_rosewood_butterfly_layers_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_rosewood_butterfly_layers_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_rosewood_butterfly_layers_v2_sitting_front_f01.png")
  ),
  hairBackFemaleCaramelBraidedCrownV2: frameAwareHeadMotion(
    "room_avatar_hair_back_female_caramel_braided_crown_v2",
    require("../assets/room/motion/room_avatar_hair_back_female_caramel_braided_crown_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_caramel_braided_crown_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_caramel_braided_crown_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_caramel_braided_crown_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_caramel_braided_crown_v2_sitting_front_f01.png")
  ),
  hairFrontFemaleCaramelBraidedCrownV2: frameAwareHeadMotion(
    "room_avatar_hair_front_female_caramel_braided_crown_v2",
    require("../assets/room/motion/room_avatar_hair_front_female_caramel_braided_crown_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_caramel_braided_crown_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_caramel_braided_crown_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_caramel_braided_crown_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_caramel_braided_crown_v2_sitting_front_f01.png")
  ),
  hairBackFemaleBerryVelvetSoftUpdoV2: frameAwareHeadMotion(
    "room_avatar_hair_back_female_berry_velvet_soft_updo_v2",
    require("../assets/room/motion/room_avatar_hair_back_female_berry_velvet_soft_updo_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_berry_velvet_soft_updo_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_berry_velvet_soft_updo_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_berry_velvet_soft_updo_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_back_female_berry_velvet_soft_updo_v2_sitting_front_f01.png")
  ),
  hairFrontFemaleBerryVelvetSoftUpdoV2: frameAwareHeadMotion(
    "room_avatar_hair_front_female_berry_velvet_soft_updo_v2",
    require("../assets/room/motion/room_avatar_hair_front_female_berry_velvet_soft_updo_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_berry_velvet_soft_updo_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_berry_velvet_soft_updo_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_berry_velvet_soft_updo_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_hair_front_female_berry_velvet_soft_updo_v2_sitting_front_f01.png")
  ),
  hairBackFemaleChestnutButterflyBobV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_back_female_chestnut_butterfly_bob_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_chestnut_butterfly_bob_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_chestnut_butterfly_bob_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_chestnut_butterfly_bob_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_chestnut_butterfly_bob_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_back_female_chestnut_butterfly_bob_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_chestnut_butterfly_bob_v2_sitting_front_f01.png")
    )
  },
  hairFrontFemaleChestnutButterflyBobV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_front_female_chestnut_butterfly_bob_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_chestnut_butterfly_bob_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_chestnut_butterfly_bob_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_chestnut_butterfly_bob_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_chestnut_butterfly_bob_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_front_female_chestnut_butterfly_bob_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_chestnut_butterfly_bob_v2_sitting_front_f01.png")
    )
  },
  hairBackFemaleGoldenWavesV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_back_female_golden_waves_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_golden_waves_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_golden_waves_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_golden_waves_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_golden_waves_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_back_female_golden_waves_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_golden_waves_v2_sitting_front_f01.png")
    )
  },
  hairFrontFemaleGoldenWavesV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_front_female_golden_waves_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_golden_waves_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_golden_waves_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_golden_waves_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_golden_waves_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_front_female_golden_waves_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_golden_waves_v2_sitting_front_f01.png")
    )
  },
  hairBackFemaleInkPageboyStarV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_back_female_ink_pageboy_star_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_ink_pageboy_star_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_ink_pageboy_star_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_ink_pageboy_star_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_ink_pageboy_star_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_back_female_ink_pageboy_star_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_ink_pageboy_star_v2_sitting_front_f01.png")
    )
  },
  hairFrontFemaleInkPageboyStarV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_front_female_ink_pageboy_star_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_ink_pageboy_star_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_ink_pageboy_star_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_ink_pageboy_star_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_ink_pageboy_star_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_front_female_ink_pageboy_star_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_ink_pageboy_star_v2_sitting_front_f01.png")
    )
  },
  hairBackFemaleInkTwinBraidsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_back_female_ink_twin_braids_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_ink_twin_braids_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_ink_twin_braids_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_ink_twin_braids_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_ink_twin_braids_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_back_female_ink_twin_braids_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_ink_twin_braids_v2_sitting_front_f01.png")
    )
  },
  hairFrontFemaleInkTwinBraidsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_front_female_ink_twin_braids_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_ink_twin_braids_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_ink_twin_braids_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_ink_twin_braids_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_ink_twin_braids_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_front_female_ink_twin_braids_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_ink_twin_braids_v2_sitting_front_f01.png")
    )
  },
  hairBackFemalePaleGoldenBowBobV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_back_female_pale_golden_bow_bob_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_pale_golden_bow_bob_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_pale_golden_bow_bob_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_pale_golden_bow_bob_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_pale_golden_bow_bob_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_back_female_pale_golden_bow_bob_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_pale_golden_bow_bob_v2_sitting_front_f01.png")
    )
  },
  hairFrontFemalePaleGoldenBowBobV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_front_female_pale_golden_bow_bob_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_pale_golden_bow_bob_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_pale_golden_bow_bob_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_pale_golden_bow_bob_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_pale_golden_bow_bob_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_front_female_pale_golden_bow_bob_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_pale_golden_bow_bob_v2_sitting_front_f01.png")
    )
  },
  hairBackFemaleCopperBowWavesV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_back_female_copper_bow_waves_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_copper_bow_waves_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_copper_bow_waves_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_copper_bow_waves_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_back_female_copper_bow_waves_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_back_female_copper_bow_waves_v2",
      require("../assets/room/motion/room_avatar_hair_back_female_copper_bow_waves_v2_sitting_front_f01.png")
    )
  },
  hairFrontFemaleCopperBowWavesV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_hair_front_female_copper_bow_waves_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_copper_bow_waves_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_copper_bow_waves_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_copper_bow_waves_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_hair_front_female_copper_bow_waves_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_hair_front_female_copper_bow_waves_v2",
      require("../assets/room/motion/room_avatar_hair_front_female_copper_bow_waves_v2_sitting_front_f01.png")
    )
  },
  eyesFemaleMochaDoeV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_eyes_female_mocha_doe_v2",
      require("../assets/room/motion/room_avatar_eyes_female_mocha_doe_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_eyes_female_mocha_doe_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_eyes_female_mocha_doe_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_eyes_female_mocha_doe_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_eyes_female_mocha_doe_v2",
      require("../assets/room/motion/room_avatar_eyes_female_mocha_doe_v2_sitting_front_f01.png")
    )
  },
  eyesFemaleSageGlassV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_eyes_female_sage_glass_v2",
      require("../assets/room/motion/room_avatar_eyes_female_sage_glass_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_eyes_female_sage_glass_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_eyes_female_sage_glass_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_eyes_female_sage_glass_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_eyes_female_sage_glass_v2",
      require("../assets/room/motion/room_avatar_eyes_female_sage_glass_v2_sitting_front_f01.png")
    )
  },
  eyesFemaleTwilightPlumV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_eyes_female_twilight_plum_v2",
      require("../assets/room/motion/room_avatar_eyes_female_twilight_plum_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_eyes_female_twilight_plum_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_eyes_female_twilight_plum_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_eyes_female_twilight_plum_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_eyes_female_twilight_plum_v2",
      require("../assets/room/motion/room_avatar_eyes_female_twilight_plum_v2_sitting_front_f01.png")
    )
  },
  noseFemaleSoftButtonV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_nose_female_soft_button_v2",
      require("../assets/room/motion/room_avatar_nose_female_soft_button_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_nose_female_soft_button_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_nose_female_soft_button_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_nose_female_soft_button_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_nose_female_soft_button_v2",
      require("../assets/room/motion/room_avatar_nose_female_soft_button_v2_sitting_front_f01.png")
    )
  },
  noseFemalePetalCurveV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_nose_female_petal_curve_v2",
      require("../assets/room/motion/room_avatar_nose_female_petal_curve_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_nose_female_petal_curve_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_nose_female_petal_curve_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_nose_female_petal_curve_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_nose_female_petal_curve_v2",
      require("../assets/room/motion/room_avatar_nose_female_petal_curve_v2_sitting_front_f01.png")
    )
  },
  noseFemaleGentleBridgeV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_nose_female_gentle_bridge_v2",
      require("../assets/room/motion/room_avatar_nose_female_gentle_bridge_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_nose_female_gentle_bridge_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_nose_female_gentle_bridge_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_nose_female_gentle_bridge_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_nose_female_gentle_bridge_v2",
      require("../assets/room/motion/room_avatar_nose_female_gentle_bridge_v2_sitting_front_f01.png")
    )
  },
  mouthFemalePeachWhisperSmileV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_mouth_female_peach_whisper_smile_v2",
      require("../assets/room/motion/room_avatar_mouth_female_peach_whisper_smile_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_mouth_female_peach_whisper_smile_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_mouth_female_peach_whisper_smile_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_mouth_female_peach_whisper_smile_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_mouth_female_peach_whisper_smile_v2",
      require("../assets/room/motion/room_avatar_mouth_female_peach_whisper_smile_v2_sitting_front_f01.png")
    )
  },
  mouthFemaleRoseGlossSmileV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_mouth_female_rose_gloss_smile_v2",
      require("../assets/room/motion/room_avatar_mouth_female_rose_gloss_smile_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_mouth_female_rose_gloss_smile_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_mouth_female_rose_gloss_smile_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_mouth_female_rose_gloss_smile_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_mouth_female_rose_gloss_smile_v2",
      require("../assets/room/motion/room_avatar_mouth_female_rose_gloss_smile_v2_sitting_front_f01.png")
    )
  },
  mouthFemaleBerrySoftKissV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_mouth_female_berry_soft_kiss_v2",
      require("../assets/room/motion/room_avatar_mouth_female_berry_soft_kiss_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_mouth_female_berry_soft_kiss_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_mouth_female_berry_soft_kiss_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_mouth_female_berry_soft_kiss_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_mouth_female_berry_soft_kiss_v2",
      require("../assets/room/motion/room_avatar_mouth_female_berry_soft_kiss_v2_sitting_front_f01.png")
    )
  },
  eyesFemaleHazelAlmondDoeV2: frameAwareHeadMotion(
    "room_avatar_eyes_female_hazel_almond_doe_v2",
    require("../assets/room/motion/room_avatar_eyes_female_hazel_almond_doe_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_eyes_female_hazel_almond_doe_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_eyes_female_hazel_almond_doe_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_eyes_female_hazel_almond_doe_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_eyes_female_hazel_almond_doe_v2_sitting_front_f01.png")
  ),
  eyesFemaleDeepBrownStarV2: frameAwareHeadMotion(
    "room_avatar_eyes_female_deep_brown_star_v2",
    require("../assets/room/motion/room_avatar_eyes_female_deep_brown_star_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_eyes_female_deep_brown_star_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_eyes_female_deep_brown_star_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_eyes_female_deep_brown_star_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_eyes_female_deep_brown_star_v2_sitting_front_f01.png")
  ),
  eyesFemaleCocoaPuppyV2: frameAwareHeadMotion(
    "room_avatar_eyes_female_cocoa_puppy_v2",
    require("../assets/room/motion/room_avatar_eyes_female_cocoa_puppy_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_eyes_female_cocoa_puppy_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_eyes_female_cocoa_puppy_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_eyes_female_cocoa_puppy_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_eyes_female_cocoa_puppy_v2_sitting_front_f01.png")
  ),
  eyesFemaleHoneyAmberV2: frameAwareHeadMotion(
    "room_avatar_eyes_female_honey_amber_v2",
    require("../assets/room/motion/room_avatar_eyes_female_honey_amber_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_eyes_female_honey_amber_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_eyes_female_honey_amber_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_eyes_female_honey_amber_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_eyes_female_honey_amber_v2_sitting_front_f01.png")
  ),
  eyesFemaleChestnutLuminousV2: frameAwareHeadMotion(
    "room_avatar_eyes_female_chestnut_luminous_v2",
    require("../assets/room/motion/room_avatar_eyes_female_chestnut_luminous_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_eyes_female_chestnut_luminous_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_eyes_female_chestnut_luminous_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_eyes_female_chestnut_luminous_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_eyes_female_chestnut_luminous_v2_sitting_front_f01.png")
  ),
  noseFemaleTinyUpturnedV2: frameAwareHeadMotion(
    "room_avatar_nose_female_tiny_upturned_v2",
    require("../assets/room/motion/room_avatar_nose_female_tiny_upturned_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_nose_female_tiny_upturned_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_nose_female_tiny_upturned_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_nose_female_tiny_upturned_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_nose_female_tiny_upturned_v2_sitting_front_f01.png")
  ),
  noseFemalePetiteRoundedV2: frameAwareHeadMotion(
    "room_avatar_nose_female_petite_rounded_v2",
    require("../assets/room/motion/room_avatar_nose_female_petite_rounded_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_nose_female_petite_rounded_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_nose_female_petite_rounded_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_nose_female_petite_rounded_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_nose_female_petite_rounded_v2_sitting_front_f01.png")
  ),
  noseFemaleHeartTipV2: frameAwareHeadMotion(
    "room_avatar_nose_female_heart_tip_v2",
    require("../assets/room/motion/room_avatar_nose_female_heart_tip_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_nose_female_heart_tip_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_nose_female_heart_tip_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_nose_female_heart_tip_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_nose_female_heart_tip_v2_sitting_front_f01.png")
  ),
  noseFemaleNarrowButtonV2: frameAwareHeadMotion(
    "room_avatar_nose_female_narrow_button_v2",
    require("../assets/room/motion/room_avatar_nose_female_narrow_button_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_nose_female_narrow_button_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_nose_female_narrow_button_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_nose_female_narrow_button_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_nose_female_narrow_button_v2_sitting_front_f01.png")
  ),
  noseFemaleSculptedDollV2: frameAwareHeadMotion(
    "room_avatar_nose_female_sculpted_doll_v2",
    require("../assets/room/motion/room_avatar_nose_female_sculpted_doll_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_nose_female_sculpted_doll_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_nose_female_sculpted_doll_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_nose_female_sculpted_doll_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_nose_female_sculpted_doll_v2_sitting_front_f01.png")
  ),
  mouthFemaleCoralBowSmileV2: frameAwareHeadMotion(
    "room_avatar_mouth_female_coral_bow_smile_v2",
    require("../assets/room/motion/room_avatar_mouth_female_coral_bow_smile_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_mouth_female_coral_bow_smile_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_mouth_female_coral_bow_smile_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_mouth_female_coral_bow_smile_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_mouth_female_coral_bow_smile_v2_sitting_front_f01.png")
  ),
  mouthFemaleNudePinkWhisperV2: frameAwareHeadMotion(
    "room_avatar_mouth_female_nude_pink_whisper_v2",
    require("../assets/room/motion/room_avatar_mouth_female_nude_pink_whisper_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_mouth_female_nude_pink_whisper_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_mouth_female_nude_pink_whisper_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_mouth_female_nude_pink_whisper_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_mouth_female_nude_pink_whisper_v2_sitting_front_f01.png")
  ),
  mouthFemaleCherryBalmSmileV2: frameAwareHeadMotion(
    "room_avatar_mouth_female_cherry_balm_smile_v2",
    require("../assets/room/motion/room_avatar_mouth_female_cherry_balm_smile_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_mouth_female_cherry_balm_smile_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_mouth_female_cherry_balm_smile_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_mouth_female_cherry_balm_smile_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_mouth_female_cherry_balm_smile_v2_sitting_front_f01.png")
  ),
  mouthFemaleSoftMauveSmileV2: frameAwareHeadMotion(
    "room_avatar_mouth_female_soft_mauve_smile_v2",
    require("../assets/room/motion/room_avatar_mouth_female_soft_mauve_smile_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_mouth_female_soft_mauve_smile_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_mouth_female_soft_mauve_smile_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_mouth_female_soft_mauve_smile_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_mouth_female_soft_mauve_smile_v2_sitting_front_f01.png")
  ),
  mouthFemaleRosewaterCupidBowV2: frameAwareHeadMotion(
    "room_avatar_mouth_female_rosewater_cupid_bow_v2",
    require("../assets/room/motion/room_avatar_mouth_female_rosewater_cupid_bow_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_mouth_female_rosewater_cupid_bow_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_mouth_female_rosewater_cupid_bow_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_mouth_female_rosewater_cupid_bow_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_mouth_female_rosewater_cupid_bow_v2_sitting_front_f01.png")
  ),
  shoesFemaleMilkTeaCourtSneakersV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_milk_tea_court_sneakers_v2",
      require("../assets/room/motion/room_avatar_shoes_female_milk_tea_court_sneakers_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_shoes_female_milk_tea_court_sneakers_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_shoes_female_milk_tea_court_sneakers_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_shoes_female_milk_tea_court_sneakers_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_milk_tea_court_sneakers_v2",
      require("../assets/room/motion/room_avatar_shoes_female_milk_tea_court_sneakers_v2_sitting_front_f01.png")
    )
  },
  shoesFemaleCherrySatinBalletsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_cherry_satin_ballets_v2",
      require("../assets/room/motion/room_avatar_shoes_female_cherry_satin_ballets_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_shoes_female_cherry_satin_ballets_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_shoes_female_cherry_satin_ballets_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_shoes_female_cherry_satin_ballets_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_cherry_satin_ballets_v2",
      require("../assets/room/motion/room_avatar_shoes_female_cherry_satin_ballets_v2_sitting_front_f01.png")
    )
  },
  shoesFemaleOnyxHeartMaryJanesV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_onyx_heart_mary_janes_v2",
      require("../assets/room/motion/room_avatar_shoes_female_onyx_heart_mary_janes_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_shoes_female_onyx_heart_mary_janes_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_shoes_female_onyx_heart_mary_janes_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_shoes_female_onyx_heart_mary_janes_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_onyx_heart_mary_janes_v2",
      require("../assets/room/motion/room_avatar_shoes_female_onyx_heart_mary_janes_v2_sitting_front_f01.png")
    )
  },
  topFemaleCreamBasicTeeV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_cream_basic_tee_v2",
      require("../assets/room/motion/room_avatar_top_female_cream_basic_tee_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_cream_basic_tee_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_cream_basic_tee_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_cream_basic_tee_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_cream_basic_tee_v2",
      require("../assets/room/motion/room_avatar_top_female_cream_basic_tee_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleDenimSkortShortsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_denim_skort_shorts_v2",
      require("../assets/room/motion/room_avatar_bottom_female_denim_skort_shorts_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_denim_skort_shorts_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_denim_skort_shorts_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_denim_skort_shorts_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_denim_skort_shorts_v2",
      require("../assets/room/motion/room_avatar_bottom_female_denim_skort_shorts_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleStripedCrochetShortsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_striped_crochet_shorts_v2",
      require("../assets/room/motion/room_avatar_bottom_female_striped_crochet_shorts_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_striped_crochet_shorts_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_striped_crochet_shorts_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_striped_crochet_shorts_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_striped_crochet_shorts_v2",
      require("../assets/room/motion/room_avatar_bottom_female_striped_crochet_shorts_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleLayeredLaceRuffleMiniSkirtV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2",
      require("../assets/room/motion/room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2",
      require("../assets/room/motion/room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleBlackPalmEmbellishedPantsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_black_palm_embellished_pants_v2",
      require("../assets/room/motion/room_avatar_bottom_female_black_palm_embellished_pants_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_black_palm_embellished_pants_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_black_palm_embellished_pants_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_black_palm_embellished_pants_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_black_palm_embellished_pants_v2",
      require("../assets/room/motion/room_avatar_bottom_female_black_palm_embellished_pants_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleCoralEmbellishedLaceupPantsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_coral_embellished_laceup_pants_v2",
      require("../assets/room/motion/room_avatar_bottom_female_coral_embellished_laceup_pants_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_coral_embellished_laceup_pants_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_coral_embellished_laceup_pants_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_coral_embellished_laceup_pants_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_coral_embellished_laceup_pants_v2",
      require("../assets/room/motion/room_avatar_bottom_female_coral_embellished_laceup_pants_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleSmokyFloralMeshPantsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_smoky_floral_mesh_pants_v2",
      require("../assets/room/motion/room_avatar_bottom_female_smoky_floral_mesh_pants_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_smoky_floral_mesh_pants_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_smoky_floral_mesh_pants_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_smoky_floral_mesh_pants_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_smoky_floral_mesh_pants_v2",
      require("../assets/room/motion/room_avatar_bottom_female_smoky_floral_mesh_pants_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleYellowBowLaceRuffleSkirtV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2",
      require("../assets/room/motion/room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2",
      require("../assets/room/motion/room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2_sitting_front_f01.png")
    )
  },
  topFemaleBohoPatchworkMaxiDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_boho_patchwork_maxi_dress_v2",
      require("../assets/room/motion/room_avatar_top_female_boho_patchwork_maxi_dress_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_boho_patchwork_maxi_dress_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_boho_patchwork_maxi_dress_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_boho_patchwork_maxi_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_boho_patchwork_maxi_dress_v2",
      require("../assets/room/motion/room_avatar_top_female_boho_patchwork_maxi_dress_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleBohoPatchworkMaxiDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_boho_patchwork_maxi_dress_v2",
      require("../assets/room/motion/room_avatar_bottom_female_boho_patchwork_maxi_dress_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_boho_patchwork_maxi_dress_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_boho_patchwork_maxi_dress_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_boho_patchwork_maxi_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_boho_patchwork_maxi_dress_v2",
      require("../assets/room/motion/room_avatar_bottom_female_boho_patchwork_maxi_dress_v2_sitting_front_f01.png")
    )
  },
  topFemaleEmbroideredHalterWrapDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_embroidered_halter_wrap_dress_v2",
      require("../assets/room/motion/room_avatar_top_female_embroidered_halter_wrap_dress_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_embroidered_halter_wrap_dress_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_embroidered_halter_wrap_dress_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_embroidered_halter_wrap_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_embroidered_halter_wrap_dress_v2",
      require("../assets/room/motion/room_avatar_top_female_embroidered_halter_wrap_dress_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleEmbroideredHalterWrapDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_embroidered_halter_wrap_dress_v2",
      require("../assets/room/motion/room_avatar_bottom_female_embroidered_halter_wrap_dress_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_embroidered_halter_wrap_dress_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_embroidered_halter_wrap_dress_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_embroidered_halter_wrap_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_embroidered_halter_wrap_dress_v2",
      require("../assets/room/motion/room_avatar_bottom_female_embroidered_halter_wrap_dress_v2_sitting_front_f01.png")
    )
  },
  topFemaleRuchedPatchworkMiniDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_ruched_patchwork_mini_dress_v2",
      require("../assets/room/motion/room_avatar_top_female_ruched_patchwork_mini_dress_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_ruched_patchwork_mini_dress_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_ruched_patchwork_mini_dress_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_ruched_patchwork_mini_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_ruched_patchwork_mini_dress_v2",
      require("../assets/room/motion/room_avatar_top_female_ruched_patchwork_mini_dress_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleRuchedPatchworkMiniDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_ruched_patchwork_mini_dress_v2",
      require("../assets/room/motion/room_avatar_bottom_female_ruched_patchwork_mini_dress_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_ruched_patchwork_mini_dress_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_ruched_patchwork_mini_dress_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_ruched_patchwork_mini_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_ruched_patchwork_mini_dress_v2",
      require("../assets/room/motion/room_avatar_bottom_female_ruched_patchwork_mini_dress_v2_sitting_front_f01.png")
    )
  },
  topFemaleWhiteLaceCamiMiniDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_white_lace_cami_mini_dress_v2",
      require("../assets/room/motion/room_avatar_top_female_white_lace_cami_mini_dress_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_white_lace_cami_mini_dress_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_white_lace_cami_mini_dress_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_white_lace_cami_mini_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_white_lace_cami_mini_dress_v2",
      require("../assets/room/motion/room_avatar_top_female_white_lace_cami_mini_dress_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleWhiteLaceCamiMiniDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_white_lace_cami_mini_dress_v2",
      require("../assets/room/motion/room_avatar_bottom_female_white_lace_cami_mini_dress_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_bottom_female_white_lace_cami_mini_dress_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_bottom_female_white_lace_cami_mini_dress_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_bottom_female_white_lace_cami_mini_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_white_lace_cami_mini_dress_v2",
      require("../assets/room/motion/room_avatar_bottom_female_white_lace_cami_mini_dress_v2_sitting_front_f01.png")
    )
  },
  accessoryFemaleIvoryRibbonBeretV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_accessory_female_ivory_ribbon_beret_v2",
      require("../assets/room/motion/room_avatar_accessory_female_ivory_ribbon_beret_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_accessory_female_ivory_ribbon_beret_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_accessory_female_ivory_ribbon_beret_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_accessory_female_ivory_ribbon_beret_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_accessory_female_ivory_ribbon_beret_v2",
      require("../assets/room/motion/room_avatar_accessory_female_ivory_ribbon_beret_v2_sitting_front_f01.png")
    )
  },
  accessoryFemaleCherryBowHeadbandV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_accessory_female_cherry_bow_headband_v2",
      require("../assets/room/motion/room_avatar_accessory_female_cherry_bow_headband_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_accessory_female_cherry_bow_headband_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_accessory_female_cherry_bow_headband_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_accessory_female_cherry_bow_headband_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_accessory_female_cherry_bow_headband_v2",
      require("../assets/room/motion/room_avatar_accessory_female_cherry_bow_headband_v2_sitting_front_f01.png")
    )
  },
  accessoryFemaleSageHeartGlassesV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_accessory_female_sage_heart_glasses_v2",
      require("../assets/room/motion/room_avatar_accessory_female_sage_heart_glasses_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_accessory_female_sage_heart_glasses_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_accessory_female_sage_heart_glasses_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_accessory_female_sage_heart_glasses_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_accessory_female_sage_heart_glasses_v2",
      require("../assets/room/motion/room_avatar_accessory_female_sage_heart_glasses_v2_sitting_front_f01.png")
    )
  },
  accessoryFemaleRoseRoundGlassesV2: frameAwareHeadMotion(
    "room_avatar_accessory_female_rose_round_glasses_v2",
    require("../assets/room/motion/room_avatar_accessory_female_rose_round_glasses_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_rose_round_glasses_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_rose_round_glasses_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_rose_round_glasses_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_rose_round_glasses_v2_sitting_front_f01.png")
  ),
  accessoryFemaleLavenderPearlCatEyeGlassesV2: frameAwareHeadMotion(
    "room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2",
    require("../assets/room/motion/room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2_sitting_front_f01.png")
  ),
  accessoryFemaleMintStarOvalGlassesV2: frameAwareHeadMotion(
    "room_avatar_accessory_female_mint_star_oval_glasses_v2",
    require("../assets/room/motion/room_avatar_accessory_female_mint_star_oval_glasses_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_mint_star_oval_glasses_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_mint_star_oval_glasses_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_mint_star_oval_glasses_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_mint_star_oval_glasses_v2_sitting_front_f01.png")
  ),
  accessoryFemaleHoneyBlossomSquareGlassesV2: frameAwareHeadMotion(
    "room_avatar_accessory_female_honey_blossom_square_glasses_v2",
    require("../assets/room/motion/room_avatar_accessory_female_honey_blossom_square_glasses_v2_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_honey_blossom_square_glasses_v2_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_honey_blossom_square_glasses_v2_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_honey_blossom_square_glasses_v2_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_honey_blossom_square_glasses_v2_sitting_front_f01.png")
  ),
  accessoryFemalePearlDropEarringsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_accessory_female_pearl_drop_earrings_v2",
      require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_accessory_female_pearl_drop_earrings_v2",
      require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_sitting_front_f01.png")
    )
  },
  accessoryFemalePearlDropEarringsV2EarringRear: frameAwareHeadMotion(
    "room_avatar_accessory_female_pearl_drop_earrings_v2_part_earring-rear",
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_earring-rear_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_earring-rear_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_earring-rear_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_earring-rear_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_earring-rear_sitting_front_f01.png")
  ),
  accessoryFemalePearlDropEarringsV2PearlFront: frameAwareHeadMotion(
    "room_avatar_accessory_female_pearl_drop_earrings_v2_part_pearl-front",
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_pearl-front_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_pearl-front_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_pearl-front_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_pearl-front_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_pearl_drop_earrings_v2_part_pearl-front_sitting_front_f01.png")
  ),
  accessoryFemaleGoldenHeartLocketV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_accessory_female_golden_heart_locket_v2",
      require("../assets/room/motion/room_avatar_accessory_female_golden_heart_locket_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_accessory_female_golden_heart_locket_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_accessory_female_golden_heart_locket_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_accessory_female_golden_heart_locket_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_accessory_female_golden_heart_locket_v2",
      require("../assets/room/motion/room_avatar_accessory_female_golden_heart_locket_v2_sitting_front_f01.png")
    )
  },
  accessoryFemaleButtercreamNeckScarfV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_accessory_female_buttercream_neck_scarf_v2",
      require("../assets/room/motion/room_avatar_accessory_female_buttercream_neck_scarf_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_accessory_female_buttercream_neck_scarf_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_accessory_female_buttercream_neck_scarf_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_accessory_female_buttercream_neck_scarf_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_accessory_female_buttercream_neck_scarf_v2",
      require("../assets/room/motion/room_avatar_accessory_female_buttercream_neck_scarf_v2_sitting_front_f01.png")
    )
  },
  accessoryFemaleCherryMicroBagV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_accessory_female_cherry_micro_bag_v2",
      require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_accessory_female_cherry_micro_bag_v2",
      require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_sitting_front_f01.png")
    )
  },
  accessoryFemaleCherryMicroBagV2BagBack: frameAwareHeadMotion(
    "room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-back",
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-back_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-back_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-back_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-back_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-back_sitting_front_f01.png")
  ),
  accessoryFemaleCherryMicroBagV2StrapBack: frameAwareHeadMotion(
    "room_avatar_accessory_female_cherry_micro_bag_v2_part_strap-back",
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_strap-back_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_strap-back_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_strap-back_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_strap-back_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_strap-back_sitting_front_f01.png")
  ),
  accessoryFemaleCherryMicroBagV2BagFront: frameAwareHeadMotion(
    "room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-front",
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-front_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-front_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-front_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-front_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_cherry_micro_bag_v2_part_bag-front_sitting_front_f01.png")
  ),
  accessoryFemaleSunnyStarClipsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_accessory_female_sunny_star_clips_v2",
      require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_accessory_female_sunny_star_clips_v2",
      require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_sitting_front_f01.png")
    )
  },
  accessoryFemaleSunnyStarClipsV2ClipsFront: frameAwareHeadMotion(
    "room_avatar_accessory_female_sunny_star_clips_v2_part_clips-front",
    require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_part_clips-front_walking_front_f01.png"),
    require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_part_clips-front_walking_front_f02.png"),
    require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_part_clips-front_walking_front_f03.png"),
    require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_part_clips-front_walking_front_f04.png"),
    require("../assets/room/motion/room_avatar_accessory_female_sunny_star_clips_v2_part_clips-front_sitting_front_f01.png")
  ),
  shoesFemaleRosewoodPlatformLoafersV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_rosewood_platform_loafers_v2",
      require("../assets/room/motion/room_avatar_shoes_female_rosewood_platform_loafers_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_shoes_female_rosewood_platform_loafers_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_shoes_female_rosewood_platform_loafers_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_shoes_female_rosewood_platform_loafers_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_rosewood_platform_loafers_v2",
      require("../assets/room/motion/room_avatar_shoes_female_rosewood_platform_loafers_v2_sitting_front_f01.png")
    )
  },
  shoesFemalePearlSlingbackSandalsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_pearl_slingback_sandals_v2",
      require("../assets/room/motion/room_avatar_shoes_female_pearl_slingback_sandals_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_shoes_female_pearl_slingback_sandals_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_shoes_female_pearl_slingback_sandals_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_shoes_female_pearl_slingback_sandals_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_pearl_slingback_sandals_v2",
      require("../assets/room/motion/room_avatar_shoes_female_pearl_slingback_sandals_v2_sitting_front_f01.png")
    )
  },
  topFemaleBlushLaceCardiganV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_blush_lace_cardigan_v2",
      require("../assets/room/motion/room_avatar_top_female_blush_lace_cardigan_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_blush_lace_cardigan_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_blush_lace_cardigan_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_blush_lace_cardigan_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_blush_lace_cardigan_v2",
      require("../assets/room/motion/room_avatar_top_female_blush_lace_cardigan_v2_sitting_front_f01.png")
    )
  },
  topFemaleSageRibbonKnitJacketV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_sage_ribbon_knit_jacket_v2",
      require("../assets/room/motion/room_avatar_top_female_sage_ribbon_knit_jacket_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_sage_ribbon_knit_jacket_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_sage_ribbon_knit_jacket_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_sage_ribbon_knit_jacket_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_sage_ribbon_knit_jacket_v2",
      require("../assets/room/motion/room_avatar_top_female_sage_ribbon_knit_jacket_v2_sitting_front_f01.png")
    )
  },
  topFemaleCherryHeartMilkmaidBlouseV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_cherry_heart_milkmaid_blouse_v2",
      require("../assets/room/motion/room_avatar_top_female_cherry_heart_milkmaid_blouse_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_cherry_heart_milkmaid_blouse_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_cherry_heart_milkmaid_blouse_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_cherry_heart_milkmaid_blouse_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_cherry_heart_milkmaid_blouse_v2",
      require("../assets/room/motion/room_avatar_top_female_cherry_heart_milkmaid_blouse_v2_sitting_front_f01.png")
    )
  },
  topFemalePowderBlueRibbonCorsetTopV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_powder_blue_ribbon_corset_top_v2",
      require("../assets/room/motion/room_avatar_top_female_powder_blue_ribbon_corset_top_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_powder_blue_ribbon_corset_top_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_powder_blue_ribbon_corset_top_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_powder_blue_ribbon_corset_top_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_powder_blue_ribbon_corset_top_v2",
      require("../assets/room/motion/room_avatar_top_female_powder_blue_ribbon_corset_top_v2_sitting_front_f01.png")
    )
  },
  topFemaleNoirRoseHeartCardiganV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_noir_rose_heart_cardigan_v2",
      require("../assets/room/motion/room_avatar_top_female_noir_rose_heart_cardigan_v2_walking_front_f01.png"),
      require("../assets/room/motion/room_avatar_top_female_noir_rose_heart_cardigan_v2_walking_front_f02.png"),
      require("../assets/room/motion/room_avatar_top_female_noir_rose_heart_cardigan_v2_walking_front_f03.png"),
      require("../assets/room/motion/room_avatar_top_female_noir_rose_heart_cardigan_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_noir_rose_heart_cardigan_v2",
      require("../assets/room/motion/room_avatar_top_female_noir_rose_heart_cardigan_v2_sitting_front_f01.png")
    )
  }
} as const
