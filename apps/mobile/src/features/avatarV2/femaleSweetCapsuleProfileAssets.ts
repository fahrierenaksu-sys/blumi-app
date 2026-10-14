import { RETIRED_AVATAR_ART } from "./retiredAvatarArt"
import type { AvatarLayerAssetRef } from "./avatarV2.types"

const layerAsset = (
  key: string,
  source: AvatarLayerAssetRef["source"]
): AvatarLayerAssetRef => ({ key, source })

export const femaleSweetCapsuleProfileLayerAssets = {
  topRosebudPicnicPeplum: layerAsset("avatar_top_rosebud_picnic_peplum", RETIRED_AVATAR_ART),
  topLilacCloudWrapTop: layerAsset("avatar_top_lilac_cloud_wrap_top", RETIRED_AVATAR_ART),
  topButtercreamBowTee: layerAsset("avatar_top_buttercream_bow_tee", RETIRED_AVATAR_ART),
  topAzureGardenHalter: layerAsset("avatar_top_azure_garden_halter", RETIRED_AVATAR_ART),
  topIvoryTweedCropJacket: layerAsset("avatar_top_ivory_tweed_crop_jacket", RETIRED_AVATAR_ART),
  topCherryVarsityCardigan: layerAsset("avatar_top_cherry_varsity_cardigan", RETIRED_AVATAR_ART),
  topMidnightVelvetBolero: layerAsset("avatar_top_midnight_velvet_bolero", RETIRED_AVATAR_ART),
  bottomMidnightRibbonWideLegPants: layerAsset("avatar_bottom_midnight_ribbon_wide_leg_pants", RETIRED_AVATAR_ART),
  bottomButtercreamPearlTailoredPants: layerAsset("avatar_bottom_buttercream_pearl_tailored_pants", RETIRED_AVATAR_ART),
  bottomRosePicnicPleatedShorts: layerAsset("avatar_bottom_rose_picnic_pleated_shorts", RETIRED_AVATAR_ART),
  bottomLavenderBowTwillShorts: layerAsset("avatar_bottom_lavender_bow_twill_shorts", RETIRED_AVATAR_ART),
  shoesRoseSatinBowHeels: layerAsset("avatar_shoes_rose_satin_bow_heels", RETIRED_AVATAR_ART),
  shoesIvoryPearlSlingbackHeels: layerAsset("avatar_shoes_ivory_pearl_slingback_heels", RETIRED_AVATAR_ART),
  shoesLilacStarPlatformSneakers: layerAsset("avatar_shoes_lilac_star_platform_sneakers", RETIRED_AVATAR_ART),
  shoesMintRibbonCourtSneakers: layerAsset("avatar_shoes_mint_ribbon_court_sneakers", RETIRED_AVATAR_ART),
  topCoralWavePolo: layerAsset("avatar_top_coral_wave_polo", RETIRED_AVATAR_ART),
  bottomCoralWavePants: layerAsset("avatar_bottom_coral_wave_pants", RETIRED_AVATAR_ART),
  shoesCoralWaveShoes: layerAsset("avatar_shoes_coral_wave_shoes", RETIRED_AVATAR_ART),
  topRoseRibbonTeaDress: layerAsset("avatar_top_rose_ribbon_tea_dress", RETIRED_AVATAR_ART),
  bottomRoseRibbonTeaDress: layerAsset("avatar_bottom_rose_ribbon_tea_dress", RETIRED_AVATAR_ART),
  topMoonlitVelvetBalletDress: layerAsset("avatar_top_moonlit_velvet_ballet_dress", RETIRED_AVATAR_ART),
  bottomMoonlitVelvetBalletDress: layerAsset("avatar_bottom_moonlit_velvet_ballet_dress", RETIRED_AVATAR_ART),
  topButtercupPicnicPinaforeDress: layerAsset("avatar_top_buttercup_picnic_pinafore_dress", RETIRED_AVATAR_ART),
  bottomButtercupPicnicPinaforeDress: layerAsset("avatar_bottom_buttercup_picnic_pinafore_dress", RETIRED_AVATAR_ART),
  topLavenderGardenRibbonDress: layerAsset("avatar_top_lavender_garden_ribbon_dress", RETIRED_AVATAR_ART),
  bottomLavenderGardenRibbonDress: layerAsset("avatar_bottom_lavender_garden_ribbon_dress", RETIRED_AVATAR_ART)
} as const
