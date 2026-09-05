import { avatarV2LayerAssets } from "./avatarV2Assets"
import { FEMALE_SWEET_CAPSULE_LAYERS } from "./femaleSweetCapsuleDefinitions"
import { MALE_PREMIUM_CAPSULE_RUNTIME } from "./malePremiumCapsulePilotDefinitions"
import type {
  AvatarCatalogItem,
  AvatarCategory,
  AvatarInventory,
  AvatarLayerAssetRef,
  AvatarItemType,
  UserAvatar
} from "./avatarV2.types"

export const AVATAR_V2_CATEGORIES: AvatarCategory[] = [
  { type: "body", label: "Body" },
  { type: "face", label: "Face" },
  { type: "eyes", label: "Eyes" },
  { type: "nose", label: "Nose" },
  { type: "mouth", label: "Mouth" },
  { type: "hair", label: "Hair" },
  { type: "top", label: "Top" },
  { type: "bottom", label: "Bottom" },
  { type: "shoes", label: "Shoes" },
  { type: "accessory", label: "Accessories" }
]

export const AVATAR_V2_LAYER_ORDER: Record<AvatarItemType, number> = {
  body: 10,
  face: 20,
  eyes: 22,
  nose: 24,
  mouth: 26,
  hair: 30,
  bottom: 40,
  top: 50,
  shoes: 60,
  accessory: 70
}

export const DEFAULT_AVATAR_V2: UserAvatar = {
  bodyId: "avatar_v2_body_default",
  faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_mocha_doe",
  noseId: "avatar_v2_nose_soft_button",
  mouthId: "avatar_v2_mouth_peach_whisper_smile",
  hairId: "avatar_v2_hair_mocha_ribbon_blowout",
  topId: "avatar_v2_top_default",
  bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
  accessoryIds: []
}

const MALE_CAPSULE_AVATAR_ITEMS: AvatarCatalogItem[] = ([
  ["hair", "cocoa_textured_quiff", "Cocoa Textured Quiff", 20],
  ["hair", "soft_black_side_part", "Soft Black Side Part", 30],
  ["hair", "chestnut_short_waves", "Chestnut Short Waves", 40],
  ["top", "sage_basic_tee", "Sage Basic Tee", 30],
  ["top", "dusty_navy_tee", "Dusty Navy Tee", 40],
  ["top", "mist_blue_oxford_shirt", "Mist Blue Oxford Shirt", 50],
  ["top", "soft_sage_linen_shirt", "Soft Sage Linen Shirt", 60],
  ["top", "cocoa_varsity_jacket", "Cocoa Varsity Jacket", 70],
  ["top", "dusty_navy_chore_jacket", "Dusty Navy Chore Jacket", 80],
  ["bottom", "mid_blue_straight_jeans", "Mid Blue Straight Jeans", 20],
  ["bottom", "charcoal_tapered_chinos", "Charcoal Tapered Chinos", 30],
  ["bottom", "warm_sand_relaxed_pants", "Warm Sand Relaxed Pants", 40],
  ["shoes", "cloud_white_trainers", "Cloud White Trainers", 20],
  ["shoes", "cocoa_penny_loafers", "Cocoa Penny Loafers", 30],
  ["shoes", "dusty_blue_canvas_sneakers", "Dusty Blue Canvas Sneakers", 40]
] as const).map(([type, slug, name, sortOrder]) => ({
  id: `avatar_v2_${type}_male_${slug}`,
  type,
  name,
  sortOrder,
  layerOrder: AVATAR_V2_LAYER_ORDER[type],
  assets: {},
  ownedByDefault: true,
  compatibleBodyIds: ["avatar_v2_body_male_light"]
}))

const MALE_PREMIUM_CAPSULE_AVATAR_ITEMS: AvatarCatalogItem[] = MALE_PREMIUM_CAPSULE_RUNTIME.map((item, index) => {
  const type = item.type === "hairFront" ? "hair" : item.type
  return {
    id: `avatar_v2_${type}_male_${item.slug}`,
    type,
    name: item.name,
    sortOrder: 500 + index * 10,
    layerOrder: AVATAR_V2_LAYER_ORDER[type],
    assets: {},
    ...(item.type === "accessory" ? { accessoryGroup: item.accessoryGroup ?? "eyewear" } : {}),
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  }
})

const FEMALE_SWEET_CAPSULE_PROFILE_ASSETS = avatarV2LayerAssets as unknown as Record<
  string,
  AvatarLayerAssetRef
>

const FEMALE_STARTER_FREE_ITEM_IDS = new Set([
  "avatar_v2_top_buttercream_bow_tee",
  "avatar_v2_bottom_lavender_bow_twill_shorts",
  "avatar_v2_shoes_mint_ribbon_court_sneakers"
])

const AVATAR_STUDIO_FREE_ITEM_TYPES = new Set<AvatarItemType>([
  "face",
  "eyes",
  "nose",
  "mouth"
])

const FEMALE_SWEET_CAPSULE_AVATAR_ITEMS: AvatarCatalogItem[] =
  FEMALE_SWEET_CAPSULE_LAYERS.map((item) => {
    const id = `avatar_v2_${item.kind}_${item.slug}`
    return {
      id,
      type: item.kind,
      name: item.name,
      sortOrder: item.sortOrder,
      layerOrder: AVATAR_V2_LAYER_ORDER[item.kind],
      assets: { idle_front: FEMALE_SWEET_CAPSULE_PROFILE_ASSETS[item.profileAssetKey] },
      ...(item.outfitKey ? { outfitKey: item.outfitKey } : {}),
      ...(item.pairedItemId ? { pairedItemId: item.pairedItemId } : {}),
      ...(FEMALE_STARTER_FREE_ITEM_IDS.has(id) ? { ownedByDefault: true } : {}),
      ...(!item.visible
        ? { hiddenFromShop: true, hiddenFromWardrobe: true }
        : {})
    }
  })

const AVATAR_V2_CATALOG_SOURCE: AvatarCatalogItem[] = [
  {
    id: DEFAULT_AVATAR_V2.bodyId,
    type: "body",
    name: "Warm Base",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.body,
    assets: {},
    isDefault: true,
    ownedByDefault: true
  },
  {
    id: "avatar_v2_body_male_light",
    type: "body",
    name: "Masculine Light Base",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.body,
    assets: {},
    ownedByDefault: true
  },
  {
    id: "avatar_v2_face_male_warm_friendly",
    type: "face",
    name: "Warm Friendly Face",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.face,
    assets: {},
    ownedByDefault: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  {
    id: "avatar_v2_eyes_male_warm_brown",
    type: "eyes",
    name: "Warm Brown Eyes",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.eyes,
    assets: {},
    ownedByDefault: true,
    hiddenFromWardrobe: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  {
    id: "avatar_v2_nose_male_gentle_bridge",
    type: "nose",
    name: "Gentle Bridge",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.nose,
    assets: {},
    ownedByDefault: true,
    hiddenFromWardrobe: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  {
    id: "avatar_v2_mouth_male_soft_smile",
    type: "mouth",
    name: "Soft Smile",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.mouth,
    assets: {},
    ownedByDefault: true,
    hiddenFromWardrobe: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  {
    id: "avatar_v2_hair_male_espresso_crop",
    type: "hair",
    name: "Espresso Crop",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: {},
    ownedByDefault: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  {
    id: "avatar_v2_top_male_cream_basic_tee",
    type: "top",
    name: "Cream Basic Tee",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: {},
    ownedByDefault: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  {
    id: "avatar_v2_top_male_powder_blue_crew_tee",
    type: "top",
    name: "Powder Blue Basic Crew Tee",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: {},
    ownedByDefault: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  {
    id: "avatar_v2_bottom_male_sage_cuffed_shorts",
    type: "bottom",
    name: "Sage Cuffed Shorts",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: {},
    ownedByDefault: true,
    hiddenFromShop: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  {
    id: "avatar_v2_bottom_male_navy_straight_pants",
    type: "bottom",
    name: "Navy Basic Straight Pants",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: {},
    ownedByDefault: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  {
    id: "avatar_v2_shoes_male_milk_tea_court",
    type: "shoes",
    name: "Milk Tea Court Sneakers",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.shoes,
    assets: {},
    ownedByDefault: true,
    compatibleBodyIds: ["avatar_v2_body_male_light"]
  },
  ...MALE_CAPSULE_AVATAR_ITEMS,
  ...MALE_PREMIUM_CAPSULE_AVATAR_ITEMS,
  ...FEMALE_SWEET_CAPSULE_AVATAR_ITEMS,
  {
    id: DEFAULT_AVATAR_V2.faceId,
    type: "face",
    name: "Soft Doll Face Foundation",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.face,
    assets: { idle_front: avatarV2LayerAssets.faceDefault },
    isDefault: true,
    ownedByDefault: true
  },
  {
    id: "avatar_v2_face_warm_peach_foundation",
    type: "face",
    name: "Warm Peach Face Foundation",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.face,
    assets: { idle_front: avatarV2LayerAssets.faceWarmPeachFoundation }
  },
  {
    id: "avatar_v2_face_rose_heart_foundation",
    type: "face",
    name: "Rose Heart Face Foundation",
    sortOrder: 30,
    layerOrder: AVATAR_V2_LAYER_ORDER.face,
    assets: { idle_front: avatarV2LayerAssets.faceRoseHeartFoundation }
  },
  {
    id: DEFAULT_AVATAR_V2.eyesId,
    type: "eyes",
    name: "Mocha Doe Eyes",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.eyes,
    assets: { idle_front: avatarV2LayerAssets.eyesMochaDoe },
    isDefault: true,
    ownedByDefault: true
  },
  {
    id: "avatar_v2_eyes_sage_glass",
    type: "eyes",
    name: "Sage Glass Eyes",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.eyes,
    assets: { idle_front: avatarV2LayerAssets.eyesSageGlass }
  },
  {
    id: "avatar_v2_eyes_twilight_plum",
    type: "eyes",
    name: "Twilight Plum Eyes",
    sortOrder: 30,
    layerOrder: AVATAR_V2_LAYER_ORDER.eyes,
    assets: { idle_front: avatarV2LayerAssets.eyesTwilightPlum }
  },
  {
    id: "avatar_v2_eyes_hazel_almond_doe",
    type: "eyes",
    name: "Hazel Almond Doe Eyes",
    sortOrder: 40,
    layerOrder: AVATAR_V2_LAYER_ORDER.eyes,
    assets: { idle_front: avatarV2LayerAssets.eyesHazelAlmondDoe }
  },
  {
    id: "avatar_v2_eyes_deep_brown_star",
    type: "eyes",
    name: "Deep Brown Star Eyes",
    sortOrder: 50,
    layerOrder: AVATAR_V2_LAYER_ORDER.eyes,
    assets: { idle_front: avatarV2LayerAssets.eyesDeepBrownStar }
  },
  {
    id: "avatar_v2_eyes_cocoa_puppy",
    type: "eyes",
    name: "Cocoa Puppy Eyes",
    sortOrder: 60,
    layerOrder: AVATAR_V2_LAYER_ORDER.eyes,
    assets: { idle_front: avatarV2LayerAssets.eyesCocoaPuppy }
  },
  {
    id: "avatar_v2_eyes_honey_amber",
    type: "eyes",
    name: "Honey Amber Eyes",
    sortOrder: 70,
    layerOrder: AVATAR_V2_LAYER_ORDER.eyes,
    assets: { idle_front: avatarV2LayerAssets.eyesHoneyAmber }
  },
  {
    id: "avatar_v2_eyes_chestnut_luminous",
    type: "eyes",
    name: "Luminous Chestnut Eyes",
    sortOrder: 80,
    layerOrder: AVATAR_V2_LAYER_ORDER.eyes,
    assets: { idle_front: avatarV2LayerAssets.eyesChestnutLuminous }
  },
  {
    id: DEFAULT_AVATAR_V2.noseId,
    type: "nose",
    name: "Soft Button Nose",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.nose,
    assets: { idle_front: avatarV2LayerAssets.noseSoftButton },
    isDefault: true,
    ownedByDefault: true
  },
  {
    id: "avatar_v2_nose_petal_curve",
    type: "nose",
    name: "Petal Curve Nose",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.nose,
    assets: { idle_front: avatarV2LayerAssets.nosePetalCurve }
  },
  {
    id: "avatar_v2_nose_gentle_bridge",
    type: "nose",
    name: "Gentle Bridge Nose",
    sortOrder: 30,
    layerOrder: AVATAR_V2_LAYER_ORDER.nose,
    assets: { idle_front: avatarV2LayerAssets.noseGentleBridge }
  },
  {
    id: "avatar_v2_nose_tiny_upturned",
    type: "nose",
    name: "Tiny Upturned Nose",
    sortOrder: 40,
    layerOrder: AVATAR_V2_LAYER_ORDER.nose,
    assets: { idle_front: avatarV2LayerAssets.noseTinyUpturned }
  },
  {
    id: "avatar_v2_nose_petite_rounded",
    type: "nose",
    name: "Petite Rounded Nose",
    sortOrder: 50,
    layerOrder: AVATAR_V2_LAYER_ORDER.nose,
    assets: { idle_front: avatarV2LayerAssets.nosePetiteRounded }
  },
  {
    id: "avatar_v2_nose_heart_tip",
    type: "nose",
    name: "Soft Heart-Tip Nose",
    sortOrder: 60,
    layerOrder: AVATAR_V2_LAYER_ORDER.nose,
    assets: { idle_front: avatarV2LayerAssets.noseHeartTip }
  },
  {
    id: "avatar_v2_nose_narrow_button",
    type: "nose",
    name: "Narrow Button Nose",
    sortOrder: 70,
    layerOrder: AVATAR_V2_LAYER_ORDER.nose,
    assets: { idle_front: avatarV2LayerAssets.noseNarrowButton }
  },
  {
    id: "avatar_v2_nose_sculpted_doll",
    type: "nose",
    name: "Sculpted Doll Nose",
    sortOrder: 80,
    layerOrder: AVATAR_V2_LAYER_ORDER.nose,
    assets: { idle_front: avatarV2LayerAssets.noseSculptedDoll }
  },
  {
    id: DEFAULT_AVATAR_V2.mouthId,
    type: "mouth",
    name: "Peach Whisper Smile",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.mouth,
    assets: { idle_front: avatarV2LayerAssets.mouthPeachWhisperSmile },
    isDefault: true,
    ownedByDefault: true
  },
  {
    id: "avatar_v2_mouth_rose_gloss_smile",
    type: "mouth",
    name: "Rose Gloss Smile",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.mouth,
    assets: { idle_front: avatarV2LayerAssets.mouthRoseGlossSmile }
  },
  {
    id: "avatar_v2_mouth_berry_soft_kiss",
    type: "mouth",
    name: "Berry Soft Kiss",
    sortOrder: 30,
    layerOrder: AVATAR_V2_LAYER_ORDER.mouth,
    assets: { idle_front: avatarV2LayerAssets.mouthBerrySoftKiss }
  },
  {
    id: "avatar_v2_mouth_coral_bow_smile",
    type: "mouth",
    name: "Coral Bow Smile",
    sortOrder: 40,
    layerOrder: AVATAR_V2_LAYER_ORDER.mouth,
    assets: { idle_front: avatarV2LayerAssets.mouthCoralBowSmile }
  },
  {
    id: "avatar_v2_mouth_nude_pink_whisper",
    type: "mouth",
    name: "Nude Pink Whisper",
    sortOrder: 50,
    layerOrder: AVATAR_V2_LAYER_ORDER.mouth,
    assets: { idle_front: avatarV2LayerAssets.mouthNudePinkWhisper }
  },
  {
    id: "avatar_v2_mouth_cherry_balm_smile",
    type: "mouth",
    name: "Cherry Balm Smile",
    sortOrder: 60,
    layerOrder: AVATAR_V2_LAYER_ORDER.mouth,
    assets: { idle_front: avatarV2LayerAssets.mouthCherryBalmSmile }
  },
  {
    id: "avatar_v2_mouth_soft_mauve_smile",
    type: "mouth",
    name: "Soft Mauve Smile",
    sortOrder: 70,
    layerOrder: AVATAR_V2_LAYER_ORDER.mouth,
    assets: { idle_front: avatarV2LayerAssets.mouthSoftMauveSmile }
  },
  {
    id: "avatar_v2_mouth_rosewater_cupid_bow",
    type: "mouth",
    name: "Rosewater Cupid Bow",
    sortOrder: 80,
    layerOrder: AVATAR_V2_LAYER_ORDER.mouth,
    assets: { idle_front: avatarV2LayerAssets.mouthRosewaterCupidBow }
  },
  {
    id: DEFAULT_AVATAR_V2.hairId,
    type: "hair",
    name: "Mocha Ribbon Blowout",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairMochaRibbonBlowout },
    isDefault: true,
    ownedByDefault: true
  },
  {
    id: "avatar_v2_hair_midnight_french_bob",
    type: "hair",
    name: "Midnight French Bob",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairMidnightFrenchBob },
    ownedByDefault: true
  },
  {
    id: "avatar_v2_hair_honey_halfup_waves",
    type: "hair",
    name: "Golden Blonde Half-Up Waves",
    sortOrder: 30,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairHoneyHalfupWaves }
  },
  {
    id: "avatar_v2_hair_cherry_ribbon_twin_braids",
    type: "hair",
    name: "Cherry Ribbon Twin Braids",
    sortOrder: 40,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairCherryRibbonTwinBraids }
  },
  {
    id: "avatar_v2_hair_rosewood_butterfly_layers",
    type: "hair",
    name: "Rosewood Butterfly Layers",
    sortOrder: 70,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairRosewoodButterflyLayers }
  },
  {
    id: "avatar_v2_hair_caramel_braided_crown",
    type: "hair",
    name: "Caramel Braided Crown",
    sortOrder: 80,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairCaramelBraidedCrown }
  },
  {
    id: "avatar_v2_hair_berry_velvet_soft_updo",
    type: "hair",
    name: "Berry Velvet Soft Updo",
    sortOrder: 90,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairBerryVelvetSoftUpdo }
  },
  {
    id: "avatar_v2_hair_chestnut_butterfly_bob",
    type: "hair",
    name: "Chestnut Butterfly Bob",
    sortOrder: 100,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairChestnutButterflyBob }
  },
  {
    id: "avatar_v2_hair_golden_waves",
    type: "hair",
    name: "Golden Waves",
    sortOrder: 110,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairGoldenWaves }
  },
  {
    id: "avatar_v2_hair_ink_pageboy_star",
    type: "hair",
    name: "Ink Pageboy Star",
    sortOrder: 120,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairInkPageboyStar }
  },
  {
    id: "avatar_v2_hair_ink_twin_braids",
    type: "hair",
    name: "Ink Twin Braids",
    sortOrder: 130,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairInkTwinBraids }
  },
  {
    id: "avatar_v2_hair_pale_golden_bow_bob",
    type: "hair",
    name: "Pale Golden Bow Bob",
    sortOrder: 140,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairPaleGoldenBowBob }
  },
  {
    id: "avatar_v2_hair_copper_bow_waves",
    type: "hair",
    name: "Copper Bow Waves",
    sortOrder: 150,
    layerOrder: AVATAR_V2_LAYER_ORDER.hair,
    assets: { idle_front: avatarV2LayerAssets.hairCopperBowWaves }
  },
  {
    id: DEFAULT_AVATAR_V2.topId,
    type: "top",
    name: "Basic Tee",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.topDefault },
    isDefault: true,
    ownedByDefault: true
  },
  {
    id: DEFAULT_AVATAR_V2.bottomId,
    type: "bottom",
    name: "Classic Shorts",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottomDefault },
    isDefault: true,
    ownedByDefault: true
  },
  {
    id: DEFAULT_AVATAR_V2.shoesId,
    type: "shoes",
    name: "Milk Tea Court Sneakers",
    sortOrder: 10,
    layerOrder: AVATAR_V2_LAYER_ORDER.shoes,
    assets: { idle_front: avatarV2LayerAssets.shoesMilkTeaCourtSneakers },
    isDefault: true,
    ownedByDefault: true
  },
  {
    id: "avatar_v2_shoes_cherry_satin_ballets",
    type: "shoes",
    name: "Cherry Satin Ballets",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.shoes,
    assets: { idle_front: avatarV2LayerAssets.shoesCherrySatinBallets }
  },
  {
    id: "avatar_v2_shoes_onyx_heart_mary_janes",
    type: "shoes",
    name: "Onyx Heart Mary Janes",
    sortOrder: 30,
    layerOrder: AVATAR_V2_LAYER_ORDER.shoes,
    assets: { idle_front: avatarV2LayerAssets.shoesOnyxHeartMaryJanes }
  },
  {
    id: "avatar_v2_shoes_rosewood_platform_loafers",
    type: "shoes",
    name: "Rosewood Platform Loafers",
    sortOrder: 40,
    layerOrder: AVATAR_V2_LAYER_ORDER.shoes,
    assets: { idle_front: avatarV2LayerAssets.shoesRosewoodPlatformLoafers }
  },
  {
    id: "avatar_v2_shoes_pearl_slingback_sandals",
    type: "shoes",
    name: "Pearl Slingback Sandals",
    sortOrder: 50,
    layerOrder: AVATAR_V2_LAYER_ORDER.shoes,
    assets: { idle_front: avatarV2LayerAssets.shoesPearlSlingbackSandals }
  },
  {
    id: "avatar_v2_accessory_ivory_ribbon_beret",
    type: "accessory",
    name: "Ivory Ribbon Beret",
    sortOrder: 20,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryIvoryRibbonBeret },
    accessoryGroup: "headwear",
    ownedByDefault: true
  },
  {
    id: "avatar_v2_accessory_cherry_bow_headband",
    type: "accessory",
    name: "Cherry Bow Headband",
    sortOrder: 30,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryCherryBowHeadband },
    accessoryGroup: "headwear"
  },
  {
    id: "avatar_v2_accessory_sage_heart_glasses",
    type: "accessory",
    name: "Sage Heart Glasses",
    sortOrder: 40,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessorySageHeartGlasses },
    accessoryGroup: "eyewear"
  },
  {
    id: "avatar_v2_accessory_rose_round_glasses",
    type: "accessory",
    name: "Rose Round Glasses",
    sortOrder: 41,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryRoseRoundGlasses },
    accessoryGroup: "eyewear"
  },
  {
    id: "avatar_v2_accessory_lavender_pearl_cat_eye_glasses",
    type: "accessory",
    name: "Lavender Pearl Cat-Eye Glasses",
    sortOrder: 42,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryLavenderPearlCatEyeGlasses },
    accessoryGroup: "eyewear"
  },
  {
    id: "avatar_v2_accessory_mint_star_oval_glasses",
    type: "accessory",
    name: "Mint Star Oval Glasses",
    sortOrder: 43,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryMintStarOvalGlasses },
    accessoryGroup: "eyewear"
  },
  {
    id: "avatar_v2_accessory_honey_blossom_square_glasses",
    type: "accessory",
    name: "Honey Blossom Square Glasses",
    sortOrder: 44,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryHoneyBlossomSquareGlasses },
    accessoryGroup: "eyewear"
  },
  {
    id: "avatar_v2_accessory_pearl_drop_earrings",
    type: "accessory",
    name: "Pearl Drop Earrings",
    sortOrder: 50,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryPearlDropEarrings },
    accessoryGroup: "earrings"
  },
  {
    id: "avatar_v2_accessory_golden_heart_locket",
    type: "accessory",
    name: "Golden Heart Locket",
    sortOrder: 60,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryGoldenHeartLocket },
    accessoryGroup: "neck"
  },
  {
    id: "avatar_v2_accessory_buttercream_neck_scarf",
    type: "accessory",
    name: "Buttercream Neck Scarf",
    sortOrder: 70,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryButtercreamNeckScarf },
    accessoryGroup: "neck"
  },
  {
    id: "avatar_v2_accessory_cherry_micro_bag",
    type: "accessory",
    name: "Cherry Micro Bag",
    sortOrder: 80,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessoryCherryMicroBag },
    accessoryGroup: "bag"
  },
  {
    id: "avatar_v2_accessory_sunny_star_clips",
    type: "accessory",
    name: "Sunny Star Clips",
    sortOrder: 90,
    layerOrder: AVATAR_V2_LAYER_ORDER.accessory,
    assets: { idle_front: avatarV2LayerAssets.accessorySunnyStarClips },
    accessoryGroup: "hairClip"
  },
  {
    id: "avatar_v2_top_blush_lace_cardigan",
    type: "top",
    name: "Blush Lace Cardigan",
    sortOrder: 25,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.topBlushLaceCardigan }
  },
  {
    id: "avatar_v2_top_sage_ribbon_knit_jacket",
    type: "top",
    name: "Sage Ribbon Knit Jacket",
    sortOrder: 26,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.topSageRibbonKnitJacket }
  },
  {
    id: "avatar_v2_top_cherry_heart_milkmaid_blouse",
    type: "top",
    name: "Cherry Heart Milkmaid Blouse",
    sortOrder: 27,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.topCherryHeartMilkmaidBlouse },
    hiddenFromShop: true,
    hiddenFromWardrobe: true
  },
  {
    id: "avatar_v2_top_powder_blue_ribbon_corset_top",
    type: "top",
    name: "Powder Blue Ribbon Corset Top",
    sortOrder: 28,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.topPowderBlueRibbonCorsetTop }
  },
  {
    id: "avatar_v2_top_noir_rose_heart_cardigan",
    type: "top",
    name: "Noir Rose Heart Cardigan",
    sortOrder: 29,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.topNoirRoseHeartCardigan }
  },
  {
    id: "avatar_v2_bottom_striped_crochet_shorts",
    type: "bottom",
    name: "Striped Crochet Shorts",
    sortOrder: 72,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 }
  },
  {
    id: "avatar_v2_bottom_layered_lace_ruffle_mini_skirt",
    type: "bottom",
    name: "Layered Lace Ruffle Mini Skirt",
    sortOrder: 74,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 }
  },
  {
    id: "avatar_v2_bottom_black_palm_embellished_pants",
    type: "bottom",
    name: "Black Palm Pants",
    sortOrder: 76,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 }
  },
  {
    id: "avatar_v2_bottom_coral_embellished_laceup_pants",
    type: "bottom",
    name: "Coral Lace-Up Pants",
    sortOrder: 78,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 }
  },
  {
    id: "avatar_v2_bottom_smoky_floral_mesh_pants",
    type: "bottom",
    name: "Smoky Floral Mesh Pants",
    sortOrder: 79,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 }
  },
  {
    id: "avatar_v2_bottom_yellow_bow_lace_ruffle_skirt",
    type: "bottom",
    name: "Yellow Bow Lace Ruffle Skirt",
    sortOrder: 81,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 }
  },
  {
    id: "avatar_v2_top_boho_patchwork_maxi_dress",
    type: "top",
    name: "Boho Patchwork Maxi Dress",
    sortOrder: 70,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.top01 },
    outfitKey: "boho_patchwork_maxi_dress",
    pairedItemId: "avatar_v2_bottom_boho_patchwork_maxi_dress"
  },
  {
    id: "avatar_v2_bottom_boho_patchwork_maxi_dress",
    type: "bottom",
    name: "Boho Maxi Dress Bottom",
    sortOrder: 80,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 },
    outfitKey: "boho_patchwork_maxi_dress",
    hiddenFromShop: true,
    hiddenFromWardrobe: true
  },
  {
    id: "avatar_v2_top_embroidered_halter_wrap_dress",
    type: "top",
    name: "Embroidered Halter Wrap Dress",
    sortOrder: 80,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.top01 },
    outfitKey: "embroidered_halter_wrap_dress",
    pairedItemId: "avatar_v2_bottom_embroidered_halter_wrap_dress"
  },
  {
    id: "avatar_v2_bottom_embroidered_halter_wrap_dress",
    type: "bottom",
    name: "Embroidered Wrap Bottom",
    sortOrder: 90,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 },
    outfitKey: "embroidered_halter_wrap_dress",
    hiddenFromShop: true,
    hiddenFromWardrobe: true
  },
  {
    id: "avatar_v2_top_ruched_patchwork_mini_dress",
    type: "top",
    name: "Ruched Patchwork Mini Dress",
    sortOrder: 90,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.top01 },
    outfitKey: "ruched_patchwork_mini_dress",
    pairedItemId: "avatar_v2_bottom_ruched_patchwork_mini_dress"
  },
  {
    id: "avatar_v2_bottom_ruched_patchwork_mini_dress",
    type: "bottom",
    name: "Ruched Mini Bottom",
    sortOrder: 100,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 },
    outfitKey: "ruched_patchwork_mini_dress",
    hiddenFromShop: true,
    hiddenFromWardrobe: true
  },
  {
    id: "avatar_v2_top_white_lace_cami_mini_dress",
    type: "top",
    name: "White Lace Cami Mini Dress",
    sortOrder: 100,
    layerOrder: AVATAR_V2_LAYER_ORDER.top,
    assets: { idle_front: avatarV2LayerAssets.top01 },
    outfitKey: "white_lace_cami_mini_dress",
    pairedItemId: "avatar_v2_bottom_white_lace_cami_mini_dress"
  },
  {
    id: "avatar_v2_bottom_white_lace_cami_mini_dress",
    type: "bottom",
    name: "White Lace Mini Bottom",
    sortOrder: 110,
    layerOrder: AVATAR_V2_LAYER_ORDER.bottom,
    assets: { idle_front: avatarV2LayerAssets.bottom01 },
    outfitKey: "white_lace_cami_mini_dress",
    hiddenFromShop: true,
    hiddenFromWardrobe: true
  },
]

export const AVATAR_V2_CATALOG: AvatarCatalogItem[] =
  AVATAR_V2_CATALOG_SOURCE.map((item) =>
    AVATAR_STUDIO_FREE_ITEM_TYPES.has(item.type)
      ? { ...item, ownedByDefault: true }
      : item
  )

export const AVATAR_V2_INVENTORY: AvatarInventory = {
  ownedItemIds: AVATAR_V2_CATALOG
    .filter((item) => item.ownedByDefault)
    .map((item) => item.id)
}
