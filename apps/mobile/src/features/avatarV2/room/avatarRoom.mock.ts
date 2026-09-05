import { roomAvatarLayerAssets } from "./avatarRoomAssets"
import { roomAvatarMotionLayerAssets } from "./avatarRoomMotionAssets"
import { FEMALE_SWEET_CAPSULE_LAYERS } from "../femaleSweetCapsuleDefinitions"
import { MALE_PREMIUM_CAPSULE_RUNTIME } from "../malePremiumCapsulePilotDefinitions"
import type {
  RoomAvatarAppearance,
  RoomAvatarCatalogItem,
  RoomAvatarLayerType,
  RoomAvatarOcclusionRole
} from "./avatarRoom.types"
import type {
  RoomV2AssetRef,
  RoomV2AvatarMotionAsset
} from "../../roomV2/roomV2.types"
import {
  FEMALE_PANTS_OVER_SHOE_UPPER_IDS,
  FEMALE_WARDROBE_QUARANTINED_ITEM_IDS
} from "./avatarRoomMotionContract"

export const ROOM_AVATAR_LAYER_ORDER: Record<RoomAvatarLayerType, number> = {
  hairBack: 5,
  base: 10,
  face: 20,
  eyes: 22,
  nose: 24,
  mouth: 26,
  hair: 30,
  bottom: 40,
  shoes: 50,
  topInner: 55,
  top: 60,
  topOuter: 65,
  accessory: 70,
  hairFront: 80
}

export const ROOM_AVATAR_OCCLUSION_ORDER = {
  bottomBehindShoes: ROOM_AVATAR_LAYER_ORDER.bottom,
  shoes: ROOM_AVATAR_LAYER_ORDER.shoes,
  bottomOverShoeUpper: ROOM_AVATAR_LAYER_ORDER.shoes + 1
} as const

export const MALE_BOTTOMS_BEHIND_SHOES_IDS = new Set([
  "room_avatar_bottom_male_charcoal_tapered_chinos_v1"
])

export const DEFAULT_ROOM_AVATAR_FEMALE: RoomAvatarAppearance = {
  bodyPreset: "female",
  baseId: "room_avatar_base_female_v2",
  faceId: "room_avatar_face_female_soft_doll_foundation_v2",
  eyesId: "room_avatar_eyes_female_mocha_doe_v2",
  noseId: "room_avatar_nose_female_soft_button_v2",
  mouthId: "room_avatar_mouth_female_peach_whisper_smile_v2",
  hairBackId: "room_avatar_hair_back_female_mocha_ribbon_blowout_v2",
  hairFrontId: "room_avatar_hair_front_female_mocha_ribbon_blowout_v2",
  topId: "room_avatar_top_female_cream_basic_tee_v2",
  bottomId: "room_avatar_bottom_female_denim_skort_shorts_v2",
  shoesId: "room_avatar_shoes_female_milk_tea_court_sneakers_v2",
  accessoryIds: []
}

export const DEFAULT_ROOM_AVATAR_MALE: RoomAvatarAppearance = {
  bodyPreset: "male",
  baseId: "room_avatar_base_male_light_v1",
  faceId: "room_avatar_face_male_warm_friendly_v1",
  hairBackId: undefined,
  hairFrontId: "room_avatar_hair_front_male_espresso_crop_v1",
  topId: "room_avatar_top_male_powder_blue_crew_tee_v1",
  bottomId: "room_avatar_bottom_male_navy_straight_pants_v1",
  shoesId: "room_avatar_shoes_male_milk_tea_court_v1",
  accessoryIds: []
}

const MALE_CAPSULE_ROOM_ITEMS: RoomAvatarCatalogItem[] = [
  ...([
    ["cocoa_textured_quiff", "Cocoa Textured Quiff", roomAvatarLayerAssets.hairFrontMaleCocoaTexturedQuiffV1, roomAvatarMotionLayerAssets.hairFrontMaleCocoaTexturedQuiffV1],
    ["soft_black_side_part", "Soft Black Side Part", roomAvatarLayerAssets.hairFrontMaleSoftBlackSidePartV1, roomAvatarMotionLayerAssets.hairFrontMaleSoftBlackSidePartV1],
    ["chestnut_short_waves", "Chestnut Short Waves", roomAvatarLayerAssets.hairFrontMaleChestnutShortWavesV1, roomAvatarMotionLayerAssets.hairFrontMaleChestnutShortWavesV1]
  ] as const).map(([slug, name, asset, motion]) => ({
    id: `room_avatar_hair_front_male_${slug}_v1`,
    type: "hairFront" as const,
    bodyPreset: "male" as const,
    fitProfileId: "blumi_male_room_avatar_v1" as const,
    name,
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairFront,
    asset,
    assetsByMotion: createExactMotionVariants(motion.walkingFront, motion.sittingFront)
  })),
  ...([
    ["top", "dusty_navy_tee", "Dusty Navy Tee", roomAvatarLayerAssets.topMaleDustyNavyTeeV1, roomAvatarMotionLayerAssets.topMaleDustyNavyTeeV1],
    ["top", "sage_basic_tee", "Sage Basic Tee", roomAvatarLayerAssets.topMaleSageBasicTeeV1, roomAvatarMotionLayerAssets.topMaleSageBasicTeeV1],
    ["top", "mist_blue_oxford_shirt", "Mist Blue Oxford Shirt", roomAvatarLayerAssets.topMaleMistBlueOxfordShirtV1, roomAvatarMotionLayerAssets.topMaleMistBlueOxfordShirtV1],
    ["top", "soft_sage_linen_shirt", "Soft Sage Linen Shirt", roomAvatarLayerAssets.topMaleSoftSageLinenShirtV1, roomAvatarMotionLayerAssets.topMaleSoftSageLinenShirtV1],
    ["top", "cocoa_varsity_jacket", "Cocoa Varsity Jacket", roomAvatarLayerAssets.topMaleCocoaVarsityJacketV1, roomAvatarMotionLayerAssets.topMaleCocoaVarsityJacketV1],
    ["top", "dusty_navy_chore_jacket", "Dusty Navy Chore Jacket", roomAvatarLayerAssets.topMaleDustyNavyChoreJacketV1, roomAvatarMotionLayerAssets.topMaleDustyNavyChoreJacketV1],
    ["bottom", "mid_blue_straight_jeans", "Mid Blue Straight Jeans", roomAvatarLayerAssets.bottomMaleMidBlueStraightJeansV1, roomAvatarMotionLayerAssets.bottomMaleMidBlueStraightJeansV1],
    ["bottom", "charcoal_tapered_chinos", "Charcoal Tapered Chinos", roomAvatarLayerAssets.bottomMaleCharcoalTaperedChinosV1, roomAvatarMotionLayerAssets.bottomMaleCharcoalTaperedChinosV1],
    ["bottom", "warm_sand_relaxed_pants", "Warm Sand Relaxed Pants", roomAvatarLayerAssets.bottomMaleWarmSandRelaxedPantsV1, roomAvatarMotionLayerAssets.bottomMaleWarmSandRelaxedPantsV1],
    ["shoes", "cloud_white_trainers", "Cloud White Trainers", roomAvatarLayerAssets.shoesMaleCloudWhiteTrainersV1, roomAvatarMotionLayerAssets.shoesMaleCloudWhiteTrainersV1],
    ["shoes", "cocoa_penny_loafers", "Cocoa Penny Loafers", roomAvatarLayerAssets.shoesMaleCocoaPennyLoafersV1, roomAvatarMotionLayerAssets.shoesMaleCocoaPennyLoafersV1],
    ["shoes", "dusty_blue_canvas_sneakers", "Dusty Blue Canvas Sneakers", roomAvatarLayerAssets.shoesMaleDustyBlueCanvasSneakersV1, roomAvatarMotionLayerAssets.shoesMaleDustyBlueCanvasSneakersV1]
  ] as const).map(([type, slug, name, asset, motion]) => ({
    id: `room_avatar_${type}_male_${slug}_v1`,
    type,
    bodyPreset: "male" as const,
    fitProfileId: "blumi_male_room_avatar_v1" as const,
    name,
    layerOrder: type === "bottom"
      ? ROOM_AVATAR_OCCLUSION_ORDER.bottomOverShoeUpper
      : ROOM_AVATAR_LAYER_ORDER[type],
    ...(type === "bottom" ? { occlusionRole: "bottomOverShoeUpper" as const } : {}),
    asset,
    assetsByMotion: createExactMotionVariants(motion.walkingFront, motion.sittingFront)
  }))
]

const MALE_PREMIUM_CAPSULE_ROOM_ASSETS = roomAvatarLayerAssets as unknown as Record<string, RoomV2AssetRef>
const MALE_PREMIUM_CAPSULE_ROOM_MOTION = roomAvatarMotionLayerAssets as unknown as Record<string, {
  walkingFront: RoomV2AvatarMotionAsset
  sittingFront: RoomV2AvatarMotionAsset
}>

const MALE_PREMIUM_CAPSULE_ROOM_ITEMS: RoomAvatarCatalogItem[] = MALE_PREMIUM_CAPSULE_RUNTIME.map((item) => {
  const roomType = item.type
  const layerOrder = roomType === "bottom"
    ? ROOM_AVATAR_OCCLUSION_ORDER.bottomOverShoeUpper
    : ROOM_AVATAR_LAYER_ORDER[roomType]
  const motion = MALE_PREMIUM_CAPSULE_ROOM_MOTION[item.roomMotionAssetKey]
  const asset = MALE_PREMIUM_CAPSULE_ROOM_ASSETS[item.roomAssetKey]
  const motionVariants = createExactMotionVariants(motion.walkingFront, motion.sittingFront)

  return {
    id: item.roomId,
    type: roomType,
    bodyPreset: "male",
    rigId: "blumi_2_5d_layered_v1",
    fitProfileId: "blumi_male_room_avatar_v1",
    name: item.name,
    layerOrder,
    ...(roomType === "bottom" ? { occlusionRole: "bottomOverShoeUpper" as const } : {}),
    asset,
    assetsByMotion: motionVariants,
    ...(item.accessoryGroup === "headwear"
      ? {
          accessoryLayerParts: [
            {
              id: "headwear-back",
              occlusionSlot: "behindHairFront" as const,
              asset,
              assetsByMotion: motionVariants
            }
          ]
        }
      : {})
  }
})

const FEMALE_SWEET_CAPSULE_ROOM_ASSETS = roomAvatarLayerAssets as unknown as Record<
  string,
  RoomV2AssetRef
>
const FEMALE_SWEET_CAPSULE_ROOM_MOTION = roomAvatarMotionLayerAssets as unknown as Record<
  string,
  {
    walkingFront: RoomV2AvatarMotionAsset
    sittingFront: RoomV2AvatarMotionAsset
  }
>

const FEMALE_SWEET_CAPSULE_ROOM_ITEMS: RoomAvatarCatalogItem[] =
  FEMALE_SWEET_CAPSULE_LAYERS.map((item) => {
    const motion = FEMALE_SWEET_CAPSULE_ROOM_MOTION[item.roomMotionAssetKey]

    return {
      id: `room_avatar_${item.kind}_female_${item.slug}_v2`,
      type: item.kind,
      bodyPreset: "female",
      name: item.name,
      layerOrder: ROOM_AVATAR_LAYER_ORDER[item.kind],
      asset: FEMALE_SWEET_CAPSULE_ROOM_ASSETS[item.roomAssetKey],
      assetsByMotion: createExactMotionVariants(motion.walkingFront, motion.sittingFront)
    }
  })

const ROOM_AVATAR_CATALOG_ITEMS: RoomAvatarCatalogItem[] = [
  {
    id: DEFAULT_ROOM_AVATAR_MALE.baseId,
    type: "base",
    bodyPreset: "male",
    fitProfileId: "blumi_male_room_avatar_v1",
    name: "Light Masculine Room Base",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.base,
    asset: roomAvatarLayerAssets.baseMaleLightV1,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.baseMaleLightV1.walkingFront,
      roomAvatarMotionLayerAssets.baseMaleLightV1.sittingFront
    ),
    isDefault: true
  },
  {
    id: DEFAULT_ROOM_AVATAR_MALE.faceId!,
    type: "face",
    bodyPreset: "male",
    fitProfileId: "blumi_male_room_avatar_v1",
    name: "Warm Friendly Masculine Face",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.face,
    asset: roomAvatarLayerAssets.faceMaleWarmFriendlyV1,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.faceMaleWarmFriendlyV1.walkingFront,
      roomAvatarMotionLayerAssets.faceMaleWarmFriendlyV1.sittingFront
    )
  },
  {
    id: DEFAULT_ROOM_AVATAR_MALE.hairFrontId!,
    type: "hairFront",
    bodyPreset: "male",
    fitProfileId: "blumi_male_room_avatar_v1",
    name: "Espresso Textured Crop",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairFront,
    asset: roomAvatarLayerAssets.hairFrontMaleEspressoCropV1,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.hairFrontMaleEspressoCropV1.walkingFront,
      roomAvatarMotionLayerAssets.hairFrontMaleEspressoCropV1.sittingFront
    )
  },
  {
    id: "room_avatar_top_male_cream_basic_tee_v1",
    type: "top",
    bodyPreset: "male",
    fitProfileId: "blumi_male_room_avatar_v1",
    name: "Cream Everyday Tee",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topMaleCreamBasicTeeV1,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topMaleCreamBasicTeeV1.walkingFront,
      roomAvatarMotionLayerAssets.topMaleCreamBasicTeeV1.sittingFront
    )
  },
  {
    id: DEFAULT_ROOM_AVATAR_MALE.topId!,
    type: "top",
    bodyPreset: "male",
    fitProfileId: "blumi_male_room_avatar_v1",
    name: "Powder Blue Basic Crew Tee",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topMalePowderBlueCrewTeeV1,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topMalePowderBlueCrewTeeV1.walkingFront,
      roomAvatarMotionLayerAssets.topMalePowderBlueCrewTeeV1.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_male_sage_cuffed_shorts_v1",
    type: "bottom",
    bodyPreset: "male",
    fitProfileId: "blumi_male_room_avatar_v1",
    name: "Sage Cuffed Shorts",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomMaleSageCuffedShortsV1,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomMaleSageCuffedShortsV1.walkingFront,
      roomAvatarMotionLayerAssets.bottomMaleSageCuffedShortsV1.sittingFront
    )
  },
  {
    id: DEFAULT_ROOM_AVATAR_MALE.bottomId!,
    type: "bottom",
    bodyPreset: "male",
    fitProfileId: "blumi_male_room_avatar_v1",
    name: "Navy Basic Straight Pants",
    layerOrder: ROOM_AVATAR_OCCLUSION_ORDER.bottomOverShoeUpper,
    occlusionRole: "bottomOverShoeUpper",
    asset: roomAvatarLayerAssets.bottomMaleNavyStraightPantsV1,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomMaleNavyStraightPantsV1.walkingFront,
      roomAvatarMotionLayerAssets.bottomMaleNavyStraightPantsV1.sittingFront
    )
  },
  {
    id: DEFAULT_ROOM_AVATAR_MALE.shoesId!,
    type: "shoes",
    bodyPreset: "male",
    fitProfileId: "blumi_male_room_avatar_v1",
    name: "Milk Tea Court Sneakers",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.shoes,
    asset: roomAvatarLayerAssets.shoesMaleMilkTeaCourtV1,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.shoesMaleMilkTeaCourtV1.walkingFront,
      roomAvatarMotionLayerAssets.shoesMaleMilkTeaCourtV1.sittingFront
    )
  },
  ...MALE_CAPSULE_ROOM_ITEMS,
  {
    id: DEFAULT_ROOM_AVATAR_FEMALE.baseId,
    type: "base",
    bodyPreset: "female",
    name: "Female Room Base",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.base,
    asset: roomAvatarLayerAssets.baseFemaleV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.baseFemaleV2.walkingFront,
      roomAvatarMotionLayerAssets.baseFemaleV2.sittingFront
    ),
    isDefault: true
  },
  {
    id: "room_avatar_face_female_soft_doll_foundation_v2",
    type: "face",
    bodyPreset: "female",
    name: "Soft Doll Face Foundation",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.face,
    asset: roomAvatarLayerAssets.faceFemaleSoftDollFoundationV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.faceFemaleSoftDollFoundationV2.walkingFront,
      roomAvatarMotionLayerAssets.faceFemaleSoftDollFoundationV2.sittingFront
    ),
    isDefault: true
  },
  {
    id: "room_avatar_face_female_warm_peach_foundation_v2",
    type: "face",
    bodyPreset: "female",
    name: "Warm Peach Face Foundation",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.face,
    asset: roomAvatarLayerAssets.faceFemaleWarmPeachFoundationV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.faceFemaleWarmPeachFoundationV2.walkingFront,
      roomAvatarMotionLayerAssets.faceFemaleWarmPeachFoundationV2.sittingFront
    )
  },
  {
    id: "room_avatar_face_female_rose_heart_foundation_v2",
    type: "face",
    bodyPreset: "female",
    name: "Rose Heart Face Foundation",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.face,
    asset: roomAvatarLayerAssets.faceFemaleRoseHeartFoundationV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.faceFemaleRoseHeartFoundationV2.walkingFront,
      roomAvatarMotionLayerAssets.faceFemaleRoseHeartFoundationV2.sittingFront
    )
  },
  {
    id: "room_avatar_hair_back_female_mocha_ribbon_blowout_v2",
    type: "hairBack",
    bodyPreset: "female",
    name: "Mocha Ribbon Blowout Back",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairBack,
    asset: roomAvatarLayerAssets.hairBackFemaleMochaRibbonBlowoutV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.hairBackFemaleMochaRibbonBlowoutV2.walkingFront,
      roomAvatarMotionLayerAssets.hairBackFemaleMochaRibbonBlowoutV2.sittingFront
    )
  },
  {
    id: "room_avatar_hair_front_female_mocha_ribbon_blowout_v2",
    type: "hairFront",
    bodyPreset: "female",
    name: "Mocha Ribbon Blowout Front",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairFront,
    asset: roomAvatarLayerAssets.hairFrontFemaleMochaRibbonBlowoutV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.hairFrontFemaleMochaRibbonBlowoutV2.walkingFront,
      roomAvatarMotionLayerAssets.hairFrontFemaleMochaRibbonBlowoutV2.sittingFront
    )
  },
  {
    id: "room_avatar_hair_back_female_midnight_french_bob_v2",
    type: "hairBack",
    bodyPreset: "female",
    name: "Midnight French Bob Back",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairBack,
    asset: roomAvatarLayerAssets.hairBackFemaleMidnightFrenchBobV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.hairBackFemaleMidnightFrenchBobV2.walkingFront,
      roomAvatarMotionLayerAssets.hairBackFemaleMidnightFrenchBobV2.sittingFront
    )
  },
  {
    id: "room_avatar_hair_front_female_midnight_french_bob_v2",
    type: "hairFront",
    bodyPreset: "female",
    name: "Midnight French Bob Front",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairFront,
    asset: roomAvatarLayerAssets.hairFrontFemaleMidnightFrenchBobV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.hairFrontFemaleMidnightFrenchBobV2.walkingFront,
      roomAvatarMotionLayerAssets.hairFrontFemaleMidnightFrenchBobV2.sittingFront
    )
  },
  {
    id: "room_avatar_hair_back_female_honey_halfup_waves_v2",
    type: "hairBack",
    bodyPreset: "female",
    name: "Golden Blonde Half-Up Waves Back",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairBack,
    asset: roomAvatarLayerAssets.hairBackFemaleHoneyHalfupWavesV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.hairBackFemaleHoneyHalfupWavesV2.walkingFront,
      roomAvatarMotionLayerAssets.hairBackFemaleHoneyHalfupWavesV2.sittingFront
    )
  },
  {
    id: "room_avatar_hair_front_female_honey_halfup_waves_v2",
    type: "hairFront",
    bodyPreset: "female",
    name: "Golden Blonde Half-Up Waves Front",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairFront,
    asset: roomAvatarLayerAssets.hairFrontFemaleHoneyHalfupWavesV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.hairFrontFemaleHoneyHalfupWavesV2.walkingFront,
      roomAvatarMotionLayerAssets.hairFrontFemaleHoneyHalfupWavesV2.sittingFront
    )
  },
  {
    id: "room_avatar_hair_back_female_chestnut_butterfly_bob_v2",
    type: "hairBack",
    bodyPreset: "female",
    name: "Chestnut Butterfly Bob Back",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairBack,
    asset: roomAvatarLayerAssets.hairBackFemaleChestnutButterflyBobV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.hairBackFemaleChestnutButterflyBobV2.walkingFront,
      roomAvatarMotionLayerAssets.hairBackFemaleChestnutButterflyBobV2.sittingFront
    )
  },
  {
    id: "room_avatar_hair_front_female_chestnut_butterfly_bob_v2",
    type: "hairFront",
    bodyPreset: "female",
    name: "Chestnut Butterfly Bob Front",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.hairFront,
    asset: roomAvatarLayerAssets.hairFrontFemaleChestnutButterflyBobV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.hairFrontFemaleChestnutButterflyBobV2.walkingFront,
      roomAvatarMotionLayerAssets.hairFrontFemaleChestnutButterflyBobV2.sittingFront
    )
  },
  {
    id: "room_avatar_eyes_female_mocha_doe_v2",
    type: "eyes",
    bodyPreset: "female",
    name: "Mocha Doe Eyes",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.eyes,
    asset: roomAvatarLayerAssets.eyesFemaleMochaDoeV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.eyesFemaleMochaDoeV2.walkingFront,
      roomAvatarMotionLayerAssets.eyesFemaleMochaDoeV2.sittingFront
    ),
    isDefault: true
  },
  {
    id: "room_avatar_eyes_female_sage_glass_v2",
    type: "eyes",
    bodyPreset: "female",
    name: "Sage Glass Eyes",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.eyes,
    asset: roomAvatarLayerAssets.eyesFemaleSageGlassV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.eyesFemaleSageGlassV2.walkingFront,
      roomAvatarMotionLayerAssets.eyesFemaleSageGlassV2.sittingFront
    )
  },
  {
    id: "room_avatar_eyes_female_twilight_plum_v2",
    type: "eyes",
    bodyPreset: "female",
    name: "Twilight Plum Eyes",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.eyes,
    asset: roomAvatarLayerAssets.eyesFemaleTwilightPlumV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.eyesFemaleTwilightPlumV2.walkingFront,
      roomAvatarMotionLayerAssets.eyesFemaleTwilightPlumV2.sittingFront
    )
  },
  {
    id: "room_avatar_nose_female_soft_button_v2",
    type: "nose",
    bodyPreset: "female",
    name: "Soft Button Nose",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.nose,
    asset: roomAvatarLayerAssets.noseFemaleSoftButtonV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.noseFemaleSoftButtonV2.walkingFront,
      roomAvatarMotionLayerAssets.noseFemaleSoftButtonV2.sittingFront
    ),
    isDefault: true
  },
  {
    id: "room_avatar_nose_female_petal_curve_v2",
    type: "nose",
    bodyPreset: "female",
    name: "Petal Curve Nose",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.nose,
    asset: roomAvatarLayerAssets.noseFemalePetalCurveV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.noseFemalePetalCurveV2.walkingFront,
      roomAvatarMotionLayerAssets.noseFemalePetalCurveV2.sittingFront
    )
  },
  {
    id: "room_avatar_nose_female_gentle_bridge_v2",
    type: "nose",
    bodyPreset: "female",
    name: "Gentle Bridge Nose",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.nose,
    asset: roomAvatarLayerAssets.noseFemaleGentleBridgeV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.noseFemaleGentleBridgeV2.walkingFront,
      roomAvatarMotionLayerAssets.noseFemaleGentleBridgeV2.sittingFront
    )
  },
  {
    id: "room_avatar_mouth_female_peach_whisper_smile_v2",
    type: "mouth",
    bodyPreset: "female",
    name: "Peach Whisper Smile",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.mouth,
    asset: roomAvatarLayerAssets.mouthFemalePeachWhisperSmileV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.mouthFemalePeachWhisperSmileV2.walkingFront,
      roomAvatarMotionLayerAssets.mouthFemalePeachWhisperSmileV2.sittingFront
    ),
    isDefault: true
  },
  {
    id: "room_avatar_mouth_female_rose_gloss_smile_v2",
    type: "mouth",
    bodyPreset: "female",
    name: "Rose Gloss Smile",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.mouth,
    asset: roomAvatarLayerAssets.mouthFemaleRoseGlossSmileV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.mouthFemaleRoseGlossSmileV2.walkingFront,
      roomAvatarMotionLayerAssets.mouthFemaleRoseGlossSmileV2.sittingFront
    )
  },
  {
    id: "room_avatar_mouth_female_berry_soft_kiss_v2",
    type: "mouth",
    bodyPreset: "female",
    name: "Berry Soft Kiss",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.mouth,
    asset: roomAvatarLayerAssets.mouthFemaleBerrySoftKissV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.mouthFemaleBerrySoftKissV2.walkingFront,
      roomAvatarMotionLayerAssets.mouthFemaleBerrySoftKissV2.sittingFront
    )
  },
  {
    id: "room_avatar_shoes_female_milk_tea_court_sneakers_v2",
    type: "shoes",
    bodyPreset: "female",
    name: "Milk Tea Court Sneakers",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.shoes,
    asset: roomAvatarLayerAssets.shoesFemaleMilkTeaCourtSneakersV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.shoesFemaleMilkTeaCourtSneakersV2.walkingFront,
      roomAvatarMotionLayerAssets.shoesFemaleMilkTeaCourtSneakersV2.sittingFront
    )
  },
  {
    id: "room_avatar_shoes_female_cherry_satin_ballets_v2",
    type: "shoes",
    bodyPreset: "female",
    name: "Cherry Satin Ballets",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.shoes,
    asset: roomAvatarLayerAssets.shoesFemaleCherrySatinBalletsV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.shoesFemaleCherrySatinBalletsV2.walkingFront,
      roomAvatarMotionLayerAssets.shoesFemaleCherrySatinBalletsV2.sittingFront
    )
  },
  {
    id: "room_avatar_shoes_female_onyx_heart_mary_janes_v2",
    type: "shoes",
    bodyPreset: "female",
    name: "Onyx Heart Mary Janes",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.shoes,
    asset: roomAvatarLayerAssets.shoesFemaleOnyxHeartMaryJanesV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.shoesFemaleOnyxHeartMaryJanesV2.walkingFront,
      roomAvatarMotionLayerAssets.shoesFemaleOnyxHeartMaryJanesV2.sittingFront
    )
  },
  // Mapping Coverage v1 — female wardrobe layers
  {
    id: "room_avatar_top_female_cream_knit_v2",
    type: "top",
    bodyPreset: "female",
    name: "Cream Knit",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleCreamKnitV2
  },
  {
    id: "room_avatar_bottom_female_denim_straight_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Denim Straight",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleDenimStraightV2
  },
  // Motion v1 integration — approved female wardrobe/runtime items
  {
    id: "room_avatar_top_female_cream_basic_tee_v2",
    type: "top",
    bodyPreset: "female",
    name: "Cream Basic Tee",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleCreamBasicTeeV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemaleCreamBasicTeeV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemaleCreamBasicTeeV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_denim_skort_shorts_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Denim Skort Shorts",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleDenimSkortShortsV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleDenimSkortShortsV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleDenimSkortShortsV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_striped_crochet_shorts_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Striped Crochet Shorts",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleStripedCrochetShortsV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleStripedCrochetShortsV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleStripedCrochetShortsV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_layered_lace_ruffle_mini_skirt_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Layered Lace Ruffle Mini Skirt",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleLayeredLaceRuffleMiniSkirtV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleLayeredLaceRuffleMiniSkirtV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleLayeredLaceRuffleMiniSkirtV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_black_palm_embellished_pants_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Black Palm Embellished Pants",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleBlackPalmEmbellishedPantsV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleBlackPalmEmbellishedPantsV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleBlackPalmEmbellishedPantsV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_coral_embellished_laceup_pants_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Coral Embellished Lace-Up Pants",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleCoralEmbellishedLaceupPantsV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleCoralEmbellishedLaceupPantsV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleCoralEmbellishedLaceupPantsV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_smoky_floral_mesh_pants_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Smoky Floral Mesh Pants",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleSmokyFloralMeshPantsV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleSmokyFloralMeshPantsV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleSmokyFloralMeshPantsV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Yellow Bow Lace Ruffle Skirt",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleYellowBowLaceRuffleSkirtV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleYellowBowLaceRuffleSkirtV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleYellowBowLaceRuffleSkirtV2.sittingFront
    )
  },
  {
    id: "room_avatar_top_female_boho_patchwork_maxi_dress_v2",
    type: "top",
    bodyPreset: "female",
    name: "Boho Patchwork Maxi Dress Top",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleBohoPatchworkMaxiDressV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemaleBohoPatchworkMaxiDressV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemaleBohoPatchworkMaxiDressV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_boho_patchwork_maxi_dress_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Boho Patchwork Maxi Dress Bottom",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleBohoPatchworkMaxiDressV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleBohoPatchworkMaxiDressV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleBohoPatchworkMaxiDressV2.sittingFront
    )
  },
  {
    id: "room_avatar_top_female_embroidered_halter_wrap_dress_v2",
    type: "top",
    bodyPreset: "female",
    name: "Embroidered Halter Wrap Dress Top",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleEmbroideredHalterWrapDressV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemaleEmbroideredHalterWrapDressV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemaleEmbroideredHalterWrapDressV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_embroidered_halter_wrap_dress_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Embroidered Halter Wrap Dress Bottom",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleEmbroideredHalterWrapDressV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleEmbroideredHalterWrapDressV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleEmbroideredHalterWrapDressV2.sittingFront
    )
  },
  {
    id: "room_avatar_top_female_ruched_patchwork_mini_dress_v2",
    type: "top",
    bodyPreset: "female",
    name: "Ruched Patchwork Mini Dress Top",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleRuchedPatchworkMiniDressV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemaleRuchedPatchworkMiniDressV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemaleRuchedPatchworkMiniDressV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_ruched_patchwork_mini_dress_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "Ruched Patchwork Mini Dress Bottom",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleRuchedPatchworkMiniDressV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleRuchedPatchworkMiniDressV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleRuchedPatchworkMiniDressV2.sittingFront
    )
  },
  {
    id: "room_avatar_top_female_white_lace_cami_mini_dress_v2",
    type: "top",
    bodyPreset: "female",
    name: "White Lace Cami Mini Dress Top",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleWhiteLaceCamiMiniDressV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemaleWhiteLaceCamiMiniDressV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemaleWhiteLaceCamiMiniDressV2.sittingFront
    )
  },
  {
    id: "room_avatar_bottom_female_white_lace_cami_mini_dress_v2",
    type: "bottom",
    bodyPreset: "female",
    name: "White Lace Cami Mini Dress Bottom",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.bottom,
    asset: roomAvatarLayerAssets.bottomFemaleWhiteLaceCamiMiniDressV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.bottomFemaleWhiteLaceCamiMiniDressV2.walkingFront,
      roomAvatarMotionLayerAssets.bottomFemaleWhiteLaceCamiMiniDressV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_ivory_ribbon_beret_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Ivory Ribbon Beret",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleIvoryRibbonBeretV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleIvoryRibbonBeretV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleIvoryRibbonBeretV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_cherry_bow_headband_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Cherry Bow Headband",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleCherryBowHeadbandV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleCherryBowHeadbandV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleCherryBowHeadbandV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_sage_heart_glasses_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Sage Heart Glasses",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleSageHeartGlassesV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleSageHeartGlassesV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleSageHeartGlassesV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_rose_round_glasses_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Rose Round Glasses",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleRoseRoundGlassesV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleRoseRoundGlassesV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleRoseRoundGlassesV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Lavender Pearl Cat-Eye Glasses",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleLavenderPearlCatEyeGlassesV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleLavenderPearlCatEyeGlassesV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleLavenderPearlCatEyeGlassesV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_mint_star_oval_glasses_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Mint Star Oval Glasses",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleMintStarOvalGlassesV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleMintStarOvalGlassesV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleMintStarOvalGlassesV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_honey_blossom_square_glasses_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Honey Blossom Square Glasses",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleHoneyBlossomSquareGlassesV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleHoneyBlossomSquareGlassesV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleHoneyBlossomSquareGlassesV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_pearl_drop_earrings_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Pearl Drop Earrings",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemalePearlDropEarringsV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemalePearlDropEarringsV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemalePearlDropEarringsV2.sittingFront
    ),
    accessoryLayerParts: [
      {
        id: "earring-rear",
        occlusionSlot: "behindHairFront",
        asset: roomAvatarLayerAssets.accessoryFemalePearlDropEarringsV2EarringRear,
        assetsByMotion: createExactMotionVariants(
          roomAvatarMotionLayerAssets.accessoryFemalePearlDropEarringsV2EarringRear.walkingFront,
          roomAvatarMotionLayerAssets.accessoryFemalePearlDropEarringsV2EarringRear.sittingFront
        )
      },
      {
        id: "pearl-front",
        occlusionSlot: "front",
        asset: roomAvatarLayerAssets.accessoryFemalePearlDropEarringsV2PearlFront,
        assetsByMotion: createExactMotionVariants(
          roomAvatarMotionLayerAssets.accessoryFemalePearlDropEarringsV2PearlFront.walkingFront,
          roomAvatarMotionLayerAssets.accessoryFemalePearlDropEarringsV2PearlFront.sittingFront
        )
      }
    ]
  },
  {
    id: "room_avatar_accessory_female_golden_heart_locket_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Golden Heart Locket",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleGoldenHeartLocketV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleGoldenHeartLocketV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleGoldenHeartLocketV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_buttercream_neck_scarf_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Buttercream Neck Scarf",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleButtercreamNeckScarfV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleButtercreamNeckScarfV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleButtercreamNeckScarfV2.sittingFront
    )
  },
  {
    id: "room_avatar_accessory_female_cherry_micro_bag_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Cherry Micro Bag",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleCherryMicroBagV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleCherryMicroBagV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleCherryMicroBagV2.sittingFront
    ),
    accessoryLayerParts: [
      {
        id: "bag-back",
        occlusionSlot: "behindBody",
        asset: roomAvatarLayerAssets.accessoryFemaleCherryMicroBagV2BagBack,
        assetsByMotion: createExactMotionVariants(
          roomAvatarMotionLayerAssets.accessoryFemaleCherryMicroBagV2BagBack.walkingFront,
          roomAvatarMotionLayerAssets.accessoryFemaleCherryMicroBagV2BagBack.sittingFront
        )
      },
      {
        id: "strap-back",
        occlusionSlot: "behindHairFront",
        asset: roomAvatarLayerAssets.accessoryFemaleCherryMicroBagV2StrapBack,
        assetsByMotion: createExactMotionVariants(
          roomAvatarMotionLayerAssets.accessoryFemaleCherryMicroBagV2StrapBack.walkingFront,
          roomAvatarMotionLayerAssets.accessoryFemaleCherryMicroBagV2StrapBack.sittingFront
        )
      },
      {
        id: "bag-front",
        occlusionSlot: "front",
        asset: roomAvatarLayerAssets.accessoryFemaleCherryMicroBagV2BagFront,
        assetsByMotion: createExactMotionVariants(
          roomAvatarMotionLayerAssets.accessoryFemaleCherryMicroBagV2BagFront.walkingFront,
          roomAvatarMotionLayerAssets.accessoryFemaleCherryMicroBagV2BagFront.sittingFront
        )
      }
    ]
  },
  {
    id: "room_avatar_accessory_female_sunny_star_clips_v2",
    type: "accessory",
    bodyPreset: "female",
    name: "Sunny Star Clips",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.accessory + 20,
    asset: roomAvatarLayerAssets.accessoryFemaleSunnyStarClipsV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.accessoryFemaleSunnyStarClipsV2.walkingFront,
      roomAvatarMotionLayerAssets.accessoryFemaleSunnyStarClipsV2.sittingFront
    ),
    accessoryLayerParts: [
      {
        id: "clips-front",
        occlusionSlot: "front",
        asset: roomAvatarLayerAssets.accessoryFemaleSunnyStarClipsV2ClipsFront,
        assetsByMotion: createExactMotionVariants(
          roomAvatarMotionLayerAssets.accessoryFemaleSunnyStarClipsV2ClipsFront.walkingFront,
          roomAvatarMotionLayerAssets.accessoryFemaleSunnyStarClipsV2ClipsFront.sittingFront
        )
      }
    ]
  },
  {
    id: "room_avatar_shoes_female_rosewood_platform_loafers_v2",
    type: "shoes",
    bodyPreset: "female",
    name: "Rosewood Platform Loafers",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.shoes,
    asset: roomAvatarLayerAssets.shoesFemaleRosewoodPlatformLoafersV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.shoesFemaleRosewoodPlatformLoafersV2.walkingFront,
      roomAvatarMotionLayerAssets.shoesFemaleRosewoodPlatformLoafersV2.sittingFront
    )
  },
  {
    id: "room_avatar_shoes_female_pearl_slingback_sandals_v2",
    type: "shoes",
    bodyPreset: "female",
    name: "Pearl Slingback Sandals",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.shoes,
    asset: roomAvatarLayerAssets.shoesFemalePearlSlingbackSandalsV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.shoesFemalePearlSlingbackSandalsV2.walkingFront,
      roomAvatarMotionLayerAssets.shoesFemalePearlSlingbackSandalsV2.sittingFront
    )
  },
  {
    id: "room_avatar_top_female_blush_lace_cardigan_v2",
    type: "top",
    bodyPreset: "female",
    name: "Blush Lace Cardigan",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleBlushLaceCardiganV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemaleBlushLaceCardiganV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemaleBlushLaceCardiganV2.sittingFront
    )
  },
  {
    id: "room_avatar_top_female_sage_ribbon_knit_jacket_v2",
    type: "top",
    bodyPreset: "female",
    name: "Sage Ribbon Knit Jacket",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleSageRibbonKnitJacketV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemaleSageRibbonKnitJacketV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemaleSageRibbonKnitJacketV2.sittingFront
    )
  },
  {
    id: "room_avatar_top_female_cherry_heart_milkmaid_blouse_v2",
    type: "top",
    bodyPreset: "female",
    name: "Cherry Heart Milkmaid Blouse",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleCherryHeartMilkmaidBlouseV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemaleCherryHeartMilkmaidBlouseV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemaleCherryHeartMilkmaidBlouseV2.sittingFront
    )
  },
  {
    id: "room_avatar_top_female_powder_blue_ribbon_corset_top_v2",
    type: "top",
    bodyPreset: "female",
    name: "Powder Blue Ribbon Corset Top",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemalePowderBlueRibbonCorsetTopV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemalePowderBlueRibbonCorsetTopV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemalePowderBlueRibbonCorsetTopV2.sittingFront
    )
  },
  {
    id: "room_avatar_top_female_noir_rose_heart_cardigan_v2",
    type: "top",
    bodyPreset: "female",
    name: "Noir Rose Heart Cardigan",
    layerOrder: ROOM_AVATAR_LAYER_ORDER.top,
    asset: roomAvatarLayerAssets.topFemaleNoirRoseHeartCardiganV2,
    assetsByMotion: createExactMotionVariants(
      roomAvatarMotionLayerAssets.topFemaleNoirRoseHeartCardiganV2.walkingFront,
      roomAvatarMotionLayerAssets.topFemaleNoirRoseHeartCardiganV2.sittingFront
    )
  }
]

const PREMIUM_EYES_MOTION = {
  hazel_almond_doe: roomAvatarMotionLayerAssets.eyesFemaleHazelAlmondDoeV2,
  deep_brown_star: roomAvatarMotionLayerAssets.eyesFemaleDeepBrownStarV2,
  cocoa_puppy: roomAvatarMotionLayerAssets.eyesFemaleCocoaPuppyV2,
  honey_amber: roomAvatarMotionLayerAssets.eyesFemaleHoneyAmberV2,
  chestnut_luminous: roomAvatarMotionLayerAssets.eyesFemaleChestnutLuminousV2
} as const
const PREMIUM_NOSE_MOTION = {
  tiny_upturned: roomAvatarMotionLayerAssets.noseFemaleTinyUpturnedV2,
  petite_rounded: roomAvatarMotionLayerAssets.noseFemalePetiteRoundedV2,
  heart_tip: roomAvatarMotionLayerAssets.noseFemaleHeartTipV2,
  narrow_button: roomAvatarMotionLayerAssets.noseFemaleNarrowButtonV2,
  sculpted_doll: roomAvatarMotionLayerAssets.noseFemaleSculptedDollV2
} as const
const PREMIUM_MOUTH_MOTION = {
  coral_bow_smile: roomAvatarMotionLayerAssets.mouthFemaleCoralBowSmileV2,
  nude_pink_whisper: roomAvatarMotionLayerAssets.mouthFemaleNudePinkWhisperV2,
  cherry_balm_smile: roomAvatarMotionLayerAssets.mouthFemaleCherryBalmSmileV2,
  soft_mauve_smile: roomAvatarMotionLayerAssets.mouthFemaleSoftMauveSmileV2,
  rosewater_cupid_bow: roomAvatarMotionLayerAssets.mouthFemaleRosewaterCupidBowV2
} as const

const PREMIUM_STATIC_FEATURE_ITEMS: RoomAvatarCatalogItem[] = [
  ...([
    ["hazel_almond_doe", "Hazel Almond Doe Eyes", roomAvatarLayerAssets.eyesFemaleHazelAlmondDoeV2],
    ["deep_brown_star", "Deep Brown Star Eyes", roomAvatarLayerAssets.eyesFemaleDeepBrownStarV2],
    ["cocoa_puppy", "Cocoa Puppy Eyes", roomAvatarLayerAssets.eyesFemaleCocoaPuppyV2],
    ["honey_amber", "Honey Amber Eyes", roomAvatarLayerAssets.eyesFemaleHoneyAmberV2],
    ["chestnut_luminous", "Luminous Chestnut Eyes", roomAvatarLayerAssets.eyesFemaleChestnutLuminousV2]
  ] as const).map(([slug, name, asset]) => ({
    id: `room_avatar_eyes_female_${slug}_v2`,
    type: "eyes" as const,
    bodyPreset: "female" as const,
    name,
    layerOrder: ROOM_AVATAR_LAYER_ORDER.eyes,
    asset,
    assetsByMotion: createExactMotionVariants(
      PREMIUM_EYES_MOTION[slug].walkingFront,
      PREMIUM_EYES_MOTION[slug].sittingFront
    )
  })),
  ...([
    ["tiny_upturned", "Tiny Upturned Nose", roomAvatarLayerAssets.noseFemaleTinyUpturnedV2],
    ["petite_rounded", "Petite Rounded Nose", roomAvatarLayerAssets.noseFemalePetiteRoundedV2],
    ["heart_tip", "Soft Heart-Tip Nose", roomAvatarLayerAssets.noseFemaleHeartTipV2],
    ["narrow_button", "Narrow Button Nose", roomAvatarLayerAssets.noseFemaleNarrowButtonV2],
    ["sculpted_doll", "Sculpted Doll Nose", roomAvatarLayerAssets.noseFemaleSculptedDollV2]
  ] as const).map(([slug, name, asset]) => ({
    id: `room_avatar_nose_female_${slug}_v2`,
    type: "nose" as const,
    bodyPreset: "female" as const,
    name,
    layerOrder: ROOM_AVATAR_LAYER_ORDER.nose,
    asset,
    assetsByMotion: createExactMotionVariants(
      PREMIUM_NOSE_MOTION[slug].walkingFront,
      PREMIUM_NOSE_MOTION[slug].sittingFront
    )
  })),
  ...([
    ["coral_bow_smile", "Coral Bow Smile", roomAvatarLayerAssets.mouthFemaleCoralBowSmileV2],
    ["nude_pink_whisper", "Nude Pink Whisper", roomAvatarLayerAssets.mouthFemaleNudePinkWhisperV2],
    ["cherry_balm_smile", "Cherry Balm Smile", roomAvatarLayerAssets.mouthFemaleCherryBalmSmileV2],
    ["soft_mauve_smile", "Soft Mauve Smile", roomAvatarLayerAssets.mouthFemaleSoftMauveSmileV2],
    ["rosewater_cupid_bow", "Rosewater Cupid Bow", roomAvatarLayerAssets.mouthFemaleRosewaterCupidBowV2]
  ] as const).map(([slug, name, asset]) => ({
    id: `room_avatar_mouth_female_${slug}_v2`,
    type: "mouth" as const,
    bodyPreset: "female" as const,
    name,
    layerOrder: ROOM_AVATAR_LAYER_ORDER.mouth,
    asset,
    assetsByMotion: createExactMotionVariants(
      PREMIUM_MOUTH_MOTION[slug].walkingFront,
      PREMIUM_MOUTH_MOTION[slug].sittingFront
    )
  })),
  ...([
    ["cherry_ribbon_twin_braids", "Cherry Ribbon Twin Braids", roomAvatarLayerAssets.hairBackFemaleCherryRibbonTwinBraidsV2, roomAvatarLayerAssets.hairFrontFemaleCherryRibbonTwinBraidsV2, roomAvatarMotionLayerAssets.hairBackFemaleCherryRibbonTwinBraidsV2, roomAvatarMotionLayerAssets.hairFrontFemaleCherryRibbonTwinBraidsV2],
    ["cocoa_cloud_ponytail", "Cocoa Cloud Ponytail", roomAvatarLayerAssets.hairBackFemaleCocoaCloudPonytailV2, roomAvatarLayerAssets.hairFrontFemaleCocoaCloudPonytailV2, roomAvatarMotionLayerAssets.hairBackFemaleCocoaCloudPonytailV2, roomAvatarMotionLayerAssets.hairFrontFemaleCocoaCloudPonytailV2],
    ["espresso_sleek_ribbon_pony", "Espresso Ribbon Pony", roomAvatarLayerAssets.hairBackFemaleEspressoSleekRibbonPonyV2, roomAvatarLayerAssets.hairFrontFemaleEspressoSleekRibbonPonyV2, roomAvatarMotionLayerAssets.hairBackFemaleEspressoSleekRibbonPonyV2, roomAvatarMotionLayerAssets.hairFrontFemaleEspressoSleekRibbonPonyV2],
    ["rosewood_butterfly_layers", "Rosewood Butterfly Layers", roomAvatarLayerAssets.hairBackFemaleRosewoodButterflyLayersV2, roomAvatarLayerAssets.hairFrontFemaleRosewoodButterflyLayersV2, roomAvatarMotionLayerAssets.hairBackFemaleRosewoodButterflyLayersV2, roomAvatarMotionLayerAssets.hairFrontFemaleRosewoodButterflyLayersV2],
    ["caramel_braided_crown", "Caramel Braided Crown", roomAvatarLayerAssets.hairBackFemaleCaramelBraidedCrownV2, roomAvatarLayerAssets.hairFrontFemaleCaramelBraidedCrownV2, roomAvatarMotionLayerAssets.hairBackFemaleCaramelBraidedCrownV2, roomAvatarMotionLayerAssets.hairFrontFemaleCaramelBraidedCrownV2],
    ["berry_velvet_soft_updo", "Berry Velvet Soft Updo", roomAvatarLayerAssets.hairBackFemaleBerryVelvetSoftUpdoV2, roomAvatarLayerAssets.hairFrontFemaleBerryVelvetSoftUpdoV2, roomAvatarMotionLayerAssets.hairBackFemaleBerryVelvetSoftUpdoV2, roomAvatarMotionLayerAssets.hairFrontFemaleBerryVelvetSoftUpdoV2],
    ["golden_waves", "Golden Waves", roomAvatarLayerAssets.hairBackFemaleGoldenWavesV2, roomAvatarLayerAssets.hairFrontFemaleGoldenWavesV2, roomAvatarMotionLayerAssets.hairBackFemaleGoldenWavesV2, roomAvatarMotionLayerAssets.hairFrontFemaleGoldenWavesV2],
    ["ink_pageboy_star", "Ink Pageboy Star", roomAvatarLayerAssets.hairBackFemaleInkPageboyStarV2, roomAvatarLayerAssets.hairFrontFemaleInkPageboyStarV2, roomAvatarMotionLayerAssets.hairBackFemaleInkPageboyStarV2, roomAvatarMotionLayerAssets.hairFrontFemaleInkPageboyStarV2],
    ["ink_twin_braids", "Ink Twin Braids", roomAvatarLayerAssets.hairBackFemaleInkTwinBraidsV2, roomAvatarLayerAssets.hairFrontFemaleInkTwinBraidsV2, roomAvatarMotionLayerAssets.hairBackFemaleInkTwinBraidsV2, roomAvatarMotionLayerAssets.hairFrontFemaleInkTwinBraidsV2],
    ["pale_golden_bow_bob", "Pale Golden Bow Bob", roomAvatarLayerAssets.hairBackFemalePaleGoldenBowBobV2, roomAvatarLayerAssets.hairFrontFemalePaleGoldenBowBobV2, roomAvatarMotionLayerAssets.hairBackFemalePaleGoldenBowBobV2, roomAvatarMotionLayerAssets.hairFrontFemalePaleGoldenBowBobV2],
    ["copper_bow_waves", "Copper Bow Waves", roomAvatarLayerAssets.hairBackFemaleCopperBowWavesV2, roomAvatarLayerAssets.hairFrontFemaleCopperBowWavesV2, roomAvatarMotionLayerAssets.hairBackFemaleCopperBowWavesV2, roomAvatarMotionLayerAssets.hairFrontFemaleCopperBowWavesV2]
  ] as const).flatMap(([slug, name, backAsset, frontAsset, backMotion, frontMotion]) => [
    {
      id: `room_avatar_hair_back_female_${slug}_v2`,
      type: "hairBack" as const,
      bodyPreset: "female" as const,
      name: `${name} Back`,
      layerOrder: ROOM_AVATAR_LAYER_ORDER.hairBack,
      asset: backAsset,
      ...(backMotion ? {
        assetsByMotion: createExactMotionVariants(
          backMotion.walkingFront,
          backMotion.sittingFront
        )
      } : {})
    },
    {
      id: `room_avatar_hair_front_female_${slug}_v2`,
      type: "hairFront" as const,
      bodyPreset: "female" as const,
      name: `${name} Front`,
      layerOrder: ROOM_AVATAR_LAYER_ORDER.hairFront,
      asset: frontAsset,
      ...(frontMotion ? {
        assetsByMotion: createExactMotionVariants(
          frontMotion.walkingFront,
          frontMotion.sittingFront
        )
      } : {})
    }
  ])
]

/**
 * Female trousers deliberately sit over the shoe upper. The previous shared
 * bottom=40 order made every female shoe paint over trouser hems, which is
 * visible as a hard overlap at native resolution. Shorts, skirts, and dresses
 * keep the behind-shoes role because their hems stop above the foot contact.
 */
const FEMALE_BOTTOM_IDS = new Set(
  [
    ...ROOM_AVATAR_CATALOG_ITEMS,
    ...MALE_PREMIUM_CAPSULE_ROOM_ITEMS,
    ...FEMALE_SWEET_CAPSULE_ROOM_ITEMS,
    ...PREMIUM_STATIC_FEATURE_ITEMS
  ]
    .filter((item) => item.bodyPreset === "female" && item.type === "bottom")
    .map((item) => item.id)
)

/**
 * These two legacy layers were generated from the wrong source crop and have
 * no motion variants. They remain on disk for historical recovery, but must
 * not be resolvable by the production room catalog until re-authored against
 * the female canonical base.
 */
export const ROOM_AVATAR_CATALOG: RoomAvatarCatalogItem[] =
  [
    ...ROOM_AVATAR_CATALOG_ITEMS,
    ...MALE_PREMIUM_CAPSULE_ROOM_ITEMS,
    ...FEMALE_SWEET_CAPSULE_ROOM_ITEMS,
    ...PREMIUM_STATIC_FEATURE_ITEMS
  ]
    .filter((item) => !FEMALE_WARDROBE_QUARANTINED_ITEM_IDS.has(item.id))
    .map((item) => {
      const withFitProfile = item.bodyPreset === "female"
        ? {
            ...item,
            rigId: "blumi_2_5d_layered_v1" as const,
            fitProfileId: "blumi_female_room_avatar_v1" as const
          }
        : item

      if (FEMALE_BOTTOM_IDS.has(withFitProfile.id)) {
        const occlusionRole: RoomAvatarOcclusionRole = FEMALE_PANTS_OVER_SHOE_UPPER_IDS.has(
          withFitProfile.id
        )
          ? "bottomOverShoeUpper"
          : "bottomBehindShoes"

        return {
          ...withFitProfile,
          layerOrder: occlusionRole === "bottomOverShoeUpper"
            ? ROOM_AVATAR_OCCLUSION_ORDER.bottomOverShoeUpper
            : ROOM_AVATAR_OCCLUSION_ORDER.bottomBehindShoes,
          occlusionRole
        }
      }
      if (MALE_BOTTOMS_BEHIND_SHOES_IDS.has(withFitProfile.id)) {
        return {
          ...withFitProfile,
          layerOrder: ROOM_AVATAR_OCCLUSION_ORDER.bottomBehindShoes,
          occlusionRole: "bottomBehindShoes" as const
        }
      }
      return withFitProfile
    })
    .map(withIdleFrontMotionAsset)

function withIdleFrontMotionAsset(
  item: RoomAvatarCatalogItem
): RoomAvatarCatalogItem {
  return {
    ...item,
    assetsByMotion: {
      ...item.assetsByMotion,
      idle: {
        ...item.assetsByMotion?.idle,
        front: item.assetsByMotion?.idle?.front ?? getIdleFrontAsset(item)
      }
    }
  }
}

function getIdleFrontAsset(item: RoomAvatarCatalogItem): RoomV2AvatarMotionAsset {
  return item.asset
}

function createExactMotionVariants(
  walkingFront: RoomV2AvatarMotionAsset,
  sittingFront: RoomV2AvatarMotionAsset
) {
  return {
    walking: {
      front: walkingFront
    },
    sitting: {
      front: sittingFront
    }
  }
}
