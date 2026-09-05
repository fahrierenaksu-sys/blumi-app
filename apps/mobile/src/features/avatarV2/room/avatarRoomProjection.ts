import {
  AVATAR_V2_CATALOG
} from "../avatarV2.mock"
import { FEMALE_SWEET_CAPSULE_LAYERS } from "../femaleSweetCapsuleDefinitions"
import { MALE_PREMIUM_CAPSULE_RUNTIME } from "../malePremiumCapsulePilotDefinitions"
import { resolveAvatarV2 } from "../avatarV2Selectors"
import { projectSemanticDressForLegacyRenderer } from "../avatarV2Outfits"
import type {
  AvatarCatalogItem,
  UserAvatar
} from "../avatarV2.types"
import {
  ROOM_AVATAR_CATALOG
} from "./avatarRoom.mock"
import { resolveRoomAvatarAppearance } from "./avatarRoomSelectors"
import type {
  RoomAvatarAppearance,
  RoomAvatarCatalogItem
} from "./avatarRoom.types"

export type AvatarRoomProjectionMap = Record<
  string,
  Partial<RoomAvatarAppearance>
>

export interface ProjectAvatarV2ToRoomAvatarAppearanceInput {
  avatar?: Partial<UserAvatar>
  avatarCatalog?: AvatarCatalogItem[]
  roomAvatarCatalog?: RoomAvatarCatalogItem[]
  projectionMap?: AvatarRoomProjectionMap
}

export interface ProjectedRoomAvatarAppearance {
  appearance: RoomAvatarAppearance
  unmappedItemIds: string[]
}

const FEMALE_SWEET_CAPSULE_PROJECTION_MAP = Object.fromEntries(
  FEMALE_SWEET_CAPSULE_LAYERS.map((item) => {
    const slot = item.kind === "top"
      ? "topId"
      : item.kind === "bottom"
        ? "bottomId"
        : "shoesId"

    return [
      `avatar_v2_${item.kind}_${item.slug}`,
      { [slot]: `room_avatar_${item.kind}_female_${item.slug}_v2` }
    ]
  })
) as AvatarRoomProjectionMap

const MALE_PREMIUM_CAPSULE_PROJECTION_MAP = Object.fromEntries(
  MALE_PREMIUM_CAPSULE_RUNTIME.map((item) => {
    const avatarType = item.type === "hairFront" ? "hair" : item.type
    const roomId = item.roomId
    const slot = item.type === "top"
      ? "topId"
      : item.type === "bottom"
        ? "bottomId"
        : item.type === "shoes"
          ? "shoesId"
        : item.type === "hairFront"
          ? "hairFrontId"
          : "accessoryIds"
    return [
      `avatar_v2_${avatarType}_male_${item.slug}`,
      slot === "accessoryIds" ? { accessoryIds: [roomId] } : { [slot]: roomId }
    ]
  })
) as AvatarRoomProjectionMap

// Keep this deliberately conservative. Only map profile-scale AvatarV2 items
// when the current room-scale layer is a believable visual equivalent.
export const DEFAULT_AVATAR_ROOM_PROJECTION_MAP: AvatarRoomProjectionMap = {
  ...FEMALE_SWEET_CAPSULE_PROJECTION_MAP,
  ...MALE_PREMIUM_CAPSULE_PROJECTION_MAP,
  avatar_v2_body_default: {
    bodyPreset: "female"
  },
  avatar_v2_body_male_light: {
    bodyPreset: "male"
  },
  avatar_v2_face_male_warm_friendly: {
    faceId: "room_avatar_face_male_warm_friendly_v1"
  },
  avatar_v2_eyes_male_warm_brown: {
    faceId: "room_avatar_face_male_warm_friendly_v1"
  },
  avatar_v2_nose_male_gentle_bridge: {
    faceId: "room_avatar_face_male_warm_friendly_v1"
  },
  avatar_v2_mouth_male_soft_smile: {
    faceId: "room_avatar_face_male_warm_friendly_v1"
  },
  avatar_v2_hair_male_espresso_crop: {
    hairFrontId: "room_avatar_hair_front_male_espresso_crop_v1",
    hairBackId: undefined
  },
  avatar_v2_hair_male_cocoa_textured_quiff: {
    hairFrontId: "room_avatar_hair_front_male_cocoa_textured_quiff_v1",
    hairBackId: undefined
  },
  avatar_v2_hair_male_soft_black_side_part: {
    hairFrontId: "room_avatar_hair_front_male_soft_black_side_part_v1",
    hairBackId: undefined
  },
  avatar_v2_hair_male_chestnut_short_waves: {
    hairFrontId: "room_avatar_hair_front_male_chestnut_short_waves_v1",
    hairBackId: undefined
  },
  avatar_v2_top_male_cream_basic_tee: {
    topId: "room_avatar_top_male_cream_basic_tee_v1"
  },
  avatar_v2_top_male_powder_blue_crew_tee: {
    topId: "room_avatar_top_male_powder_blue_crew_tee_v1"
  },
  avatar_v2_top_male_sage_basic_tee: {
    topId: "room_avatar_top_male_sage_basic_tee_v1"
  },
  avatar_v2_top_male_dusty_navy_tee: {
    topId: "room_avatar_top_male_dusty_navy_tee_v1"
  },
  avatar_v2_top_male_mist_blue_oxford_shirt: {
    topId: "room_avatar_top_male_mist_blue_oxford_shirt_v1"
  },
  avatar_v2_top_male_soft_sage_linen_shirt: {
    topId: "room_avatar_top_male_soft_sage_linen_shirt_v1"
  },
  avatar_v2_top_male_cocoa_varsity_jacket: {
    topId: "room_avatar_top_male_cocoa_varsity_jacket_v1"
  },
  avatar_v2_top_male_dusty_navy_chore_jacket: {
    topId: "room_avatar_top_male_dusty_navy_chore_jacket_v1"
  },
  avatar_v2_bottom_male_sage_cuffed_shorts: {
    bottomId: "room_avatar_bottom_male_sage_cuffed_shorts_v1"
  },
  avatar_v2_bottom_male_navy_straight_pants: {
    bottomId: "room_avatar_bottom_male_navy_straight_pants_v1"
  },
  avatar_v2_bottom_male_mid_blue_straight_jeans: {
    bottomId: "room_avatar_bottom_male_mid_blue_straight_jeans_v1"
  },
  avatar_v2_bottom_male_charcoal_tapered_chinos: {
    bottomId: "room_avatar_bottom_male_charcoal_tapered_chinos_v1"
  },
  avatar_v2_bottom_male_warm_sand_relaxed_pants: {
    bottomId: "room_avatar_bottom_male_warm_sand_relaxed_pants_v1"
  },
  avatar_v2_shoes_male_milk_tea_court: {
    shoesId: "room_avatar_shoes_male_milk_tea_court_v1"
  },
  avatar_v2_shoes_male_cloud_white_trainers: {
    shoesId: "room_avatar_shoes_male_cloud_white_trainers_v1"
  },
  avatar_v2_shoes_male_cocoa_penny_loafers: {
    shoesId: "room_avatar_shoes_male_cocoa_penny_loafers_v1"
  },
  avatar_v2_shoes_male_dusty_blue_canvas_sneakers: {
    shoesId: "room_avatar_shoes_male_dusty_blue_canvas_sneakers_v1"
  },
  avatar_v2_face_default: {
    faceId: "room_avatar_face_female_soft_doll_foundation_v2"
  },
  avatar_v2_face_warm_peach_foundation: {
    faceId: "room_avatar_face_female_warm_peach_foundation_v2"
  },
  avatar_v2_face_rose_heart_foundation: {
    faceId: "room_avatar_face_female_rose_heart_foundation_v2"
  },
  avatar_v2_eyes_mocha_doe: {
    eyesId: "room_avatar_eyes_female_mocha_doe_v2"
  },
  avatar_v2_eyes_sage_glass: {
    eyesId: "room_avatar_eyes_female_sage_glass_v2"
  },
  avatar_v2_eyes_twilight_plum: {
    eyesId: "room_avatar_eyes_female_twilight_plum_v2"
  },
  avatar_v2_eyes_hazel_almond_doe: {
    eyesId: "room_avatar_eyes_female_hazel_almond_doe_v2"
  },
  avatar_v2_eyes_deep_brown_star: {
    eyesId: "room_avatar_eyes_female_deep_brown_star_v2"
  },
  avatar_v2_eyes_cocoa_puppy: {
    eyesId: "room_avatar_eyes_female_cocoa_puppy_v2"
  },
  avatar_v2_eyes_honey_amber: {
    eyesId: "room_avatar_eyes_female_honey_amber_v2"
  },
  avatar_v2_eyes_chestnut_luminous: {
    eyesId: "room_avatar_eyes_female_chestnut_luminous_v2"
  },
  avatar_v2_nose_soft_button: {
    noseId: "room_avatar_nose_female_soft_button_v2"
  },
  avatar_v2_nose_petal_curve: {
    noseId: "room_avatar_nose_female_petal_curve_v2"
  },
  avatar_v2_nose_gentle_bridge: {
    noseId: "room_avatar_nose_female_gentle_bridge_v2"
  },
  avatar_v2_nose_tiny_upturned: {
    noseId: "room_avatar_nose_female_tiny_upturned_v2"
  },
  avatar_v2_nose_petite_rounded: {
    noseId: "room_avatar_nose_female_petite_rounded_v2"
  },
  avatar_v2_nose_heart_tip: {
    noseId: "room_avatar_nose_female_heart_tip_v2"
  },
  avatar_v2_nose_narrow_button: {
    noseId: "room_avatar_nose_female_narrow_button_v2"
  },
  avatar_v2_nose_sculpted_doll: {
    noseId: "room_avatar_nose_female_sculpted_doll_v2"
  },
  avatar_v2_mouth_peach_whisper_smile: {
    mouthId: "room_avatar_mouth_female_peach_whisper_smile_v2"
  },
  avatar_v2_mouth_rose_gloss_smile: {
    mouthId: "room_avatar_mouth_female_rose_gloss_smile_v2"
  },
  avatar_v2_mouth_berry_soft_kiss: {
    mouthId: "room_avatar_mouth_female_berry_soft_kiss_v2"
  },
  avatar_v2_mouth_coral_bow_smile: {
    mouthId: "room_avatar_mouth_female_coral_bow_smile_v2"
  },
  avatar_v2_mouth_nude_pink_whisper: {
    mouthId: "room_avatar_mouth_female_nude_pink_whisper_v2"
  },
  avatar_v2_mouth_cherry_balm_smile: {
    mouthId: "room_avatar_mouth_female_cherry_balm_smile_v2"
  },
  avatar_v2_mouth_soft_mauve_smile: {
    mouthId: "room_avatar_mouth_female_soft_mauve_smile_v2"
  },
  avatar_v2_mouth_rosewater_cupid_bow: {
    mouthId: "room_avatar_mouth_female_rosewater_cupid_bow_v2"
  },
  // Mapping Coverage v1 — default wardrobe items
  avatar_v2_hair_mocha_ribbon_blowout: {
    hairFrontId: "room_avatar_hair_front_female_mocha_ribbon_blowout_v2",
    hairBackId: "room_avatar_hair_back_female_mocha_ribbon_blowout_v2",
    hairId: ""
  },
  avatar_v2_hair_midnight_french_bob: {
    hairFrontId: "room_avatar_hair_front_female_midnight_french_bob_v2",
    hairBackId: "room_avatar_hair_back_female_midnight_french_bob_v2",
    hairId: ""
  },
  avatar_v2_hair_honey_halfup_waves: {
    hairFrontId: "room_avatar_hair_front_female_honey_halfup_waves_v2",
    hairBackId: "room_avatar_hair_back_female_honey_halfup_waves_v2",
    hairId: ""
  },
  avatar_v2_hair_cherry_ribbon_twin_braids: {
    hairFrontId: "room_avatar_hair_front_female_cherry_ribbon_twin_braids_v2",
    hairBackId: "room_avatar_hair_back_female_cherry_ribbon_twin_braids_v2",
    hairId: ""
  },
  avatar_v2_hair_rosewood_butterfly_layers: {
    hairFrontId: "room_avatar_hair_front_female_rosewood_butterfly_layers_v2",
    hairBackId: "room_avatar_hair_back_female_rosewood_butterfly_layers_v2",
    hairId: ""
  },
  avatar_v2_hair_caramel_braided_crown: {
    hairFrontId: "room_avatar_hair_front_female_caramel_braided_crown_v2",
    hairBackId: "room_avatar_hair_back_female_caramel_braided_crown_v2",
    hairId: ""
  },
  avatar_v2_hair_berry_velvet_soft_updo: {
    hairFrontId: "room_avatar_hair_front_female_berry_velvet_soft_updo_v2",
    hairBackId: "room_avatar_hair_back_female_berry_velvet_soft_updo_v2",
    hairId: ""
  },
  avatar_v2_hair_chestnut_butterfly_bob: {
    hairFrontId: "room_avatar_hair_front_female_chestnut_butterfly_bob_v2",
    hairBackId: "room_avatar_hair_back_female_chestnut_butterfly_bob_v2",
    hairId: ""
  },
  avatar_v2_hair_golden_waves: {
    hairFrontId: "room_avatar_hair_front_female_golden_waves_v2",
    hairBackId: "room_avatar_hair_back_female_golden_waves_v2",
    hairId: ""
  },
  avatar_v2_hair_ink_pageboy_star: {
    hairFrontId: "room_avatar_hair_front_female_ink_pageboy_star_v2",
    hairBackId: "room_avatar_hair_back_female_ink_pageboy_star_v2",
    hairId: ""
  },
  avatar_v2_hair_ink_twin_braids: {
    hairFrontId: "room_avatar_hair_front_female_ink_twin_braids_v2",
    hairBackId: "room_avatar_hair_back_female_ink_twin_braids_v2",
    hairId: ""
  },
  avatar_v2_hair_pale_golden_bow_bob: {
    hairFrontId: "room_avatar_hair_front_female_pale_golden_bow_bob_v2",
    hairBackId: "room_avatar_hair_back_female_pale_golden_bow_bob_v2",
    hairId: ""
  },
  avatar_v2_hair_copper_bow_waves: {
    hairFrontId: "room_avatar_hair_front_female_copper_bow_waves_v2",
    hairBackId: "room_avatar_hair_back_female_copper_bow_waves_v2",
    hairId: ""
  },
  avatar_v2_top_default: {
    topId: "room_avatar_top_female_cream_basic_tee_v2"
  },
  avatar_v2_top_blush_lace_cardigan: {
    topId: "room_avatar_top_female_blush_lace_cardigan_v2"
  },
  avatar_v2_top_sage_ribbon_knit_jacket: {
    topId: "room_avatar_top_female_sage_ribbon_knit_jacket_v2"
  },
  avatar_v2_top_cherry_heart_milkmaid_blouse: {
    topId: "room_avatar_top_female_cherry_heart_milkmaid_blouse_v2"
  },
  avatar_v2_top_powder_blue_ribbon_corset_top: {
    topId: "room_avatar_top_female_powder_blue_ribbon_corset_top_v2"
  },
  avatar_v2_top_noir_rose_heart_cardigan: {
    topId: "room_avatar_top_female_noir_rose_heart_cardigan_v2"
  },
  avatar_v2_bottom_default: {
    bottomId: "room_avatar_bottom_female_denim_skort_shorts_v2"
  },
  avatar_v2_shoes_milk_tea_court_sneakers: {
    shoesId: "room_avatar_shoes_female_milk_tea_court_sneakers_v2"
  },
  avatar_v2_shoes_cherry_satin_ballets: {
    shoesId: "room_avatar_shoes_female_cherry_satin_ballets_v2"
  },
  avatar_v2_shoes_onyx_heart_mary_janes: {
    shoesId: "room_avatar_shoes_female_onyx_heart_mary_janes_v2"
  },
  avatar_v2_shoes_rosewood_platform_loafers: {
    shoesId: "room_avatar_shoes_female_rosewood_platform_loafers_v2"
  },
  avatar_v2_shoes_pearl_slingback_sandals: {
    shoesId: "room_avatar_shoes_female_pearl_slingback_sandals_v2"
  },
  avatar_v2_accessory_ivory_ribbon_beret: {
    accessoryIds: ["room_avatar_accessory_female_ivory_ribbon_beret_v2"]
  },
  avatar_v2_accessory_cherry_bow_headband: {
    accessoryIds: ["room_avatar_accessory_female_cherry_bow_headband_v2"]
  },
  avatar_v2_accessory_sage_heart_glasses: {
    accessoryIds: ["room_avatar_accessory_female_sage_heart_glasses_v2"]
  },
  avatar_v2_accessory_rose_round_glasses: {
    accessoryIds: ["room_avatar_accessory_female_rose_round_glasses_v2"]
  },
  avatar_v2_accessory_lavender_pearl_cat_eye_glasses: {
    accessoryIds: ["room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2"]
  },
  avatar_v2_accessory_mint_star_oval_glasses: {
    accessoryIds: ["room_avatar_accessory_female_mint_star_oval_glasses_v2"]
  },
  avatar_v2_accessory_honey_blossom_square_glasses: {
    accessoryIds: ["room_avatar_accessory_female_honey_blossom_square_glasses_v2"]
  },
  avatar_v2_accessory_pearl_drop_earrings: {
    accessoryIds: ["room_avatar_accessory_female_pearl_drop_earrings_v2"]
  },
  avatar_v2_accessory_golden_heart_locket: {
    accessoryIds: ["room_avatar_accessory_female_golden_heart_locket_v2"]
  },
  avatar_v2_accessory_buttercream_neck_scarf: {
    accessoryIds: ["room_avatar_accessory_female_buttercream_neck_scarf_v2"]
  },
  avatar_v2_accessory_cherry_micro_bag: {
    accessoryIds: ["room_avatar_accessory_female_cherry_micro_bag_v2"]
  },
  avatar_v2_accessory_sunny_star_clips: {
    accessoryIds: ["room_avatar_accessory_female_sunny_star_clips_v2"]
  },
  avatar_v2_bottom_striped_crochet_shorts: {
    bottomId: "room_avatar_bottom_female_striped_crochet_shorts_v2"
  },
  avatar_v2_bottom_layered_lace_ruffle_mini_skirt: {
    bottomId: "room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2"
  },
  avatar_v2_bottom_black_palm_embellished_pants: {
    bottomId: "room_avatar_bottom_female_black_palm_embellished_pants_v2"
  },
  avatar_v2_bottom_coral_embellished_laceup_pants: {
    bottomId: "room_avatar_bottom_female_coral_embellished_laceup_pants_v2"
  },
  avatar_v2_bottom_smoky_floral_mesh_pants: {
    bottomId: "room_avatar_bottom_female_smoky_floral_mesh_pants_v2"
  },
  avatar_v2_bottom_yellow_bow_lace_ruffle_skirt: {
    bottomId: "room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2"
  },
  avatar_v2_top_boho_patchwork_maxi_dress: {
    topId: "room_avatar_top_female_boho_patchwork_maxi_dress_v2"
  },
  avatar_v2_bottom_boho_patchwork_maxi_dress: {
    bottomId: "room_avatar_bottom_female_boho_patchwork_maxi_dress_v2"
  },
  avatar_v2_top_embroidered_halter_wrap_dress: {
    topId: "room_avatar_top_female_embroidered_halter_wrap_dress_v2"
  },
  avatar_v2_bottom_embroidered_halter_wrap_dress: {
    bottomId: "room_avatar_bottom_female_embroidered_halter_wrap_dress_v2"
  },
  avatar_v2_top_ruched_patchwork_mini_dress: {
    topId: "room_avatar_top_female_ruched_patchwork_mini_dress_v2"
  },
  avatar_v2_bottom_ruched_patchwork_mini_dress: {
    bottomId: "room_avatar_bottom_female_ruched_patchwork_mini_dress_v2"
  },
  avatar_v2_top_white_lace_cami_mini_dress: {
    topId: "room_avatar_top_female_white_lace_cami_mini_dress_v2"
  },
  avatar_v2_bottom_white_lace_cami_mini_dress: {
    bottomId: "room_avatar_bottom_female_white_lace_cami_mini_dress_v2"
  }
}

export function projectAvatarV2ToRoomAvatarAppearance(
  input: ProjectAvatarV2ToRoomAvatarAppearanceInput
): ProjectedRoomAvatarAppearance {
  const avatarCatalog = input.avatarCatalog ?? AVATAR_V2_CATALOG
  const roomAvatarCatalog = input.roomAvatarCatalog ?? ROOM_AVATAR_CATALOG
  const projectionMap = input.projectionMap ?? DEFAULT_AVATAR_ROOM_PROJECTION_MAP
  const avatar = projectSemanticDressForLegacyRenderer(
    resolveAvatarV2(input.avatar, avatarCatalog),
    avatarCatalog
  )

  let appearancePatch: Partial<RoomAvatarAppearance> = {
    bodyPreset: "female",
    accessoryIds: []
  }
  const unmappedItemIds = new Set<string>()

  for (const itemId of getEquippedAvatarV2ItemIds(avatar)) {
    if (itemId === "") continue // Skip mapping empty strings, handle them explicitly below
    const projection = projectionMap[itemId]
    if (!projection) {
      unmappedItemIds.add(itemId)
      continue
    }
    appearancePatch = mergeRoomAvatarAppearancePatch(appearancePatch, projection)
  }

  // Clothing can be intentionally unequipped. Female identity features always
  // fall back to the approved face and hair instead of rendering incomplete.
  if (avatar.topId === "") appearancePatch.topId = ""
  if (avatar.bottomId === "") appearancePatch.bottomId = ""
  if (avatar.shoesId === "") appearancePatch.shoesId = ""

  return {
    appearance: resolveRoomAvatarAppearance(appearancePatch, roomAvatarCatalog),
    unmappedItemIds: [...unmappedItemIds].sort()
  }
}

function getEquippedAvatarV2ItemIds(avatar: UserAvatar): string[] {
  return [
    avatar.bodyId,
    avatar.faceId,
    avatar.eyesId,
    avatar.noseId,
    avatar.mouthId,
    avatar.hairId,
    avatar.topId,
    avatar.bottomId,
    avatar.shoesId,
    ...avatar.accessoryIds
  ].filter(Boolean) // Filter out empty strings from the mapping phase
}

function mergeRoomAvatarAppearancePatch(
  target: Partial<RoomAvatarAppearance>,
  patch: Partial<RoomAvatarAppearance>
): Partial<RoomAvatarAppearance> {
  const accessoryIds = patch.accessoryIds
    ? [...(target.accessoryIds ?? []), ...patch.accessoryIds]
        .filter((id, index, ids) => ids.indexOf(id) === index)
    : target.accessoryIds
  return {
    ...target,
    ...patch,
    ...(accessoryIds ? { accessoryIds } : {})
  }
}
