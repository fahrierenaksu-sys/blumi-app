import type { RoomV2AssetRef } from "../roomV2/roomV2.types"

const roomAvatarAsset = (key: string, source: RoomV2AssetRef["source"]): RoomV2AssetRef => ({ key, source })

export const femaleSweetCapsuleRoomLayerAssets = {
  topFemaleRosebudPicnicPeplumV2: roomAvatarAsset(
    "avatar_room_top_female_rosebud_picnic_peplum_v2",
    require("./assets/room/avatar_room_top_female_rosebud_picnic_peplum_v2.png")
  ),
  topFemaleLilacCloudWrapTopV2: roomAvatarAsset(
    "avatar_room_top_female_lilac_cloud_wrap_top_v2",
    require("./assets/room/avatar_room_top_female_lilac_cloud_wrap_top_v2.png")
  ),
  topFemaleButtercreamBowTeeV2: roomAvatarAsset(
    "avatar_room_top_female_buttercream_bow_tee_v2",
    require("./assets/room/avatar_room_top_female_buttercream_bow_tee_v2.png")
  ),
  topFemaleAzureGardenHalterV2: roomAvatarAsset(
    "avatar_room_top_female_azure_garden_halter_v2",
    require("./assets/room/avatar_room_top_female_azure_garden_halter_v2.png")
  ),
  topFemaleIvoryTweedCropJacketV2: roomAvatarAsset(
    "avatar_room_top_female_ivory_tweed_crop_jacket_v2",
    require("./assets/room/avatar_room_top_female_ivory_tweed_crop_jacket_v2.png")
  ),
  topFemaleCherryVarsityCardiganV2: roomAvatarAsset(
    "avatar_room_top_female_cherry_varsity_cardigan_v2",
    require("./assets/room/avatar_room_top_female_cherry_varsity_cardigan_v2.png")
  ),
  topFemaleMidnightVelvetBoleroV2: roomAvatarAsset(
    "avatar_room_top_female_midnight_velvet_bolero_v2",
    require("./assets/room/avatar_room_top_female_midnight_velvet_bolero_v2.png")
  ),
  bottomFemaleMidnightRibbonWideLegPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_midnight_ribbon_wide_leg_pants_v2",
    require("./assets/room/avatar_room_bottom_female_midnight_ribbon_wide_leg_pants_v2.png")
  ),
  bottomFemaleButtercreamPearlTailoredPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_buttercream_pearl_tailored_pants_v2",
    require("./assets/room/avatar_room_bottom_female_buttercream_pearl_tailored_pants_v2.png")
  ),
  bottomFemaleRosePicnicPleatedShortsV2: roomAvatarAsset(
    "avatar_room_bottom_female_rose_picnic_pleated_shorts_v2",
    require("./assets/room/avatar_room_bottom_female_rose_picnic_pleated_shorts_v2.png")
  ),
  bottomFemaleLavenderBowTwillShortsV2: roomAvatarAsset(
    "avatar_room_bottom_female_lavender_bow_twill_shorts_v2",
    require("./assets/room/avatar_room_bottom_female_lavender_bow_twill_shorts_v2.png")
  ),
  shoesFemaleRoseSatinBowHeelsV2: roomAvatarAsset(
    "avatar_room_shoes_female_rose_satin_bow_heels_v2",
    require("./assets/room/avatar_room_shoes_female_rose_satin_bow_heels_v2.png")
  ),
  shoesFemaleIvoryPearlSlingbackHeelsV2: roomAvatarAsset(
    "avatar_room_shoes_female_ivory_pearl_slingback_heels_v2",
    require("./assets/room/avatar_room_shoes_female_ivory_pearl_slingback_heels_v2.png")
  ),
  shoesFemaleLilacStarPlatformSneakersV2: roomAvatarAsset(
    "avatar_room_shoes_female_lilac_star_platform_sneakers_v2",
    require("./assets/room/avatar_room_shoes_female_lilac_star_platform_sneakers_v2.png")
  ),
  shoesFemaleMintRibbonCourtSneakersV2: roomAvatarAsset(
    "avatar_room_shoes_female_mint_ribbon_court_sneakers_v2",
    require("./assets/room/avatar_room_shoes_female_mint_ribbon_court_sneakers_v2.png")
  ),
  topFemaleRoseRibbonTeaDressV2: roomAvatarAsset(
    "avatar_room_top_female_rose_ribbon_tea_dress_v2",
    require("./assets/room/avatar_room_top_female_rose_ribbon_tea_dress_v2.png")
  ),
  bottomFemaleRoseRibbonTeaDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_rose_ribbon_tea_dress_v2",
    require("./assets/room/avatar_room_bottom_female_rose_ribbon_tea_dress_v2.png")
  ),
  topFemaleMoonlitVelvetBalletDressV2: roomAvatarAsset(
    "avatar_room_top_female_moonlit_velvet_ballet_dress_v2",
    require("./assets/room/avatar_room_top_female_moonlit_velvet_ballet_dress_v2.png")
  ),
  bottomFemaleMoonlitVelvetBalletDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_moonlit_velvet_ballet_dress_v2",
    require("./assets/room/avatar_room_bottom_female_moonlit_velvet_ballet_dress_v2.png")
  ),
  topFemaleButtercupPicnicPinaforeDressV2: roomAvatarAsset(
    "avatar_room_top_female_buttercup_picnic_pinafore_dress_v2",
    require("./assets/room/avatar_room_top_female_buttercup_picnic_pinafore_dress_v2.png")
  ),
  bottomFemaleButtercupPicnicPinaforeDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_buttercup_picnic_pinafore_dress_v2",
    require("./assets/room/avatar_room_bottom_female_buttercup_picnic_pinafore_dress_v2.png")
  ),
  topFemaleLavenderGardenRibbonDressV2: roomAvatarAsset(
    "avatar_room_top_female_lavender_garden_ribbon_dress_v2",
    require("./assets/room/avatar_room_top_female_lavender_garden_ribbon_dress_v2.png")
  ),
  bottomFemaleLavenderGardenRibbonDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_lavender_garden_ribbon_dress_v2",
    require("./assets/room/avatar_room_bottom_female_lavender_garden_ribbon_dress_v2.png")
  )
} as const
