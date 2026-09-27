import type { ImageSourcePropType } from "react-native"
import { femaleSweetCapsuleRoomLayerAssets } from "./femaleSweetCapsuleRoomAssets"

// These older square thumbnails contain the whole character. Present the
// existing garment-only room layer instead, using its measured alpha bounds.
const GARMENT_THUMBNAILS: Record<string, { source: ImageSourcePropType; bounds: readonly number[] }> = {
  avatar_v2_bottom_midnight_ribbon_wide_leg_pants: {
    source: femaleSweetCapsuleRoomLayerAssets.bottomFemaleMidnightRibbonWideLegPantsV2.source,
    bounds: [256, 384, 93, 280, 69, 56]
  },
  avatar_v2_bottom_buttercream_pearl_tailored_pants: {
    source: femaleSweetCapsuleRoomLayerAssets.bottomFemaleButtercreamPearlTailoredPantsV2.source,
    bounds: [256, 384, 93, 280, 70, 56]
  },
  avatar_v2_bottom_rose_picnic_pleated_shorts: {
    source: femaleSweetCapsuleRoomLayerAssets.bottomFemaleRosePicnicPleatedShortsV2.source,
    bounds: [256, 384, 96, 280, 64, 35]
  },
  avatar_v2_bottom_lavender_bow_twill_shorts: {
    source: femaleSweetCapsuleRoomLayerAssets.bottomFemaleLavenderBowTwillShortsV2.source,
    bounds: [256, 384, 94, 280, 68, 35]
  },
  avatar_v2_shoes_rose_satin_bow_heels: {
    source: femaleSweetCapsuleRoomLayerAssets.shoesFemaleRoseSatinBowHeelsV2.source,
    bounds: [256, 384, 99, 319, 58, 29]
  },
  avatar_v2_shoes_ivory_pearl_slingback_heels: {
    source: femaleSweetCapsuleRoomLayerAssets.shoesFemaleIvoryPearlSlingbackHeelsV2.source,
    bounds: [256, 384, 99, 319, 58, 29]
  },
  avatar_v2_shoes_lilac_star_platform_sneakers: {
    source: femaleSweetCapsuleRoomLayerAssets.shoesFemaleLilacStarPlatformSneakersV2.source,
    bounds: [256, 384, 99, 319, 58, 29]
  },
  avatar_v2_shoes_mint_ribbon_court_sneakers: {
    source: femaleSweetCapsuleRoomLayerAssets.shoesFemaleMintRibbonCourtSneakersV2.source,
    bounds: [256, 384, 99, 319, 58, 29]
  }
}

export function getGarmentThumbnailOverride(id: string) {
  return GARMENT_THUMBNAILS[id]
}
