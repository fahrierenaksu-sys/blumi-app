import { RETIRED_AVATAR_ART } from "../retiredAvatarArt"
import type {
  RoomV2AssetRef,
  RoomV2AvatarAssetSequence
} from "../../roomV2/roomV2.types"
import {
  roomAvatarFrameAsset,
  roomAvatarMotionAtlasFrame,
  type RoomAvatarFrameSource
} from "./roomAvatarMotionAtlas"

const asset = (key: string, source: RoomAvatarFrameSource): RoomV2AssetRef => roomAvatarFrameAsset(key, source)

const walking = (
  prefix: string,
  sources: readonly [RoomAvatarFrameSource, RoomAvatarFrameSource, RoomAvatarFrameSource, RoomAvatarFrameSource]
): RoomV2AvatarAssetSequence => ({
  frames: [
    asset(`${prefix}_walking_front_f01`, sources[0]),
    asset(`${prefix}_walking_front_f02`, sources[1]),
    asset(`${prefix}_walking_front_f03`, sources[2]),
    asset(`${prefix}_walking_front_f04`, sources[3])
  ],
  frameDurationMs: 120,
  loop: true
})

const motion = (
  prefix: string,
  walkingSources: readonly [RoomAvatarFrameSource, RoomAvatarFrameSource, RoomAvatarFrameSource, RoomAvatarFrameSource],
  sittingSource: RoomAvatarFrameSource
) => ({
  walkingFront: walking(prefix, walkingSources),
  sittingFront: asset(`${prefix}_sitting_front_f01`, sittingSource)
})

export const roomAvatarMaleCapsuleLayerAssets = {
  hairFrontMaleCocoaTexturedQuiffV1: asset(
    "avatar_room_hair_front_male_cocoa_textured_quiff_v1",
    RETIRED_AVATAR_ART
  ),
  hairFrontMaleSoftBlackSidePartV1: asset(
    "avatar_room_hair_front_male_soft_black_side_part_v1",
    RETIRED_AVATAR_ART
  ),
  hairFrontMaleChestnutShortWavesV1: asset(
    "avatar_room_hair_front_male_chestnut_short_waves_v1",
    RETIRED_AVATAR_ART
  ),
  topMaleDustyNavyTeeV1: asset(
    "avatar_room_top_male_dusty_navy_tee_v1",
    RETIRED_AVATAR_ART
  ),
  topMaleSageBasicTeeV1: asset(
    "avatar_room_top_male_sage_basic_tee_v1",
    RETIRED_AVATAR_ART
  ),
  topMaleMistBlueOxfordShirtV1: asset(
    "avatar_room_top_male_mist_blue_oxford_shirt_v1",
    RETIRED_AVATAR_ART
  ),
  topMaleSoftSageLinenShirtV1: asset(
    "avatar_room_top_male_soft_sage_linen_shirt_v1",
    RETIRED_AVATAR_ART
  ),
  topMaleCocoaVarsityJacketV1: asset(
    "avatar_room_top_male_cocoa_varsity_jacket_v1",
    RETIRED_AVATAR_ART
  ),
  topMaleDustyNavyChoreJacketV1: asset(
    "avatar_room_top_male_dusty_navy_chore_jacket_v1",
    RETIRED_AVATAR_ART
  ),
  bottomMaleMidBlueStraightJeansV1: asset(
    "avatar_room_bottom_male_mid_blue_straight_jeans_v1",
    RETIRED_AVATAR_ART
  ),
  bottomMaleCharcoalTaperedChinosV1: asset(
    "avatar_room_bottom_male_charcoal_tapered_chinos_v1",
    RETIRED_AVATAR_ART
  ),
  bottomMaleWarmSandRelaxedPantsV1: asset(
    "avatar_room_bottom_male_warm_sand_relaxed_pants_v1",
    RETIRED_AVATAR_ART
  ),
  shoesMaleCloudWhiteTrainersV1: asset(
    "avatar_room_shoes_male_cloud_white_trainers_v1",
    RETIRED_AVATAR_ART
  ),
  shoesMaleCocoaPennyLoafersV1: asset(
    "avatar_room_shoes_male_cocoa_penny_loafers_v1",
    RETIRED_AVATAR_ART
  ),
  shoesMaleDustyBlueCanvasSneakersV1: asset(
    "avatar_room_shoes_male_dusty_blue_canvas_sneakers_v1",
    RETIRED_AVATAR_ART
  )
} as const

export const roomAvatarMaleCapsuleMotionAssets = {
  topMaleCreamBasicTeeV1: motion(
    "room_avatar_top_male_cream_basic_tee_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_top_male_cream_basic_tee_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_cream_basic_tee_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_cream_basic_tee_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_cream_basic_tee_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_top_male_cream_basic_tee_v1_sitting_front_f01")
  ),
  topMaleDustyNavyTeeV1: motion(
    "room_avatar_top_male_dusty_navy_tee_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_tee_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_tee_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_tee_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_tee_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_tee_v1_sitting_front_f01")
  ),
  topMaleSageBasicTeeV1: motion(
    "room_avatar_top_male_sage_basic_tee_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_top_male_sage_basic_tee_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_sage_basic_tee_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_sage_basic_tee_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_sage_basic_tee_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_top_male_sage_basic_tee_v1_sitting_front_f01")
  ),
  topMaleMistBlueOxfordShirtV1: motion(
    "room_avatar_top_male_mist_blue_oxford_shirt_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_top_male_mist_blue_oxford_shirt_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_mist_blue_oxford_shirt_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_mist_blue_oxford_shirt_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_mist_blue_oxford_shirt_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_top_male_mist_blue_oxford_shirt_v1_sitting_front_f01")
  ),
  topMaleSoftSageLinenShirtV1: motion(
    "room_avatar_top_male_soft_sage_linen_shirt_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_top_male_soft_sage_linen_shirt_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_soft_sage_linen_shirt_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_soft_sage_linen_shirt_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_soft_sage_linen_shirt_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_top_male_soft_sage_linen_shirt_v1_sitting_front_f01")
  ),
  topMaleCocoaVarsityJacketV1: motion(
    "room_avatar_top_male_cocoa_varsity_jacket_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_top_male_cocoa_varsity_jacket_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_cocoa_varsity_jacket_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_cocoa_varsity_jacket_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_cocoa_varsity_jacket_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_top_male_cocoa_varsity_jacket_v1_sitting_front_f01")
  ),
  topMaleDustyNavyChoreJacketV1: motion(
    "room_avatar_top_male_dusty_navy_chore_jacket_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_chore_jacket_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_chore_jacket_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_chore_jacket_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_chore_jacket_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_top_male_dusty_navy_chore_jacket_v1_sitting_front_f01")
  ),
  bottomMaleMidBlueStraightJeansV1: motion(
    "room_avatar_bottom_male_mid_blue_straight_jeans_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_mid_blue_straight_jeans_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_mid_blue_straight_jeans_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_mid_blue_straight_jeans_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_mid_blue_straight_jeans_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_bottom_male_mid_blue_straight_jeans_v1_sitting_front_f01")
  ),
  bottomMaleCharcoalTaperedChinosV1: motion(
    "room_avatar_bottom_male_charcoal_tapered_chinos_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_charcoal_tapered_chinos_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_charcoal_tapered_chinos_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_charcoal_tapered_chinos_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_charcoal_tapered_chinos_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_bottom_male_charcoal_tapered_chinos_v1_sitting_front_f01")
  ),
  bottomMaleWarmSandRelaxedPantsV1: motion(
    "room_avatar_bottom_male_warm_sand_relaxed_pants_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_warm_sand_relaxed_pants_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_warm_sand_relaxed_pants_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_warm_sand_relaxed_pants_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_bottom_male_warm_sand_relaxed_pants_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_bottom_male_warm_sand_relaxed_pants_v1_sitting_front_f01")
  ),
  shoesMaleCloudWhiteTrainersV1: motion(
    "room_avatar_shoes_male_cloud_white_trainers_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cloud_white_trainers_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cloud_white_trainers_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cloud_white_trainers_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cloud_white_trainers_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cloud_white_trainers_v1_sitting_front_f01")
  ),
  shoesMaleCocoaPennyLoafersV1: motion(
    "room_avatar_shoes_male_cocoa_penny_loafers_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cocoa_penny_loafers_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cocoa_penny_loafers_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cocoa_penny_loafers_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cocoa_penny_loafers_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_shoes_male_cocoa_penny_loafers_v1_sitting_front_f01")
  ),
  shoesMaleDustyBlueCanvasSneakersV1: motion(
    "room_avatar_shoes_male_dusty_blue_canvas_sneakers_v1",
    [
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_dusty_blue_canvas_sneakers_v1_walking_front_f01"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_dusty_blue_canvas_sneakers_v1_walking_front_f02"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_dusty_blue_canvas_sneakers_v1_walking_front_f03"),
      roomAvatarMotionAtlasFrame("room_avatar_shoes_male_dusty_blue_canvas_sneakers_v1_walking_front_f04")
    ],
    roomAvatarMotionAtlasFrame("room_avatar_shoes_male_dusty_blue_canvas_sneakers_v1_sitting_front_f01")
  )
} as const
