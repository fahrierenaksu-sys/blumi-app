import { RETIRED_AVATAR_ART } from "./retiredAvatarArt"
import type { RoomV2AssetRef } from "../roomV2/roomV2.types"

const roomAvatarAsset = (key: string, source: RoomV2AssetRef["source"]): RoomV2AssetRef => ({ key, source })

export const femaleSweetCapsuleRoomLayerAssets = {
  topFemaleRosebudPicnicPeplumV2: roomAvatarAsset(
    "avatar_room_top_female_rosebud_picnic_peplum_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleLilacCloudWrapTopV2: roomAvatarAsset(
    "avatar_room_top_female_lilac_cloud_wrap_top_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleButtercreamBowTeeV2: roomAvatarAsset(
    "avatar_room_top_female_buttercream_bow_tee_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleAzureGardenHalterV2: roomAvatarAsset(
    "avatar_room_top_female_azure_garden_halter_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleIvoryTweedCropJacketV2: roomAvatarAsset(
    "avatar_room_top_female_ivory_tweed_crop_jacket_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleCherryVarsityCardiganV2: roomAvatarAsset(
    "avatar_room_top_female_cherry_varsity_cardigan_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleMidnightVelvetBoleroV2: roomAvatarAsset(
    "avatar_room_top_female_midnight_velvet_bolero_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleMidnightRibbonWideLegPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_midnight_ribbon_wide_leg_pants_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleButtercreamPearlTailoredPantsV2: roomAvatarAsset(
    "avatar_room_bottom_female_buttercream_pearl_tailored_pants_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleRosePicnicPleatedShortsV2: roomAvatarAsset(
    "avatar_room_bottom_female_rose_picnic_pleated_shorts_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleLavenderBowTwillShortsV2: roomAvatarAsset(
    "avatar_room_bottom_female_lavender_bow_twill_shorts_v2",
    RETIRED_AVATAR_ART
  ),
  shoesFemaleRoseSatinBowHeelsV2: roomAvatarAsset(
    "avatar_room_shoes_female_rose_satin_bow_heels_v2",
    RETIRED_AVATAR_ART
  ),
  shoesFemaleIvoryPearlSlingbackHeelsV2: roomAvatarAsset(
    "avatar_room_shoes_female_ivory_pearl_slingback_heels_v2",
    RETIRED_AVATAR_ART
  ),
  shoesFemaleLilacStarPlatformSneakersV2: roomAvatarAsset(
    "avatar_room_shoes_female_lilac_star_platform_sneakers_v2",
    RETIRED_AVATAR_ART
  ),
  shoesFemaleMintRibbonCourtSneakersV2: roomAvatarAsset(
    "avatar_room_shoes_female_mint_ribbon_court_sneakers_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleCoralWavePoloV1: roomAvatarAsset(
    "room_avatar_top_female_coral_wave_polo_v1",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleCoralWavePantsV1: roomAvatarAsset(
    "room_avatar_bottom_female_coral_wave_pants_v1",
    RETIRED_AVATAR_ART
  ),
  shoesFemaleCoralWaveShoesV1: roomAvatarAsset(
    "room_avatar_shoes_female_coral_wave_shoes_v1",
    RETIRED_AVATAR_ART
  ),
  topFemaleRoseRibbonTeaDressV2: roomAvatarAsset(
    "avatar_room_top_female_rose_ribbon_tea_dress_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleRoseRibbonTeaDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_rose_ribbon_tea_dress_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleMoonlitVelvetBalletDressV2: roomAvatarAsset(
    "avatar_room_top_female_moonlit_velvet_ballet_dress_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleMoonlitVelvetBalletDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_moonlit_velvet_ballet_dress_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleButtercupPicnicPinaforeDressV2: roomAvatarAsset(
    "avatar_room_top_female_buttercup_picnic_pinafore_dress_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleButtercupPicnicPinaforeDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_buttercup_picnic_pinafore_dress_v2",
    RETIRED_AVATAR_ART
  ),
  topFemaleLavenderGardenRibbonDressV2: roomAvatarAsset(
    "avatar_room_top_female_lavender_garden_ribbon_dress_v2",
    RETIRED_AVATAR_ART
  ),
  bottomFemaleLavenderGardenRibbonDressV2: roomAvatarAsset(
    "avatar_room_bottom_female_lavender_garden_ribbon_dress_v2",
    RETIRED_AVATAR_ART
  )
} as const
