import type { ImageSourcePropType } from "react-native"
import { roomAvatarLayerAssets } from "./room/avatarRoomAssets"
import { MALE_PREMIUM_CAPSULE_RUNTIME } from "./malePremiumCapsulePilotDefinitions"

export const MALE_CAPSULE_PREVIEW_SOURCES: Readonly<
  Partial<Record<string, ImageSourcePropType>>
> = {
  avatar_v2_hair_male_espresso_crop: roomAvatarLayerAssets.hairFrontMaleEspressoCropV1.source,
  avatar_v2_hair_male_cocoa_textured_quiff: roomAvatarLayerAssets.hairFrontMaleCocoaTexturedQuiffV1.source,
  avatar_v2_hair_male_soft_black_side_part: roomAvatarLayerAssets.hairFrontMaleSoftBlackSidePartV1.source,
  avatar_v2_hair_male_chestnut_short_waves: roomAvatarLayerAssets.hairFrontMaleChestnutShortWavesV1.source,
  avatar_v2_top_male_cream_basic_tee: roomAvatarLayerAssets.topMaleCreamBasicTeeV1.source,
  avatar_v2_top_male_powder_blue_crew_tee: roomAvatarLayerAssets.topMalePowderBlueCrewTeeV1.source,
  avatar_v2_top_male_sage_basic_tee: roomAvatarLayerAssets.topMaleSageBasicTeeV1.source,
  avatar_v2_top_male_dusty_navy_tee: roomAvatarLayerAssets.topMaleDustyNavyTeeV1.source,
  avatar_v2_top_male_mist_blue_oxford_shirt: roomAvatarLayerAssets.topMaleMistBlueOxfordShirtV1.source,
  avatar_v2_top_male_soft_sage_linen_shirt: roomAvatarLayerAssets.topMaleSoftSageLinenShirtV1.source,
  avatar_v2_top_male_cocoa_varsity_jacket: roomAvatarLayerAssets.topMaleCocoaVarsityJacketV1.source,
  avatar_v2_top_male_dusty_navy_chore_jacket: roomAvatarLayerAssets.topMaleDustyNavyChoreJacketV1.source,
  avatar_v2_bottom_male_sage_cuffed_shorts: roomAvatarLayerAssets.bottomMaleSageCuffedShortsV1.source,
  avatar_v2_bottom_male_navy_straight_pants: roomAvatarLayerAssets.bottomMaleNavyStraightPantsV1.source,
  avatar_v2_bottom_male_mid_blue_straight_jeans: roomAvatarLayerAssets.bottomMaleMidBlueStraightJeansV1.source,
  avatar_v2_bottom_male_charcoal_tapered_chinos: roomAvatarLayerAssets.bottomMaleCharcoalTaperedChinosV1.source,
  avatar_v2_bottom_male_warm_sand_relaxed_pants: roomAvatarLayerAssets.bottomMaleWarmSandRelaxedPantsV1.source,
  avatar_v2_shoes_male_milk_tea_court: roomAvatarLayerAssets.shoesMaleMilkTeaCourtV1.source,
  avatar_v2_shoes_male_cloud_white_trainers: roomAvatarLayerAssets.shoesMaleCloudWhiteTrainersV1.source,
  avatar_v2_shoes_male_cocoa_penny_loafers: roomAvatarLayerAssets.shoesMaleCocoaPennyLoafersV1.source,
  avatar_v2_shoes_male_dusty_blue_canvas_sneakers: roomAvatarLayerAssets.shoesMaleDustyBlueCanvasSneakersV1.source,
  ...Object.fromEntries(
    MALE_PREMIUM_CAPSULE_RUNTIME.map((item) => {
      const avatarType = item.type === "hairFront" ? "hair" : item.type
      const source = (roomAvatarLayerAssets as Record<string, { source: ImageSourcePropType }>)[item.roomAssetKey].source
      return [`avatar_v2_${avatarType}_male_${item.slug}`, source]
    })
  )
}
