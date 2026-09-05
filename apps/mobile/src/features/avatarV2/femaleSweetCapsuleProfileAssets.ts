import type { AvatarLayerAssetRef } from "./avatarV2.types"

const layerAsset = (
  key: string,
  source: AvatarLayerAssetRef["source"]
): AvatarLayerAssetRef => ({ key, source })

export const femaleSweetCapsuleProfileLayerAssets = {
  topRosebudPicnicPeplum: layerAsset("avatar_top_rosebud_picnic_peplum", require("./assets/layers/avatar_top_rosebud_picnic_peplum.png")),
  topLilacCloudWrapTop: layerAsset("avatar_top_lilac_cloud_wrap_top", require("./assets/layers/avatar_top_lilac_cloud_wrap_top.png")),
  topButtercreamBowTee: layerAsset("avatar_top_buttercream_bow_tee", require("./assets/layers/avatar_top_buttercream_bow_tee.png")),
  topAzureGardenHalter: layerAsset("avatar_top_azure_garden_halter", require("./assets/layers/avatar_top_azure_garden_halter.png")),
  topIvoryTweedCropJacket: layerAsset("avatar_top_ivory_tweed_crop_jacket", require("./assets/layers/avatar_top_ivory_tweed_crop_jacket.png")),
  topCherryVarsityCardigan: layerAsset("avatar_top_cherry_varsity_cardigan", require("./assets/layers/avatar_top_cherry_varsity_cardigan.png")),
  topMidnightVelvetBolero: layerAsset("avatar_top_midnight_velvet_bolero", require("./assets/layers/avatar_top_midnight_velvet_bolero.png")),
  bottomMidnightRibbonWideLegPants: layerAsset("avatar_bottom_midnight_ribbon_wide_leg_pants", require("./assets/layers/avatar_bottom_midnight_ribbon_wide_leg_pants.png")),
  bottomButtercreamPearlTailoredPants: layerAsset("avatar_bottom_buttercream_pearl_tailored_pants", require("./assets/layers/avatar_bottom_buttercream_pearl_tailored_pants.png")),
  bottomRosePicnicPleatedShorts: layerAsset("avatar_bottom_rose_picnic_pleated_shorts", require("./assets/layers/avatar_bottom_rose_picnic_pleated_shorts.png")),
  bottomLavenderBowTwillShorts: layerAsset("avatar_bottom_lavender_bow_twill_shorts", require("./assets/layers/avatar_bottom_lavender_bow_twill_shorts.png")),
  shoesRoseSatinBowHeels: layerAsset("avatar_shoes_rose_satin_bow_heels", require("./assets/layers/avatar_shoes_rose_satin_bow_heels.png")),
  shoesIvoryPearlSlingbackHeels: layerAsset("avatar_shoes_ivory_pearl_slingback_heels", require("./assets/layers/avatar_shoes_ivory_pearl_slingback_heels.png")),
  shoesLilacStarPlatformSneakers: layerAsset("avatar_shoes_lilac_star_platform_sneakers", require("./assets/layers/avatar_shoes_lilac_star_platform_sneakers.png")),
  shoesMintRibbonCourtSneakers: layerAsset("avatar_shoes_mint_ribbon_court_sneakers", require("./assets/layers/avatar_shoes_mint_ribbon_court_sneakers.png")),
  topRoseRibbonTeaDress: layerAsset("avatar_top_rose_ribbon_tea_dress", require("./assets/layers/avatar_top_rose_ribbon_tea_dress.png")),
  bottomRoseRibbonTeaDress: layerAsset("avatar_bottom_rose_ribbon_tea_dress", require("./assets/layers/avatar_bottom_rose_ribbon_tea_dress.png")),
  topMoonlitVelvetBalletDress: layerAsset("avatar_top_moonlit_velvet_ballet_dress", require("./assets/layers/avatar_top_moonlit_velvet_ballet_dress.png")),
  bottomMoonlitVelvetBalletDress: layerAsset("avatar_bottom_moonlit_velvet_ballet_dress", require("./assets/layers/avatar_bottom_moonlit_velvet_ballet_dress.png")),
  topButtercupPicnicPinaforeDress: layerAsset("avatar_top_buttercup_picnic_pinafore_dress", require("./assets/layers/avatar_top_buttercup_picnic_pinafore_dress.png")),
  bottomButtercupPicnicPinaforeDress: layerAsset("avatar_bottom_buttercup_picnic_pinafore_dress", require("./assets/layers/avatar_bottom_buttercup_picnic_pinafore_dress.png")),
  topLavenderGardenRibbonDress: layerAsset("avatar_top_lavender_garden_ribbon_dress", require("./assets/layers/avatar_top_lavender_garden_ribbon_dress.png")),
  bottomLavenderGardenRibbonDress: layerAsset("avatar_bottom_lavender_garden_ribbon_dress", require("./assets/layers/avatar_bottom_lavender_garden_ribbon_dress.png"))
} as const
