import type { ImageSourcePropType } from "react-native"
import { femaleSweetCapsuleProfileLayerAssets } from "./femaleSweetCapsuleProfileAssets"
import { femaleSweetCapsuleRoomLayerAssets } from "./femaleSweetCapsuleRoomAssets"

// These older square thumbnails contain the whole character. Present the
// existing garment-only layer instead, using its measured alpha bounds.
// Shoes are tiny on the 256x384 room canvas (58x29 px) yet fill the card width,
// so they use the 512x768 profile layer: the same artwork at twice the pixels.
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
    source: femaleSweetCapsuleProfileLayerAssets.shoesRoseSatinBowHeels.source,
    bounds: [512, 768, 197, 637, 118, 60]
  },
  avatar_v2_shoes_ivory_pearl_slingback_heels: {
    source: femaleSweetCapsuleProfileLayerAssets.shoesIvoryPearlSlingbackHeels.source,
    bounds: [512, 768, 197, 637, 118, 60]
  },
  avatar_v2_shoes_lilac_star_platform_sneakers: {
    source: femaleSweetCapsuleProfileLayerAssets.shoesLilacStarPlatformSneakers.source,
    bounds: [512, 768, 197, 637, 118, 60]
  },
  avatar_v2_shoes_mint_ribbon_court_sneakers: {
    source: femaleSweetCapsuleProfileLayerAssets.shoesMintRibbonCourtSneakers.source,
    bounds: [512, 768, 197, 637, 118, 60]
  }
}

export function getGarmentThumbnailOverride(id: string) {
  return GARMENT_THUMBNAILS[id]
}
