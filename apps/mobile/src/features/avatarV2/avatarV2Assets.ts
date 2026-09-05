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
    require("./assets/layers/avatar_face_soft_doll_foundation.png")
  ),
  faceWarmPeachFoundation: layerAsset(
    "avatar_face_warm_peach_foundation",
    require("./assets/layers/avatar_face_warm_peach_foundation.png")
  ),
  faceRoseHeartFoundation: layerAsset(
    "avatar_face_rose_heart_foundation",
    require("./assets/layers/avatar_face_rose_heart_foundation.png")
  ),
  hairDefault: layerAsset(
    "avatar_hair_mocha_ribbon_blowout",
    require("./assets/layers/avatar_hair_mocha_ribbon_blowout.png")
  ),
  hair01: layerAsset(
    "avatar_hair_01",
    require("./assets/layers/avatar_hair_01.png")
  ),
  hairMochaRibbonBlowout: layerAsset(
    "avatar_hair_mocha_ribbon_blowout",
    require("./assets/layers/avatar_hair_mocha_ribbon_blowout.png")
  ),
  hairMidnightFrenchBob: layerAsset(
    "avatar_hair_midnight_french_bob",
    require("./assets/layers/avatar_hair_midnight_french_bob.png")
  ),
  hairHoneyHalfupWaves: layerAsset(
    "avatar_hair_honey_halfup_waves",
    require("./assets/layers/avatar_hair_honey_halfup_waves.png")
  ),
  hairCherryRibbonTwinBraids: layerAsset(
    "avatar_hair_cherry_ribbon_twin_braids",
    require("./assets/layers/avatar_hair_cherry_ribbon_twin_braids.png")
  ),
  hairCocoaCloudPonytail: layerAsset(
    "avatar_hair_cocoa_cloud_ponytail",
    require("./assets/layers/avatar_hair_cocoa_cloud_ponytail.png")
  ),
  hairEspressoSleekRibbonPony: layerAsset(
    "avatar_hair_espresso_sleek_ribbon_pony",
    require("./assets/layers/avatar_hair_espresso_sleek_ribbon_pony.png")
  ),
  hairRosewoodButterflyLayers: layerAsset(
    "avatar_hair_rosewood_butterfly_layers",
    require("./assets/layers/avatar_hair_rosewood_butterfly_layers.png")
  ),
  hairCaramelBraidedCrown: layerAsset(
    "avatar_hair_caramel_braided_crown",
    require("./assets/layers/avatar_hair_caramel_braided_crown.png")
  ),
  hairBerryVelvetSoftUpdo: layerAsset(
    "avatar_hair_berry_velvet_soft_updo",
    require("./assets/layers/avatar_hair_berry_velvet_soft_updo.png")
  ),
  hairChestnutButterflyBob: layerAsset(
    "avatar_hair_chestnut_butterfly_bob",
    require("./assets/layers/avatar_hair_chestnut_butterfly_bob.png")
  ),
  hairGoldenWaves: layerAsset(
    "avatar_hair_golden_waves",
    require("./assets/layers/avatar_hair_golden_waves.png")
  ),
  hairInkPageboyStar: layerAsset(
    "avatar_hair_ink_pageboy_star",
    require("./assets/layers/avatar_hair_ink_pageboy_star.png")
  ),
  hairInkTwinBraids: layerAsset(
    "avatar_hair_ink_twin_braids",
    require("./assets/layers/avatar_hair_ink_twin_braids.png")
  ),
  hairPaleGoldenBowBob: layerAsset(
    "avatar_hair_pale_golden_bow_bob",
    require("./assets/layers/avatar_hair_pale_golden_bow_bob.png")
  ),
  hairCopperBowWaves: layerAsset(
    "avatar_hair_copper_bow_waves",
    require("./assets/layers/avatar_hair_copper_bow_waves.png")
  ),
  eyesMochaDoe: layerAsset(
    "avatar_eyes_mocha_doe",
    require("./assets/layers/avatar_eyes_mocha_doe.png")
  ),
  eyesSageGlass: layerAsset(
    "avatar_eyes_sage_glass",
    require("./assets/layers/avatar_eyes_sage_glass.png")
  ),
  eyesTwilightPlum: layerAsset(
    "avatar_eyes_twilight_plum",
    require("./assets/layers/avatar_eyes_twilight_plum.png")
  ),
  eyesHazelAlmondDoe: layerAsset(
    "avatar_eyes_hazel_almond_doe",
    require("./assets/layers/avatar_eyes_hazel_almond_doe.png")
  ),
  eyesDeepBrownStar: layerAsset(
    "avatar_eyes_deep_brown_star",
    require("./assets/layers/avatar_eyes_deep_brown_star.png")
  ),
  eyesCocoaPuppy: layerAsset(
    "avatar_eyes_cocoa_puppy",
    require("./assets/layers/avatar_eyes_cocoa_puppy.png")
  ),
  eyesHoneyAmber: layerAsset(
    "avatar_eyes_honey_amber",
    require("./assets/layers/avatar_eyes_honey_amber.png")
  ),
  eyesChestnutLuminous: layerAsset(
    "avatar_eyes_chestnut_luminous",
    require("./assets/layers/avatar_eyes_chestnut_luminous.png")
  ),
  noseSoftButton: layerAsset(
    "avatar_nose_soft_button",
    require("./assets/layers/avatar_nose_soft_button.png")
  ),
  nosePetalCurve: layerAsset(
    "avatar_nose_petal_curve",
    require("./assets/layers/avatar_nose_petal_curve.png")
  ),
  noseGentleBridge: layerAsset(
    "avatar_nose_gentle_bridge",
    require("./assets/layers/avatar_nose_gentle_bridge.png")
  ),
  noseTinyUpturned: layerAsset(
    "avatar_nose_tiny_upturned",
    require("./assets/layers/avatar_nose_tiny_upturned.png")
  ),
  nosePetiteRounded: layerAsset(
    "avatar_nose_petite_rounded",
    require("./assets/layers/avatar_nose_petite_rounded.png")
  ),
  noseHeartTip: layerAsset(
    "avatar_nose_heart_tip",
    require("./assets/layers/avatar_nose_heart_tip.png")
  ),
  noseNarrowButton: layerAsset(
    "avatar_nose_narrow_button",
    require("./assets/layers/avatar_nose_narrow_button.png")
  ),
  noseSculptedDoll: layerAsset(
    "avatar_nose_sculpted_doll",
    require("./assets/layers/avatar_nose_sculpted_doll.png")
  ),
  mouthPeachWhisperSmile: layerAsset(
    "avatar_mouth_peach_whisper_smile",
    require("./assets/layers/avatar_mouth_peach_whisper_smile.png")
  ),
  mouthRoseGlossSmile: layerAsset(
    "avatar_mouth_rose_gloss_smile",
    require("./assets/layers/avatar_mouth_rose_gloss_smile.png")
  ),
  mouthBerrySoftKiss: layerAsset(
    "avatar_mouth_berry_soft_kiss",
    require("./assets/layers/avatar_mouth_berry_soft_kiss.png")
  ),
  mouthCoralBowSmile: layerAsset(
    "avatar_mouth_coral_bow_smile",
    require("./assets/layers/avatar_mouth_coral_bow_smile.png")
  ),
  mouthNudePinkWhisper: layerAsset(
    "avatar_mouth_nude_pink_whisper",
    require("./assets/layers/avatar_mouth_nude_pink_whisper.png")
  ),
  mouthCherryBalmSmile: layerAsset(
    "avatar_mouth_cherry_balm_smile",
    require("./assets/layers/avatar_mouth_cherry_balm_smile.png")
  ),
  mouthSoftMauveSmile: layerAsset(
    "avatar_mouth_soft_mauve_smile",
    require("./assets/layers/avatar_mouth_soft_mauve_smile.png")
  ),
  mouthRosewaterCupidBow: layerAsset(
    "avatar_mouth_rosewater_cupid_bow",
    require("./assets/layers/avatar_mouth_rosewater_cupid_bow.png")
  ),
  topDefault: layerAsset(
    "avatar_top_default",
    require("./assets/layers/avatar_top_default.png")
  ),
  topBlushLaceCardigan: layerAsset(
    "avatar_top_blush_lace_cardigan",
    require("./assets/layers/avatar_top_blush_lace_cardigan.png")
  ),
  topSageRibbonKnitJacket: layerAsset(
    "avatar_top_sage_ribbon_knit_jacket",
    require("./assets/layers/avatar_top_sage_ribbon_knit_jacket.png")
  ),
  topCherryHeartMilkmaidBlouse: layerAsset(
    "avatar_top_cherry_heart_milkmaid_blouse",
    require("./assets/layers/avatar_top_cherry_heart_milkmaid_blouse.png")
  ),
  topPowderBlueRibbonCorsetTop: layerAsset(
    "avatar_top_powder_blue_ribbon_corset_top",
    require("./assets/layers/avatar_top_powder_blue_ribbon_corset_top.png")
  ),
  topNoirRoseHeartCardigan: layerAsset(
    "avatar_top_noir_rose_heart_cardigan",
    require("./assets/layers/avatar_top_noir_rose_heart_cardigan.png")
  ),
  top01: layerAsset(
    "avatar_top_01",
    require("./assets/layers/avatar_top_01.png")
  ),
  bottomDefault: layerAsset(
    "avatar_bottom_default",
    require("./assets/layers/avatar_bottom_default.png")
  ),
  bottom01: layerAsset(
    "avatar_bottom_01",
    require("./assets/layers/avatar_bottom_01.png")
  ),
  shoesDefault: layerAsset(
    "avatar_shoes_milk_tea_court_sneakers",
    require("./assets/layers/avatar_shoes_milk_tea_court_sneakers.png")
  ),
  shoes01: layerAsset(
    "avatar_shoes_01",
    require("./assets/layers/avatar_shoes_01.png")
  ),
  shoesMilkTeaCourtSneakers: layerAsset(
    "avatar_shoes_milk_tea_court_sneakers",
    require("./assets/layers/avatar_shoes_milk_tea_court_sneakers.png")
  ),
  shoesCherrySatinBallets: layerAsset(
    "avatar_shoes_cherry_satin_ballets",
    require("./assets/layers/avatar_shoes_cherry_satin_ballets.png")
  ),
  shoesOnyxHeartMaryJanes: layerAsset(
    "avatar_shoes_onyx_heart_mary_janes",
    require("./assets/layers/avatar_shoes_onyx_heart_mary_janes.png")
  ),
  shoesRosewoodPlatformLoafers: layerAsset(
    "avatar_shoes_rosewood_platform_loafers",
    require("./assets/layers/avatar_shoes_rosewood_platform_loafers.png")
  ),
  shoesPearlSlingbackSandals: layerAsset(
    "avatar_shoes_pearl_slingback_sandals",
    require("./assets/layers/avatar_shoes_pearl_slingback_sandals.png")
  ),
  accessory01: layerAsset(
    "avatar_accessory_01",
    require("./assets/layers/avatar_accessory_01.png")
  ),
  accessoryIvoryRibbonBeret: layerAsset(
    "avatar_accessory_ivory_ribbon_beret",
    require("./assets/layers/avatar_accessory_ivory_ribbon_beret.png")
  ),
  accessoryCherryBowHeadband: layerAsset(
    "avatar_accessory_cherry_bow_headband",
    require("./assets/layers/avatar_accessory_cherry_bow_headband.png")
  ),
  accessorySageHeartGlasses: layerAsset(
    "avatar_accessory_sage_heart_glasses",
    require("./assets/layers/avatar_accessory_sage_heart_glasses.png")
  ),
  accessoryRoseRoundGlasses: layerAsset(
    "avatar_accessory_rose_round_glasses",
    require("./assets/layers/avatar_accessory_rose_round_glasses.png")
  ),
  accessoryLavenderPearlCatEyeGlasses: layerAsset(
    "avatar_accessory_lavender_pearl_cat_eye_glasses",
    require("./assets/layers/avatar_accessory_lavender_pearl_cat_eye_glasses.png")
  ),
  accessoryMintStarOvalGlasses: layerAsset(
    "avatar_accessory_mint_star_oval_glasses",
    require("./assets/layers/avatar_accessory_mint_star_oval_glasses.png")
  ),
  accessoryHoneyBlossomSquareGlasses: layerAsset(
    "avatar_accessory_honey_blossom_square_glasses",
    require("./assets/layers/avatar_accessory_honey_blossom_square_glasses.png")
  ),
  accessoryPearlDropEarrings: layerAsset(
    "avatar_accessory_pearl_drop_earrings",
    require("./assets/layers/avatar_accessory_pearl_drop_earrings.png")
  ),
  accessoryGoldenHeartLocket: layerAsset(
    "avatar_accessory_golden_heart_locket",
    require("./assets/layers/avatar_accessory_golden_heart_locket.png")
  ),
  accessoryButtercreamNeckScarf: layerAsset(
    "avatar_accessory_buttercream_neck_scarf",
    require("./assets/layers/avatar_accessory_buttercream_neck_scarf.png")
  ),
  accessoryCherryMicroBag: layerAsset(
    "avatar_accessory_cherry_micro_bag",
    require("./assets/layers/avatar_accessory_cherry_micro_bag.png")
  ),
  accessorySunnyStarClips: layerAsset(
    "avatar_accessory_sunny_star_clips",
    require("./assets/layers/avatar_accessory_sunny_star_clips.png")
  )
} as const
