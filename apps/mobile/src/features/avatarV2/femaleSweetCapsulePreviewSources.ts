import type { ImageSourcePropType } from "react-native"
import { FEMALE_SWEET_CAPSULE_VISIBLE_LAYERS } from "./femaleSweetCapsuleDefinitions"
import { roomAvatarLayerAssets } from "./room/avatarRoomAssets"
import type { RoomV2AssetRef } from "../roomV2/roomV2.types"

const roomAssets = roomAvatarLayerAssets as unknown as Record<string, RoomV2AssetRef>

export const FEMALE_SWEET_CAPSULE_RIG_PREVIEW_SOURCES: Partial<Record<string, ImageSourcePropType>> =
  Object.fromEntries(
    FEMALE_SWEET_CAPSULE_VISIBLE_LAYERS.map((item) => [
      `avatar_v2_${item.kind}_${item.slug}`,
      roomAssets[item.roomAssetKey].source
    ])
  )

export const FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES: Partial<Record<string, ImageSourcePropType>> = {
  avatar_v2_top_rosebud_picnic_peplum: require("./assets/shop-thumbnails/avatar_v2_top_rosebud_picnic_peplum.png"),
  avatar_v2_top_lilac_cloud_wrap_top: require("./assets/shop-thumbnails/avatar_v2_top_lilac_cloud_wrap_top.png"),
  avatar_v2_top_buttercream_bow_tee: require("./assets/shop-thumbnails/avatar_v2_top_buttercream_bow_tee.png"),
  avatar_v2_top_azure_garden_halter: require("./assets/shop-thumbnails/avatar_v2_top_azure_garden_halter.png"),
  avatar_v2_top_ivory_tweed_crop_jacket: require("./assets/shop-thumbnails/avatar_v2_top_ivory_tweed_crop_jacket.png"),
  avatar_v2_top_cherry_varsity_cardigan: require("./assets/shop-thumbnails/avatar_v2_top_cherry_varsity_cardigan.png"),
  avatar_v2_top_midnight_velvet_bolero: require("./assets/shop-thumbnails/avatar_v2_top_midnight_velvet_bolero.png"),
  avatar_v2_bottom_midnight_ribbon_wide_leg_pants: require("./assets/shop-thumbnails/avatar_v2_bottom_midnight_ribbon_wide_leg_pants.png"),
  avatar_v2_bottom_buttercream_pearl_tailored_pants: require("./assets/shop-thumbnails/avatar_v2_bottom_buttercream_pearl_tailored_pants.png"),
  avatar_v2_bottom_rose_picnic_pleated_shorts: require("./assets/shop-thumbnails/avatar_v2_bottom_rose_picnic_pleated_shorts.png"),
  avatar_v2_bottom_lavender_bow_twill_shorts: require("./assets/shop-thumbnails/avatar_v2_bottom_lavender_bow_twill_shorts.png"),
  avatar_v2_shoes_rose_satin_bow_heels: require("./assets/shop-thumbnails/avatar_v2_shoes_rose_satin_bow_heels.png"),
  avatar_v2_shoes_ivory_pearl_slingback_heels: require("./assets/shop-thumbnails/avatar_v2_shoes_ivory_pearl_slingback_heels.png"),
  avatar_v2_shoes_lilac_star_platform_sneakers: require("./assets/shop-thumbnails/avatar_v2_shoes_lilac_star_platform_sneakers.png"),
  avatar_v2_shoes_mint_ribbon_court_sneakers: require("./assets/shop-thumbnails/avatar_v2_shoes_mint_ribbon_court_sneakers.png"),
  avatar_v2_top_rose_ribbon_tea_dress: require("./assets/shop-thumbnails/avatar_v2_top_rose_ribbon_tea_dress.png"),
  avatar_v2_top_moonlit_velvet_ballet_dress: require("./assets/shop-thumbnails/avatar_v2_top_moonlit_velvet_ballet_dress.png"),
  avatar_v2_top_buttercup_picnic_pinafore_dress: require("./assets/shop-thumbnails/avatar_v2_top_buttercup_picnic_pinafore_dress.png"),
  avatar_v2_top_lavender_garden_ribbon_dress: require("./assets/shop-thumbnails/avatar_v2_top_lavender_garden_ribbon_dress.png")
}
