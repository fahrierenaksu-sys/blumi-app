import { RETIRED_AVATAR_ART } from "./retiredAvatarArt"
import type { AvatarLayerAssetRef } from "./avatarV2.types"
import { femaleSweetCapsuleProfileLayerAssets } from "./femaleSweetCapsuleProfileAssets"

// Asset contract: every avatar layer must be a 512x768 RGBA transparent PNG
// with the same canvas, character centerline, and feet baseline. Avoid per-item
// offset hacks; future animation states should reuse this alignment contract.
const layerAsset = (
  key: string,
  source: AvatarLayerAssetRef["source"]
): AvatarLayerAssetRef => ({
  key,
  source
})

export const avatarV2LayerAssets = {
  ...femaleSweetCapsuleProfileLayerAssets,
  faceDefault: layerAsset(
    "avatar_face_soft_doll_foundation",
    RETIRED_AVATAR_ART
  ),
  faceWarmPeachFoundation: layerAsset(
    "avatar_face_warm_peach_foundation",
    RETIRED_AVATAR_ART
  ),
  faceRoseHeartFoundation: layerAsset(
    "avatar_face_rose_heart_foundation",
    RETIRED_AVATAR_ART
  ),
  hairDefault: layerAsset(
    "avatar_hair_mocha_ribbon_blowout",
    RETIRED_AVATAR_ART
  ),
  hair01: layerAsset(
    "avatar_hair_01",
    RETIRED_AVATAR_ART
  ),
  hairMochaRibbonBlowout: layerAsset(
    "avatar_hair_mocha_ribbon_blowout",
    RETIRED_AVATAR_ART
  ),
  hairMidnightFrenchBob: layerAsset(
    "avatar_hair_midnight_french_bob",
    RETIRED_AVATAR_ART
  ),
  hairHoneyHalfupWaves: layerAsset(
    "avatar_hair_honey_halfup_waves",
    RETIRED_AVATAR_ART
  ),
  hairCherryRibbonTwinBraids: layerAsset(
    "avatar_hair_cherry_ribbon_twin_braids",
    RETIRED_AVATAR_ART
  ),
  hairCocoaCloudPonytail: layerAsset(
    "avatar_hair_cocoa_cloud_ponytail",
    RETIRED_AVATAR_ART
  ),
  hairEspressoSleekRibbonPony: layerAsset(
    "avatar_hair_espresso_sleek_ribbon_pony",
    RETIRED_AVATAR_ART
  ),
  hairRosewoodButterflyLayers: layerAsset(
    "avatar_hair_rosewood_butterfly_layers",
    RETIRED_AVATAR_ART
  ),
  hairCaramelBraidedCrown: layerAsset(
    "avatar_hair_caramel_braided_crown",
    RETIRED_AVATAR_ART
  ),
  hairBerryVelvetSoftUpdo: layerAsset(
    "avatar_hair_berry_velvet_soft_updo",
    RETIRED_AVATAR_ART
  ),
  hairChestnutButterflyBob: layerAsset(
    "avatar_hair_chestnut_butterfly_bob",
    RETIRED_AVATAR_ART
  ),
  hairGoldenWaves: layerAsset(
    "avatar_hair_golden_waves",
    RETIRED_AVATAR_ART
  ),
  hairInkPageboyStar: layerAsset(
    "avatar_hair_ink_pageboy_star",
    RETIRED_AVATAR_ART
  ),
  hairInkTwinBraids: layerAsset(
    "avatar_hair_ink_twin_braids",
    RETIRED_AVATAR_ART
  ),
  hairPaleGoldenBowBob: layerAsset(
    "avatar_hair_pale_golden_bow_bob",
    RETIRED_AVATAR_ART
  ),
  hairCopperBowWaves: layerAsset(
    "avatar_hair_copper_bow_waves",
    RETIRED_AVATAR_ART
  ),
  eyesMochaDoe: layerAsset(
    "avatar_eyes_mocha_doe",
    RETIRED_AVATAR_ART
  ),
  eyesSageGlass: layerAsset(
    "avatar_eyes_sage_glass",
    RETIRED_AVATAR_ART
  ),
  eyesTwilightPlum: layerAsset(
    "avatar_eyes_twilight_plum",
    RETIRED_AVATAR_ART
  ),
  eyesHazelAlmondDoe: layerAsset(
    "avatar_eyes_hazel_almond_doe",
    RETIRED_AVATAR_ART
  ),
  eyesDeepBrownStar: layerAsset(
    "avatar_eyes_deep_brown_star",
    RETIRED_AVATAR_ART
  ),
  eyesCocoaPuppy: layerAsset(
    "avatar_eyes_cocoa_puppy",
    RETIRED_AVATAR_ART
  ),
  eyesHoneyAmber: layerAsset(
    "avatar_eyes_honey_amber",
    RETIRED_AVATAR_ART
  ),
  eyesChestnutLuminous: layerAsset(
    "avatar_eyes_chestnut_luminous",
    RETIRED_AVATAR_ART
  ),
  noseSoftButton: layerAsset(
    "avatar_nose_soft_button",
    RETIRED_AVATAR_ART
  ),
  nosePetalCurve: layerAsset(
    "avatar_nose_petal_curve",
    RETIRED_AVATAR_ART
  ),
  noseGentleBridge: layerAsset(
    "avatar_nose_gentle_bridge",
    RETIRED_AVATAR_ART
  ),
  noseTinyUpturned: layerAsset(
    "avatar_nose_tiny_upturned",
    RETIRED_AVATAR_ART
  ),
  nosePetiteRounded: layerAsset(
    "avatar_nose_petite_rounded",
    RETIRED_AVATAR_ART
  ),
  noseHeartTip: layerAsset(
    "avatar_nose_heart_tip",
    RETIRED_AVATAR_ART
  ),
  noseNarrowButton: layerAsset(
    "avatar_nose_narrow_button",
    RETIRED_AVATAR_ART
  ),
  noseSculptedDoll: layerAsset(
    "avatar_nose_sculpted_doll",
    RETIRED_AVATAR_ART
  ),
  mouthPeachWhisperSmile: layerAsset(
    "avatar_mouth_peach_whisper_smile",
    RETIRED_AVATAR_ART
  ),
  mouthRoseGlossSmile: layerAsset(
    "avatar_mouth_rose_gloss_smile",
    RETIRED_AVATAR_ART
  ),
  mouthBerrySoftKiss: layerAsset(
    "avatar_mouth_berry_soft_kiss",
    RETIRED_AVATAR_ART
  ),
  mouthCoralBowSmile: layerAsset(
    "avatar_mouth_coral_bow_smile",
    RETIRED_AVATAR_ART
  ),
  mouthNudePinkWhisper: layerAsset(
    "avatar_mouth_nude_pink_whisper",
    RETIRED_AVATAR_ART
  ),
  mouthCherryBalmSmile: layerAsset(
    "avatar_mouth_cherry_balm_smile",
    RETIRED_AVATAR_ART
  ),
  mouthSoftMauveSmile: layerAsset(
    "avatar_mouth_soft_mauve_smile",
    RETIRED_AVATAR_ART
  ),
  mouthRosewaterCupidBow: layerAsset(
    "avatar_mouth_rosewater_cupid_bow",
    RETIRED_AVATAR_ART
  ),
  topDefault: layerAsset(
    "avatar_top_default",
    RETIRED_AVATAR_ART
  ),
  topBlushLaceCardigan: layerAsset(
    "avatar_top_blush_lace_cardigan",
    RETIRED_AVATAR_ART
  ),
  topSageRibbonKnitJacket: layerAsset(
    "avatar_top_sage_ribbon_knit_jacket",
    RETIRED_AVATAR_ART
  ),
  topCherryHeartMilkmaidBlouse: layerAsset(
    "avatar_top_cherry_heart_milkmaid_blouse",
    RETIRED_AVATAR_ART
  ),
  topPowderBlueRibbonCorsetTop: layerAsset(
    "avatar_top_powder_blue_ribbon_corset_top",
    RETIRED_AVATAR_ART
  ),
  topNoirRoseHeartCardigan: layerAsset(
    "avatar_top_noir_rose_heart_cardigan",
    RETIRED_AVATAR_ART
  ),
  top01: layerAsset(
    "avatar_top_01",
    RETIRED_AVATAR_ART
  ),
  bottomDefault: layerAsset(
    "avatar_bottom_default",
    RETIRED_AVATAR_ART
  ),
  bottom01: layerAsset(
    "avatar_bottom_01",
    RETIRED_AVATAR_ART
  ),
  shoesDefault: layerAsset(
    "avatar_shoes_milk_tea_court_sneakers",
    RETIRED_AVATAR_ART
  ),
  shoes01: layerAsset(
    "avatar_shoes_01",
    RETIRED_AVATAR_ART
  ),
  shoesMilkTeaCourtSneakers: layerAsset(
    "avatar_shoes_milk_tea_court_sneakers",
    RETIRED_AVATAR_ART
  ),
  shoesCherrySatinBallets: layerAsset(
    "avatar_shoes_cherry_satin_ballets",
    RETIRED_AVATAR_ART
  ),
  shoesOnyxHeartMaryJanes: layerAsset(
    "avatar_shoes_onyx_heart_mary_janes",
    RETIRED_AVATAR_ART
  ),
  shoesRosewoodPlatformLoafers: layerAsset(
    "avatar_shoes_rosewood_platform_loafers",
    RETIRED_AVATAR_ART
  ),
  shoesPearlSlingbackSandals: layerAsset(
    "avatar_shoes_pearl_slingback_sandals",
    RETIRED_AVATAR_ART
  ),
  accessory01: layerAsset(
    "avatar_accessory_01",
    RETIRED_AVATAR_ART
  ),
  accessoryIvoryRibbonBeret: layerAsset(
    "avatar_accessory_ivory_ribbon_beret",
    RETIRED_AVATAR_ART
  ),
  accessoryCherryBowHeadband: layerAsset(
    "avatar_accessory_cherry_bow_headband",
    RETIRED_AVATAR_ART
  ),
  accessorySageHeartGlasses: layerAsset(
    "avatar_accessory_sage_heart_glasses",
    RETIRED_AVATAR_ART
  ),
  accessoryRoseRoundGlasses: layerAsset(
    "avatar_accessory_rose_round_glasses",
    RETIRED_AVATAR_ART
  ),
  accessoryLavenderPearlCatEyeGlasses: layerAsset(
    "avatar_accessory_lavender_pearl_cat_eye_glasses",
    RETIRED_AVATAR_ART
  ),
  accessoryMintStarOvalGlasses: layerAsset(
    "avatar_accessory_mint_star_oval_glasses",
    RETIRED_AVATAR_ART
  ),
  accessoryHoneyBlossomSquareGlasses: layerAsset(
    "avatar_accessory_honey_blossom_square_glasses",
    RETIRED_AVATAR_ART
  ),
  accessoryPearlDropEarrings: layerAsset(
    "avatar_accessory_pearl_drop_earrings",
    RETIRED_AVATAR_ART
  ),
  accessoryGoldenHeartLocket: layerAsset(
    "avatar_accessory_golden_heart_locket",
    RETIRED_AVATAR_ART
  ),
  accessoryButtercreamNeckScarf: layerAsset(
    "avatar_accessory_buttercream_neck_scarf",
    RETIRED_AVATAR_ART
  ),
  accessoryCherryMicroBag: layerAsset(
    "avatar_accessory_cherry_micro_bag",
    RETIRED_AVATAR_ART
  ),
  accessorySunnyStarClips: layerAsset(
    "avatar_accessory_sunny_star_clips",
    RETIRED_AVATAR_ART
  )
} as const
