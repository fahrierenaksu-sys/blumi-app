import type { RoomV2AssetRef, RoomV2AvatarAssetSequence } from "../roomV2/roomV2.types"
import {
  roomAvatarFrameAsset as roomAvatarAsset,
  roomAvatarMotionAtlasFrame,
  type RoomAvatarFrameSource
} from "./room/roomAvatarMotionAtlas"

const walkingFrontSequence = (
  prefix: string,
  f01: RoomAvatarFrameSource,
  f02: RoomAvatarFrameSource,
  f03: RoomAvatarFrameSource,
  f04: RoomAvatarFrameSource
): RoomV2AvatarAssetSequence => ({
  frames: [
    roomAvatarAsset(`${prefix}_walking_front_f01`, f01),
    roomAvatarAsset(`${prefix}_walking_front_f02`, f02),
    roomAvatarAsset(`${prefix}_walking_front_f03`, f03),
    roomAvatarAsset(`${prefix}_walking_front_f04`, f04)
  ],
  frameDurationMs: 120,
  loop: true
})

const sittingFrontFrame = (
  prefix: string,
  f01: RoomAvatarFrameSource
): RoomV2AssetRef => roomAvatarAsset(`${prefix}_sitting_front_f01`, f01)

export const femaleSweetCapsuleRoomMotionLayerAssets = {
  topFemaleRosebudPicnicPeplumV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_rosebud_picnic_peplum_v2",
      require("./assets/room/motion/room_avatar_top_female_rosebud_picnic_peplum_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_top_female_rosebud_picnic_peplum_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_top_female_rosebud_picnic_peplum_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_top_female_rosebud_picnic_peplum_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_rosebud_picnic_peplum_v2",
      require("./assets/room/motion/room_avatar_top_female_rosebud_picnic_peplum_v2_sitting_front_f01.png")
    )
  },
  topFemaleLilacCloudWrapTopV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_lilac_cloud_wrap_top_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_lilac_cloud_wrap_top_v2_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_lilac_cloud_wrap_top_v2_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_lilac_cloud_wrap_top_v2_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_lilac_cloud_wrap_top_v2_walking_front_f04")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_lilac_cloud_wrap_top_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_lilac_cloud_wrap_top_v2_sitting_front_f01")
    )
  },
  topFemaleButtercreamBowTeeV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_buttercream_bow_tee_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_buttercream_bow_tee_v2_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_buttercream_bow_tee_v2_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_buttercream_bow_tee_v2_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_buttercream_bow_tee_v2_walking_front_f04")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_buttercream_bow_tee_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_buttercream_bow_tee_v2_sitting_front_f01")
    )
  },
  topFemaleAzureGardenHalterV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_azure_garden_halter_v2",
      require("./assets/room/motion/room_avatar_top_female_azure_garden_halter_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_top_female_azure_garden_halter_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_top_female_azure_garden_halter_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_top_female_azure_garden_halter_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_azure_garden_halter_v2",
      require("./assets/room/motion/room_avatar_top_female_azure_garden_halter_v2_sitting_front_f01.png")
    )
  },
  topFemaleIvoryTweedCropJacketV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_ivory_tweed_crop_jacket_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_ivory_tweed_crop_jacket_v2_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_ivory_tweed_crop_jacket_v2_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_ivory_tweed_crop_jacket_v2_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_ivory_tweed_crop_jacket_v2_walking_front_f04")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_ivory_tweed_crop_jacket_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_ivory_tweed_crop_jacket_v2_sitting_front_f01")
    )
  },
  topFemaleCherryVarsityCardiganV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_cherry_varsity_cardigan_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_cherry_varsity_cardigan_v2_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_cherry_varsity_cardigan_v2_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_cherry_varsity_cardigan_v2_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_cherry_varsity_cardigan_v2_walking_front_f04")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_cherry_varsity_cardigan_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_cherry_varsity_cardigan_v2_sitting_front_f01")
    )
  },
  topFemaleMidnightVelvetBoleroV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_midnight_velvet_bolero_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_midnight_velvet_bolero_v2_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_midnight_velvet_bolero_v2_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_midnight_velvet_bolero_v2_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_female_midnight_velvet_bolero_v2_walking_front_f04")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_midnight_velvet_bolero_v2",
      roomAvatarMotionAtlasFrame("room_avatar_top_female_midnight_velvet_bolero_v2_sitting_front_f01")
    )
  },
  bottomFemaleMidnightRibbonWideLegPantsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_midnight_ribbon_wide_leg_pants_v2",
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_midnight_ribbon_wide_leg_pants_v2_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_midnight_ribbon_wide_leg_pants_v2_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_midnight_ribbon_wide_leg_pants_v2_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_midnight_ribbon_wide_leg_pants_v2_walking_front_f04")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_midnight_ribbon_wide_leg_pants_v2",
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_midnight_ribbon_wide_leg_pants_v2_sitting_front_f01")
    )
  },
  bottomFemaleButtercreamPearlTailoredPantsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_buttercream_pearl_tailored_pants_v2",
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_buttercream_pearl_tailored_pants_v2_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_buttercream_pearl_tailored_pants_v2_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_buttercream_pearl_tailored_pants_v2_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_buttercream_pearl_tailored_pants_v2_walking_front_f04")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_buttercream_pearl_tailored_pants_v2",
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_buttercream_pearl_tailored_pants_v2_sitting_front_f01")
    )
  },
  bottomFemaleRosePicnicPleatedShortsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_rose_picnic_pleated_shorts_v2",
      require("./assets/room/motion/room_avatar_bottom_female_rose_picnic_pleated_shorts_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_bottom_female_rose_picnic_pleated_shorts_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_bottom_female_rose_picnic_pleated_shorts_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_bottom_female_rose_picnic_pleated_shorts_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_rose_picnic_pleated_shorts_v2",
      require("./assets/room/motion/room_avatar_bottom_female_rose_picnic_pleated_shorts_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleLavenderBowTwillShortsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_lavender_bow_twill_shorts_v2",
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_lavender_bow_twill_shorts_v2_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_lavender_bow_twill_shorts_v2_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_lavender_bow_twill_shorts_v2_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_lavender_bow_twill_shorts_v2_walking_front_f04")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_lavender_bow_twill_shorts_v2",
      roomAvatarMotionAtlasFrame("room_avatar_bottom_female_lavender_bow_twill_shorts_v2_sitting_front_f01")
    )
  },
  shoesFemaleRoseSatinBowHeelsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_rose_satin_bow_heels_v2",
      require("./assets/room/motion/room_avatar_shoes_female_rose_satin_bow_heels_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_shoes_female_rose_satin_bow_heels_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_shoes_female_rose_satin_bow_heels_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_shoes_female_rose_satin_bow_heels_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_rose_satin_bow_heels_v2",
      require("./assets/room/motion/room_avatar_shoes_female_rose_satin_bow_heels_v2_sitting_front_f01.png")
    )
  },
  shoesFemaleIvoryPearlSlingbackHeelsV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_ivory_pearl_slingback_heels_v2",
      require("./assets/room/motion/room_avatar_shoes_female_ivory_pearl_slingback_heels_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_shoes_female_ivory_pearl_slingback_heels_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_shoes_female_ivory_pearl_slingback_heels_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_shoes_female_ivory_pearl_slingback_heels_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_ivory_pearl_slingback_heels_v2",
      require("./assets/room/motion/room_avatar_shoes_female_ivory_pearl_slingback_heels_v2_sitting_front_f01.png")
    )
  },
  shoesFemaleLilacStarPlatformSneakersV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_lilac_star_platform_sneakers_v2",
      require("./assets/room/motion/room_avatar_shoes_female_lilac_star_platform_sneakers_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_shoes_female_lilac_star_platform_sneakers_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_shoes_female_lilac_star_platform_sneakers_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_shoes_female_lilac_star_platform_sneakers_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_lilac_star_platform_sneakers_v2",
      require("./assets/room/motion/room_avatar_shoes_female_lilac_star_platform_sneakers_v2_sitting_front_f01.png")
    )
  },
  shoesFemaleMintRibbonCourtSneakersV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_mint_ribbon_court_sneakers_v2",
      roomAvatarMotionAtlasFrame("room_avatar_shoes_female_mint_ribbon_court_sneakers_v2_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_female_mint_ribbon_court_sneakers_v2_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_female_mint_ribbon_court_sneakers_v2_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_female_mint_ribbon_court_sneakers_v2_walking_front_f04")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_mint_ribbon_court_sneakers_v2",
      roomAvatarMotionAtlasFrame("room_avatar_shoes_female_mint_ribbon_court_sneakers_v2_sitting_front_f01")
    )
  },
  topFemaleCoralWavePoloV1: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_coral_wave_polo_v1",
      require("./assets/room/motion/room_avatar_top_female_coral_wave_polo_v1_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_top_female_coral_wave_polo_v1_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_top_female_coral_wave_polo_v1_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_top_female_coral_wave_polo_v1_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_coral_wave_polo_v1",
      require("./assets/room/motion/room_avatar_top_female_coral_wave_polo_v1_sitting_front_f01.png")
    )
  },
  bottomFemaleCoralWavePantsV1: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_coral_wave_pants_v1",
      require("./assets/room/motion/room_avatar_bottom_female_coral_wave_pants_v1_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_bottom_female_coral_wave_pants_v1_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_bottom_female_coral_wave_pants_v1_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_bottom_female_coral_wave_pants_v1_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_coral_wave_pants_v1",
      require("./assets/room/motion/room_avatar_bottom_female_coral_wave_pants_v1_sitting_front_f01.png")
    )
  },
  shoesFemaleCoralWaveShoesV1: {
    walkingFront: walkingFrontSequence(
      "room_avatar_shoes_female_coral_wave_shoes_v1",
      require("./assets/room/motion/room_avatar_shoes_female_coral_wave_shoes_v1_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_shoes_female_coral_wave_shoes_v1_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_shoes_female_coral_wave_shoes_v1_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_shoes_female_coral_wave_shoes_v1_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_shoes_female_coral_wave_shoes_v1",
      require("./assets/room/motion/room_avatar_shoes_female_coral_wave_shoes_v1_sitting_front_f01.png")
    )
  },
  topFemaleRoseRibbonTeaDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_rose_ribbon_tea_dress_v2",
      require("./assets/room/motion/room_avatar_top_female_rose_ribbon_tea_dress_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_top_female_rose_ribbon_tea_dress_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_top_female_rose_ribbon_tea_dress_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_top_female_rose_ribbon_tea_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_rose_ribbon_tea_dress_v2",
      require("./assets/room/motion/room_avatar_top_female_rose_ribbon_tea_dress_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleRoseRibbonTeaDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_rose_ribbon_tea_dress_v2",
      require("./assets/room/motion/room_avatar_bottom_female_rose_ribbon_tea_dress_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_bottom_female_rose_ribbon_tea_dress_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_bottom_female_rose_ribbon_tea_dress_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_bottom_female_rose_ribbon_tea_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_rose_ribbon_tea_dress_v2",
      require("./assets/room/motion/room_avatar_bottom_female_rose_ribbon_tea_dress_v2_sitting_front_f01.png")
    )
  },
  topFemaleMoonlitVelvetBalletDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_moonlit_velvet_ballet_dress_v2",
      require("./assets/room/motion/room_avatar_top_female_moonlit_velvet_ballet_dress_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_top_female_moonlit_velvet_ballet_dress_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_top_female_moonlit_velvet_ballet_dress_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_top_female_moonlit_velvet_ballet_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_moonlit_velvet_ballet_dress_v2",
      require("./assets/room/motion/room_avatar_top_female_moonlit_velvet_ballet_dress_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleMoonlitVelvetBalletDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_moonlit_velvet_ballet_dress_v2",
      require("./assets/room/motion/room_avatar_bottom_female_moonlit_velvet_ballet_dress_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_bottom_female_moonlit_velvet_ballet_dress_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_bottom_female_moonlit_velvet_ballet_dress_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_bottom_female_moonlit_velvet_ballet_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_moonlit_velvet_ballet_dress_v2",
      require("./assets/room/motion/room_avatar_bottom_female_moonlit_velvet_ballet_dress_v2_sitting_front_f01.png")
    )
  },
  topFemaleButtercupPicnicPinaforeDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_buttercup_picnic_pinafore_dress_v2",
      require("./assets/room/motion/room_avatar_top_female_buttercup_picnic_pinafore_dress_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_top_female_buttercup_picnic_pinafore_dress_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_top_female_buttercup_picnic_pinafore_dress_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_top_female_buttercup_picnic_pinafore_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_buttercup_picnic_pinafore_dress_v2",
      require("./assets/room/motion/room_avatar_top_female_buttercup_picnic_pinafore_dress_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleButtercupPicnicPinaforeDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_buttercup_picnic_pinafore_dress_v2",
      require("./assets/room/motion/room_avatar_bottom_female_buttercup_picnic_pinafore_dress_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_bottom_female_buttercup_picnic_pinafore_dress_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_bottom_female_buttercup_picnic_pinafore_dress_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_bottom_female_buttercup_picnic_pinafore_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_buttercup_picnic_pinafore_dress_v2",
      require("./assets/room/motion/room_avatar_bottom_female_buttercup_picnic_pinafore_dress_v2_sitting_front_f01.png")
    )
  },
  topFemaleLavenderGardenRibbonDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_top_female_lavender_garden_ribbon_dress_v2",
      require("./assets/room/motion/room_avatar_top_female_lavender_garden_ribbon_dress_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_top_female_lavender_garden_ribbon_dress_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_top_female_lavender_garden_ribbon_dress_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_top_female_lavender_garden_ribbon_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_top_female_lavender_garden_ribbon_dress_v2",
      require("./assets/room/motion/room_avatar_top_female_lavender_garden_ribbon_dress_v2_sitting_front_f01.png")
    )
  },
  bottomFemaleLavenderGardenRibbonDressV2: {
    walkingFront: walkingFrontSequence(
      "room_avatar_bottom_female_lavender_garden_ribbon_dress_v2",
      require("./assets/room/motion/room_avatar_bottom_female_lavender_garden_ribbon_dress_v2_walking_front_f01.png"),
      require("./assets/room/motion/room_avatar_bottom_female_lavender_garden_ribbon_dress_v2_walking_front_f02.png"),
      require("./assets/room/motion/room_avatar_bottom_female_lavender_garden_ribbon_dress_v2_walking_front_f03.png"),
      require("./assets/room/motion/room_avatar_bottom_female_lavender_garden_ribbon_dress_v2_walking_front_f04.png")
    ),
    sittingFront: sittingFrontFrame(
      "room_avatar_bottom_female_lavender_garden_ribbon_dress_v2",
      require("./assets/room/motion/room_avatar_bottom_female_lavender_garden_ribbon_dress_v2_sitting_front_f01.png")
    )
  }
} as const
