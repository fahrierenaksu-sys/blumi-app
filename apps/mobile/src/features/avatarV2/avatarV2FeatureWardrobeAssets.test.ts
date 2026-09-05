import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import type { UserAvatar } from "./avatarV2.types"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2 } = require("./avatarV2.mock") as typeof import("./avatarV2.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { equipAvatarV2Item, resolveAvatarV2 } = require("./avatarV2Selectors") as typeof import("./avatarV2Selectors")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { ROOM_AVATAR_CATALOG } = require("./room/avatarRoom.mock") as typeof import("./room/avatarRoom.mock")

const workspaceRoot = process.cwd()
const assetRoot = join(workspaceRoot, "src/features/avatarV2/assets")

const features = [
  ["avatar_v2_face_default", ["room_avatar_face_female_soft_doll_foundation_v2"], ["avatar_face_soft_doll_foundation.png"], ["avatar_room_face_female_soft_doll_foundation_v2.png"], ["room_avatar_face_female_soft_doll_foundation_v2"], null],
  ["avatar_v2_face_warm_peach_foundation", ["room_avatar_face_female_warm_peach_foundation_v2"], ["avatar_face_warm_peach_foundation.png"], ["avatar_room_face_female_warm_peach_foundation_v2.png"], ["room_avatar_face_female_warm_peach_foundation_v2"], "avatar_v2_face_warm_peach_foundation.png"],
  ["avatar_v2_face_rose_heart_foundation", ["room_avatar_face_female_rose_heart_foundation_v2"], ["avatar_face_rose_heart_foundation.png"], ["avatar_room_face_female_rose_heart_foundation_v2.png"], ["room_avatar_face_female_rose_heart_foundation_v2"], "avatar_v2_face_rose_heart_foundation.png"],
  ["avatar_v2_hair_mocha_ribbon_blowout", ["room_avatar_hair_back_female_mocha_ribbon_blowout_v2", "room_avatar_hair_front_female_mocha_ribbon_blowout_v2"], ["avatar_hair_mocha_ribbon_blowout.png"], ["avatar_room_hair_back_female_mocha_ribbon_blowout_v2.png", "avatar_room_hair_front_female_mocha_ribbon_blowout_v2.png"], ["room_avatar_hair_back_female_mocha_ribbon_blowout_v2", "room_avatar_hair_front_female_mocha_ribbon_blowout_v2"], "avatar_v2_hair_mocha_ribbon_blowout.png"],
  ["avatar_v2_hair_midnight_french_bob", ["room_avatar_hair_back_female_midnight_french_bob_v2", "room_avatar_hair_front_female_midnight_french_bob_v2"], ["avatar_hair_midnight_french_bob.png"], ["avatar_room_hair_back_female_midnight_french_bob_v2.png", "avatar_room_hair_front_female_midnight_french_bob_v2.png"], ["room_avatar_hair_back_female_midnight_french_bob_v2", "room_avatar_hair_front_female_midnight_french_bob_v2"], "avatar_v2_hair_midnight_french_bob.png"],
  ["avatar_v2_hair_honey_halfup_waves", ["room_avatar_hair_back_female_honey_halfup_waves_v2", "room_avatar_hair_front_female_honey_halfup_waves_v2"], ["avatar_hair_honey_halfup_waves.png"], ["avatar_room_hair_back_female_honey_halfup_waves_v2.png", "avatar_room_hair_front_female_honey_halfup_waves_v2.png"], ["room_avatar_hair_back_female_honey_halfup_waves_v2", "room_avatar_hair_front_female_honey_halfup_waves_v2"], "avatar_v2_hair_honey_halfup_waves.png"],
  ["avatar_v2_hair_cherry_ribbon_twin_braids", ["room_avatar_hair_back_female_cherry_ribbon_twin_braids_v2", "room_avatar_hair_front_female_cherry_ribbon_twin_braids_v2"], ["avatar_hair_cherry_ribbon_twin_braids.png"], ["avatar_room_hair_back_female_cherry_ribbon_twin_braids_v2.png", "avatar_room_hair_front_female_cherry_ribbon_twin_braids_v2.png"], null, "avatar_v2_hair_cherry_ribbon_twin_braids.png"],
  ["avatar_v2_hair_rosewood_butterfly_layers", ["room_avatar_hair_back_female_rosewood_butterfly_layers_v2", "room_avatar_hair_front_female_rosewood_butterfly_layers_v2"], ["avatar_hair_rosewood_butterfly_layers.png"], ["avatar_room_hair_back_female_rosewood_butterfly_layers_v2.png", "avatar_room_hair_front_female_rosewood_butterfly_layers_v2.png"], null, "avatar_v2_hair_rosewood_butterfly_layers.png"],
  ["avatar_v2_hair_caramel_braided_crown", ["room_avatar_hair_back_female_caramel_braided_crown_v2", "room_avatar_hair_front_female_caramel_braided_crown_v2"], ["avatar_hair_caramel_braided_crown.png"], ["avatar_room_hair_back_female_caramel_braided_crown_v2.png", "avatar_room_hair_front_female_caramel_braided_crown_v2.png"], null, "avatar_v2_hair_caramel_braided_crown.png"],
  ["avatar_v2_hair_berry_velvet_soft_updo", ["room_avatar_hair_back_female_berry_velvet_soft_updo_v2", "room_avatar_hair_front_female_berry_velvet_soft_updo_v2"], ["avatar_hair_berry_velvet_soft_updo.png"], ["avatar_room_hair_back_female_berry_velvet_soft_updo_v2.png", "avatar_room_hair_front_female_berry_velvet_soft_updo_v2.png"], null, "avatar_v2_hair_berry_velvet_soft_updo.png"],
  ["avatar_v2_hair_chestnut_butterfly_bob", ["room_avatar_hair_back_female_chestnut_butterfly_bob_v2", "room_avatar_hair_front_female_chestnut_butterfly_bob_v2"], ["avatar_hair_chestnut_butterfly_bob.png"], ["avatar_room_hair_back_female_chestnut_butterfly_bob_v2.png", "avatar_room_hair_front_female_chestnut_butterfly_bob_v2.png"], ["room_avatar_hair_back_female_chestnut_butterfly_bob_v2", "room_avatar_hair_front_female_chestnut_butterfly_bob_v2"], "avatar_v2_hair_chestnut_butterfly_bob.png"],
  ["avatar_v2_hair_golden_waves", ["room_avatar_hair_back_female_golden_waves_v2", "room_avatar_hair_front_female_golden_waves_v2"], ["avatar_hair_golden_waves.png"], ["avatar_room_hair_back_female_golden_waves_v2.png", "avatar_room_hair_front_female_golden_waves_v2.png"], ["room_avatar_hair_back_female_golden_waves_v2", "room_avatar_hair_front_female_golden_waves_v2"], "avatar_v2_hair_golden_waves.png"],
  ["avatar_v2_hair_ink_pageboy_star", ["room_avatar_hair_back_female_ink_pageboy_star_v2", "room_avatar_hair_front_female_ink_pageboy_star_v2"], ["avatar_hair_ink_pageboy_star.png"], ["avatar_room_hair_back_female_ink_pageboy_star_v2.png", "avatar_room_hair_front_female_ink_pageboy_star_v2.png"], ["room_avatar_hair_back_female_ink_pageboy_star_v2", "room_avatar_hair_front_female_ink_pageboy_star_v2"], "avatar_v2_hair_ink_pageboy_star.png"],
  ["avatar_v2_hair_ink_twin_braids", ["room_avatar_hair_back_female_ink_twin_braids_v2", "room_avatar_hair_front_female_ink_twin_braids_v2"], ["avatar_hair_ink_twin_braids.png"], ["avatar_room_hair_back_female_ink_twin_braids_v2.png", "avatar_room_hair_front_female_ink_twin_braids_v2.png"], ["room_avatar_hair_back_female_ink_twin_braids_v2", "room_avatar_hair_front_female_ink_twin_braids_v2"], "avatar_v2_hair_ink_twin_braids.png"],
  ["avatar_v2_hair_pale_golden_bow_bob", ["room_avatar_hair_back_female_pale_golden_bow_bob_v2", "room_avatar_hair_front_female_pale_golden_bow_bob_v2"], ["avatar_hair_pale_golden_bow_bob.png"], ["avatar_room_hair_back_female_pale_golden_bow_bob_v2.png", "avatar_room_hair_front_female_pale_golden_bow_bob_v2.png"], ["room_avatar_hair_back_female_pale_golden_bow_bob_v2", "room_avatar_hair_front_female_pale_golden_bow_bob_v2"], "avatar_v2_hair_pale_golden_bow_bob.png"],
  ["avatar_v2_hair_copper_bow_waves", ["room_avatar_hair_back_female_copper_bow_waves_v2", "room_avatar_hair_front_female_copper_bow_waves_v2"], ["avatar_hair_copper_bow_waves.png"], ["avatar_room_hair_back_female_copper_bow_waves_v2.png", "avatar_room_hair_front_female_copper_bow_waves_v2.png"], ["room_avatar_hair_back_female_copper_bow_waves_v2", "room_avatar_hair_front_female_copper_bow_waves_v2"], "avatar_v2_hair_copper_bow_waves.png"],
  ["avatar_v2_eyes_mocha_doe", ["room_avatar_eyes_female_mocha_doe_v2"], ["avatar_eyes_mocha_doe.png"], ["avatar_room_eyes_female_mocha_doe_v2.png"], ["room_avatar_eyes_female_mocha_doe_v2"], "avatar_v2_eyes_mocha_doe.png"],
  ["avatar_v2_eyes_sage_glass", ["room_avatar_eyes_female_sage_glass_v2"], ["avatar_eyes_sage_glass.png"], ["avatar_room_eyes_female_sage_glass_v2.png"], ["room_avatar_eyes_female_sage_glass_v2"], "avatar_v2_eyes_sage_glass.png"],
  ["avatar_v2_eyes_twilight_plum", ["room_avatar_eyes_female_twilight_plum_v2"], ["avatar_eyes_twilight_plum.png"], ["avatar_room_eyes_female_twilight_plum_v2.png"], ["room_avatar_eyes_female_twilight_plum_v2"], "avatar_v2_eyes_twilight_plum.png"],
  ["avatar_v2_nose_soft_button", ["room_avatar_nose_female_soft_button_v2"], ["avatar_nose_soft_button.png"], ["avatar_room_nose_female_soft_button_v2.png"], ["room_avatar_nose_female_soft_button_v2"], "avatar_v2_nose_soft_button.png"],
  ["avatar_v2_nose_petal_curve", ["room_avatar_nose_female_petal_curve_v2"], ["avatar_nose_petal_curve.png"], ["avatar_room_nose_female_petal_curve_v2.png"], ["room_avatar_nose_female_petal_curve_v2"], "avatar_v2_nose_petal_curve.png"],
  ["avatar_v2_nose_gentle_bridge", ["room_avatar_nose_female_gentle_bridge_v2"], ["avatar_nose_gentle_bridge.png"], ["avatar_room_nose_female_gentle_bridge_v2.png"], ["room_avatar_nose_female_gentle_bridge_v2"], "avatar_v2_nose_gentle_bridge.png"],
  ["avatar_v2_mouth_peach_whisper_smile", ["room_avatar_mouth_female_peach_whisper_smile_v2"], ["avatar_mouth_peach_whisper_smile.png"], ["avatar_room_mouth_female_peach_whisper_smile_v2.png"], ["room_avatar_mouth_female_peach_whisper_smile_v2"], "avatar_v2_mouth_peach_whisper_smile.png"],
  ["avatar_v2_mouth_rose_gloss_smile", ["room_avatar_mouth_female_rose_gloss_smile_v2"], ["avatar_mouth_rose_gloss_smile.png"], ["avatar_room_mouth_female_rose_gloss_smile_v2.png"], ["room_avatar_mouth_female_rose_gloss_smile_v2"], "avatar_v2_mouth_rose_gloss_smile.png"],
  ["avatar_v2_mouth_berry_soft_kiss", ["room_avatar_mouth_female_berry_soft_kiss_v2"], ["avatar_mouth_berry_soft_kiss.png"], ["avatar_room_mouth_female_berry_soft_kiss_v2.png"], ["room_avatar_mouth_female_berry_soft_kiss_v2"], "avatar_v2_mouth_berry_soft_kiss.png"],
  ["avatar_v2_shoes_milk_tea_court_sneakers", ["room_avatar_shoes_female_milk_tea_court_sneakers_v2"], ["avatar_shoes_milk_tea_court_sneakers.png"], ["avatar_room_shoes_female_milk_tea_court_sneakers_v2.png"], ["room_avatar_shoes_female_milk_tea_court_sneakers_v2"], "avatar_v2_shoes_milk_tea_court_sneakers.png"],
  ["avatar_v2_shoes_cherry_satin_ballets", ["room_avatar_shoes_female_cherry_satin_ballets_v2"], ["avatar_shoes_cherry_satin_ballets.png"], ["avatar_room_shoes_female_cherry_satin_ballets_v2.png"], ["room_avatar_shoes_female_cherry_satin_ballets_v2"], "avatar_v2_shoes_cherry_satin_ballets.png"],
  ["avatar_v2_shoes_onyx_heart_mary_janes", ["room_avatar_shoes_female_onyx_heart_mary_janes_v2"], ["avatar_shoes_onyx_heart_mary_janes.png"], ["avatar_room_shoes_female_onyx_heart_mary_janes_v2.png"], ["room_avatar_shoes_female_onyx_heart_mary_janes_v2"], "avatar_v2_shoes_onyx_heart_mary_janes.png"],
  ["avatar_v2_shoes_rosewood_platform_loafers", ["room_avatar_shoes_female_rosewood_platform_loafers_v2"], ["avatar_shoes_rosewood_platform_loafers.png"], ["avatar_room_shoes_female_rosewood_platform_loafers_v2.png"], ["room_avatar_shoes_female_rosewood_platform_loafers_v2"], "avatar_v2_shoes_rosewood_platform_loafers.png"],
  ["avatar_v2_shoes_pearl_slingback_sandals", ["room_avatar_shoes_female_pearl_slingback_sandals_v2"], ["avatar_shoes_pearl_slingback_sandals.png"], ["avatar_room_shoes_female_pearl_slingback_sandals_v2.png"], ["room_avatar_shoes_female_pearl_slingback_sandals_v2"], "avatar_v2_shoes_pearl_slingback_sandals.png"]
] as const

const legacyIds = [
  "avatar_v2_hair_default", "avatar_v2_hair_black_sleek_bob", "avatar_v2_hair_honey_high_ponytail",
  "avatar_v2_hair_cocoa_cloud_ponytail", "avatar_v2_hair_espresso_sleek_ribbon_pony",
  "avatar_v2_eyes_soft_brown", "avatar_v2_eyes_emerald_lash", "avatar_v2_eyes_hazel_spark",
  "avatar_v2_nose_button", "avatar_v2_nose_soft_bridge", "avatar_v2_nose_petite_shadow",
  "avatar_v2_mouth_rose_smile", "avatar_v2_mouth_berry_pout", "avatar_v2_mouth_peach_grin",
  "avatar_v2_shoes_default", "avatar_v2_shoes_ruby_bow_flats", "avatar_v2_shoes_black_mary_janes",
  "avatar_v2_top_blush", "avatar_v2_bottom_lilac", "avatar_v2_accessory_mint_glasses",
  "avatar_v2_top_locked_luxe", "avatar_v2_top_lilac_offshoulder_bow_blouse",
  "avatar_v2_bottom_floral_embroidered_skort_shorts", "avatar_v2_shoes_white_sneakers",
  "avatar_v2_top_silver_sequin_halter_top", "avatar_v2_bottom_pink_embellished_wide_pants",
  "avatar_v2_bottom_patchwork_bow_mini_skirt", "avatar_v2_top_silver_lace_ruffle_dress_top",
  "avatar_v2_bottom_silver_lace_ruffle_dress_bottom", "avatar_v2_top_red_floral_bikini_top",
  "avatar_v2_bottom_red_floral_bikini_bottom", "avatar_v2_bottom_white_embellished_wide_pants"
]

const accessoryFeatures = [
  ["avatar_v2_accessory_ivory_ribbon_beret", "room_avatar_accessory_female_ivory_ribbon_beret_v2", "avatar_accessory_ivory_ribbon_beret.png", "avatar_room_accessory_female_ivory_ribbon_beret_v2.png", "room_avatar_accessory_female_ivory_ribbon_beret_v2", "avatar_v2_accessory_ivory_ribbon_beret.png"],
  ["avatar_v2_accessory_cherry_bow_headband", "room_avatar_accessory_female_cherry_bow_headband_v2", "avatar_accessory_cherry_bow_headband.png", "avatar_room_accessory_female_cherry_bow_headband_v2.png", "room_avatar_accessory_female_cherry_bow_headband_v2", "avatar_v2_accessory_cherry_bow_headband.png"],
  ["avatar_v2_accessory_sage_heart_glasses", "room_avatar_accessory_female_sage_heart_glasses_v2", "avatar_accessory_sage_heart_glasses.png", "avatar_room_accessory_female_sage_heart_glasses_v2.png", "room_avatar_accessory_female_sage_heart_glasses_v2", "avatar_v2_accessory_sage_heart_glasses.png"],
  ["avatar_v2_accessory_rose_round_glasses", "room_avatar_accessory_female_rose_round_glasses_v2", "avatar_accessory_rose_round_glasses.png", "avatar_room_accessory_female_rose_round_glasses_v2.png", "room_avatar_accessory_female_rose_round_glasses_v2", "avatar_v2_accessory_rose_round_glasses.png"],
  ["avatar_v2_accessory_lavender_pearl_cat_eye_glasses", "room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2", "avatar_accessory_lavender_pearl_cat_eye_glasses.png", "avatar_room_accessory_female_lavender_pearl_cat_eye_glasses_v2.png", "room_avatar_accessory_female_lavender_pearl_cat_eye_glasses_v2", "avatar_v2_accessory_lavender_pearl_cat_eye_glasses.png"],
  ["avatar_v2_accessory_mint_star_oval_glasses", "room_avatar_accessory_female_mint_star_oval_glasses_v2", "avatar_accessory_mint_star_oval_glasses.png", "avatar_room_accessory_female_mint_star_oval_glasses_v2.png", "room_avatar_accessory_female_mint_star_oval_glasses_v2", "avatar_v2_accessory_mint_star_oval_glasses.png"],
  ["avatar_v2_accessory_honey_blossom_square_glasses", "room_avatar_accessory_female_honey_blossom_square_glasses_v2", "avatar_accessory_honey_blossom_square_glasses.png", "avatar_room_accessory_female_honey_blossom_square_glasses_v2.png", "room_avatar_accessory_female_honey_blossom_square_glasses_v2", "avatar_v2_accessory_honey_blossom_square_glasses.png"],
  ["avatar_v2_accessory_pearl_drop_earrings", "room_avatar_accessory_female_pearl_drop_earrings_v2", "avatar_accessory_pearl_drop_earrings.png", "avatar_room_accessory_female_pearl_drop_earrings_v2.png", "room_avatar_accessory_female_pearl_drop_earrings_v2", "avatar_v2_accessory_pearl_drop_earrings.png"],
  ["avatar_v2_accessory_golden_heart_locket", "room_avatar_accessory_female_golden_heart_locket_v2", "avatar_accessory_golden_heart_locket.png", "avatar_room_accessory_female_golden_heart_locket_v2.png", "room_avatar_accessory_female_golden_heart_locket_v2", "avatar_v2_accessory_golden_heart_locket.png"],
  ["avatar_v2_accessory_buttercream_neck_scarf", "room_avatar_accessory_female_buttercream_neck_scarf_v2", "avatar_accessory_buttercream_neck_scarf.png", "avatar_room_accessory_female_buttercream_neck_scarf_v2.png", "room_avatar_accessory_female_buttercream_neck_scarf_v2", "avatar_v2_accessory_buttercream_neck_scarf.png"],
  ["avatar_v2_accessory_cherry_micro_bag", "room_avatar_accessory_female_cherry_micro_bag_v2", "avatar_accessory_cherry_micro_bag.png", "avatar_room_accessory_female_cherry_micro_bag_v2.png", "room_avatar_accessory_female_cherry_micro_bag_v2", "avatar_v2_accessory_cherry_micro_bag.png"],
  ["avatar_v2_accessory_sunny_star_clips", "room_avatar_accessory_female_sunny_star_clips_v2", "avatar_accessory_sunny_star_clips.png", "avatar_room_accessory_female_sunny_star_clips_v2.png", "room_avatar_accessory_female_sunny_star_clips_v2", "avatar_v2_accessory_sunny_star_clips.png"]
] as const

const outerwearFeatures = [
  ["avatar_v2_top_blush_lace_cardigan", "room_avatar_top_female_blush_lace_cardigan_v2", "avatar_top_blush_lace_cardigan.png", "avatar_room_top_female_blush_lace_cardigan_v2.png", "room_avatar_top_female_blush_lace_cardigan_v2", "avatar_v2_top_blush_lace_cardigan.png"],
  ["avatar_v2_top_sage_ribbon_knit_jacket", "room_avatar_top_female_sage_ribbon_knit_jacket_v2", "avatar_top_sage_ribbon_knit_jacket.png", "avatar_room_top_female_sage_ribbon_knit_jacket_v2.png", "room_avatar_top_female_sage_ribbon_knit_jacket_v2", "avatar_v2_top_sage_ribbon_knit_jacket.png"],
  ["avatar_v2_top_cherry_heart_milkmaid_blouse", "room_avatar_top_female_cherry_heart_milkmaid_blouse_v2", "avatar_top_cherry_heart_milkmaid_blouse.png", "avatar_room_top_female_cherry_heart_milkmaid_blouse_v2.png", "room_avatar_top_female_cherry_heart_milkmaid_blouse_v2", "avatar_v2_top_cherry_heart_milkmaid_blouse.png"],
  ["avatar_v2_top_powder_blue_ribbon_corset_top", "room_avatar_top_female_powder_blue_ribbon_corset_top_v2", "avatar_top_powder_blue_ribbon_corset_top.png", "avatar_room_top_female_powder_blue_ribbon_corset_top_v2.png", "room_avatar_top_female_powder_blue_ribbon_corset_top_v2", "avatar_v2_top_powder_blue_ribbon_corset_top.png"],
  ["avatar_v2_top_noir_rose_heart_cardigan", "room_avatar_top_female_noir_rose_heart_cardigan_v2", "avatar_top_noir_rose_heart_cardigan.png", "avatar_room_top_female_noir_rose_heart_cardigan_v2.png", "room_avatar_top_female_noir_rose_heart_cardigan_v2", "avatar_v2_top_noir_rose_heart_cardigan.png"]
] as const

function readProjectFile(relativePath: string): string {
  return readFileSync(join(workspaceRoot, relativePath), "utf8")
}

test("soft doll feature assets are wired through avatar, room, shop, and motion layers", () => {
  const avatarCatalog = readProjectFile("src/features/avatarV2/avatarV2.mock.ts")
  const projection = readProjectFile("src/features/avatarV2/room/avatarRoomProjection.ts")
  const shopSource = [
    readProjectFile("src/screens/CosmeticShopScreen.tsx"),
    readProjectFile("src/features/shop/shopAssets.ts")
  ].join("\n")
  const wardrobeScreen = readProjectFile("src/screens/WardrobeV2Screen.tsx")
  const economyCatalog = readProjectFile(
    "../../packages/domain/src/economy/economyCatalog.ts"
  )

  for (const [avatarId, roomIds, layerFiles, roomFiles, motionPrefixes, thumbnailFile] of features) {
    assert.match(avatarCatalog, new RegExp(avatarId), avatarId)
    if (avatarId !== "avatar_v2_face_default") {
      assert.match(shopSource, new RegExp(avatarId), avatarId)
      assert.match(wardrobeScreen, new RegExp(avatarId), avatarId)
    }
    for (const roomId of roomIds) {
      assert.equal(
        ROOM_AVATAR_CATALOG.some((entry) => entry.id === roomId),
        true,
        roomId
      )
      assert.match(projection, new RegExp(`${avatarId}:[\\s\\S]*${roomId}`), roomId)
    }
    for (const file of layerFiles) assert.equal(existsSync(join(assetRoot, "layers", file)), true, file)
    for (const file of roomFiles) assert.equal(existsSync(join(assetRoot, "room", file)), true, file)
    if (thumbnailFile) {
      assert.equal(existsSync(join(assetRoot, "shop-thumbnails", thumbnailFile)), true, thumbnailFile)
    }
    if (motionPrefixes) {
      for (const prefix of motionPrefixes) {
        for (const suffix of ["walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01"]) {
          assert.equal(existsSync(join(assetRoot, "room/motion", `${prefix}_${suffix}.png`)), true, `${prefix} ${suffix}`)
        }
      }
    }
  }

  for (const id of [
    "avatar_v2_eyes_sage_glass", "avatar_v2_eyes_twilight_plum", "avatar_v2_nose_petal_curve",
    "avatar_v2_nose_gentle_bridge", "avatar_v2_mouth_rose_gloss_smile", "avatar_v2_mouth_berry_soft_kiss",
    "avatar_v2_hair_midnight_french_bob", "avatar_v2_hair_honey_halfup_waves",
    "avatar_v2_shoes_cherry_satin_ballets", "avatar_v2_shoes_onyx_heart_mary_janes",
    "avatar_v2_shoes_rosewood_platform_loafers", "avatar_v2_shoes_pearl_slingback_sandals"
  ]) assert.match(economyCatalog, new RegExp(`avatarItem\\(\\s*\"${id}\"`), id)
})

test("removed feature selections resolve to the new soft doll defaults", () => {
  const resolved = resolveAvatarV2({
    ...DEFAULT_AVATAR_V2,
    hairId: "avatar_v2_hair_default",
    shoesId: "avatar_v2_shoes_default",
    eyesId: "avatar_v2_eyes_soft_brown",
    noseId: "avatar_v2_nose_button",
    mouthId: "avatar_v2_mouth_rose_smile",
    topId: "avatar_v2_top_blush",
    bottomId: "avatar_v2_bottom_lilac"
  })
  assert.equal(resolved.hairId, DEFAULT_AVATAR_V2.hairId)
  assert.equal(resolved.shoesId, DEFAULT_AVATAR_V2.shoesId)
  assert.equal(resolved.eyesId, DEFAULT_AVATAR_V2.eyesId)
  assert.equal(resolved.noseId, DEFAULT_AVATAR_V2.noseId)
  assert.equal(resolved.mouthId, DEFAULT_AVATAR_V2.mouthId)
  assert.equal(resolved.topId, DEFAULT_AVATAR_V2.topId)
  assert.equal(resolved.bottomId, DEFAULT_AVATAR_V2.bottomId)
})

test("face feature selections only replace their own wardrobe slot", () => {
  const original: UserAvatar = {
    ...DEFAULT_AVATAR_V2,
    topId: "avatar_v2_top_blush_lace_cardigan",
    bottomId: "avatar_v2_bottom_striped_crochet_shorts",
    shoesId: "avatar_v2_shoes_cherry_satin_ballets"
  }
  const selections = [
    "avatar_v2_eyes_sage_glass",
    "avatar_v2_nose_petal_curve",
    "avatar_v2_mouth_rose_gloss_smile",
    "avatar_v2_hair_midnight_french_bob"
  ]

  const result = selections.reduce<UserAvatar>((avatar, id) => {
    const item = AVATAR_V2_CATALOG.find((entry) => entry.id === id)
    assert.ok(item, id)
    return equipAvatarV2Item(avatar, item)
  }, original)

  assert.equal(result.topId, original.topId)
  assert.equal(result.bottomId, original.bottomId)
  assert.equal(result.shoesId, original.shoesId)
  assert.deepEqual(result.accessoryIds, original.accessoryIds)
})

test("malformed male snapshots fail closed instead of rendering female features", () => {
  const resolved = resolveAvatarV2({
    ...DEFAULT_AVATAR_V2,
    bodyId: "avatar_v2_body_male_light",
    accessoryIds: ["avatar_v2_accessory_sage_heart_glasses"]
  })

  assert.equal(resolved.bodyId, "avatar_v2_body_male_light")
  assert.equal(resolved.faceId, "avatar_v2_face_male_warm_friendly")
  assert.equal(resolved.eyesId, "avatar_v2_eyes_male_warm_brown")
  assert.equal(resolved.noseId, "avatar_v2_nose_male_gentle_bridge")
  assert.equal(resolved.mouthId, "avatar_v2_mouth_male_soft_smile")
  assert.deepEqual(resolved.accessoryIds, [])
})

test("female accessory assets are wired through avatar, room, shop, and motion layers", () => {
  const avatarCatalog = readProjectFile("src/features/avatarV2/avatarV2.mock.ts")
  const roomCatalog = readProjectFile("src/features/avatarV2/room/avatarRoom.mock.ts")
  const projection = readProjectFile("src/features/avatarV2/room/avatarRoomProjection.ts")
  const shopSource = [
    readProjectFile("src/screens/CosmeticShopScreen.tsx"),
    readProjectFile("src/features/shop/shopAssets.ts")
  ].join("\n")
  const wardrobeScreen = readProjectFile("src/screens/WardrobeV2Screen.tsx")
  const economyCatalog = readProjectFile(
    "../../packages/domain/src/economy/economyCatalog.ts"
  )

  for (const [avatarId, roomId, layerFile, roomFile, motionPrefix, thumbnailFile] of accessoryFeatures) {
    assert.match(avatarCatalog, new RegExp(avatarId), avatarId)
    assert.match(roomCatalog, new RegExp(`id: "${roomId}"`), roomId)
    assert.match(projection, new RegExp(`${avatarId}:[\\s\\S]*${roomId}`), roomId)
    assert.match(shopSource, new RegExp(avatarId), avatarId)
    assert.match(wardrobeScreen, new RegExp(avatarId), avatarId)
    assert.equal(existsSync(join(assetRoot, "layers", layerFile)), true, layerFile)
    assert.equal(existsSync(join(assetRoot, "room", roomFile)), true, roomFile)
    assert.equal(existsSync(join(assetRoot, "shop-thumbnails", thumbnailFile)), true, thumbnailFile)
    for (const suffix of ["walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01"]) {
      assert.equal(existsSync(join(assetRoot, "room/motion", `${motionPrefix}_${suffix}.png`)), true, `${motionPrefix} ${suffix}`)
    }
  }

  for (const id of accessoryFeatures.slice(1).map(([avatarId]) => avatarId)) {
    assert.match(economyCatalog, new RegExp(`avatarItem\\(\\s*\"${id}\"`), id)
  }
})

test("outerwear assets are wired through avatar, room, shop, wardrobe, and motion layers", () => {
  const avatarCatalog = readProjectFile("src/features/avatarV2/avatarV2.mock.ts")
  const roomCatalog = readProjectFile("src/features/avatarV2/room/avatarRoom.mock.ts")
  const projection = readProjectFile("src/features/avatarV2/room/avatarRoomProjection.ts")
  const shopSource = [
    readProjectFile("src/screens/CosmeticShopScreen.tsx"),
    readProjectFile("src/features/shop/shopAssets.ts")
  ].join("\n")
  const wardrobeScreen = readProjectFile("src/screens/WardrobeV2Screen.tsx")
  const economyCatalog = readProjectFile(
    "../../packages/domain/src/economy/economyCatalog.ts"
  )

  for (const [avatarId, roomId, layerFile, roomFile, motionPrefix, thumbnailFile] of outerwearFeatures) {
    assert.match(avatarCatalog, new RegExp(avatarId), avatarId)
    assert.match(roomCatalog, new RegExp(`id: "${roomId}"`), roomId)
    assert.match(projection, new RegExp(`${avatarId}:[\\s\\S]*${roomId}`), roomId)
    assert.match(shopSource, new RegExp(avatarId), avatarId)
    assert.match(wardrobeScreen, new RegExp(avatarId), avatarId)
    assert.match(
      economyCatalog,
      new RegExp(`avatarItem\\(\\s*\"${avatarId}\"`),
      avatarId
    )
    assert.equal(existsSync(join(assetRoot, "layers", layerFile)), true, layerFile)
    assert.equal(existsSync(join(assetRoot, "room", roomFile)), true, roomFile)
    assert.equal(existsSync(join(assetRoot, "shop-thumbnails", thumbnailFile)), true, thumbnailFile)
    for (const suffix of ["walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01"]) {
      assert.equal(existsSync(join(assetRoot, "room/motion", `${motionPrefix}_${suffix}.png`)), true, `${motionPrefix} ${suffix}`)
    }
  }
})

test("accessories stack across groups and only replace their own group", () => {
  const getItem = (id: string) => {
    const item = AVATAR_V2_CATALOG.find((entry) => entry.id === id)
    assert.ok(item, id)
    return item
  }
  const initial: UserAvatar = { ...DEFAULT_AVATAR_V2, accessoryIds: [] }
  const stacked = [
    "avatar_v2_accessory_ivory_ribbon_beret",
    "avatar_v2_accessory_sage_heart_glasses",
    "avatar_v2_accessory_pearl_drop_earrings",
    "avatar_v2_accessory_golden_heart_locket",
    "avatar_v2_accessory_cherry_micro_bag"
  ].reduce<UserAvatar>((avatar, id) => equipAvatarV2Item(avatar, getItem(id)), initial)

  assert.deepEqual(stacked.accessoryIds, [
    "avatar_v2_accessory_ivory_ribbon_beret",
    "avatar_v2_accessory_sage_heart_glasses",
    "avatar_v2_accessory_pearl_drop_earrings",
    "avatar_v2_accessory_golden_heart_locket",
    "avatar_v2_accessory_cherry_micro_bag"
  ])

  const swapped = equipAvatarV2Item(stacked, getItem("avatar_v2_accessory_cherry_bow_headband"))
  assert.deepEqual(swapped.accessoryIds, [
    "avatar_v2_accessory_sage_heart_glasses",
    "avatar_v2_accessory_pearl_drop_earrings",
    "avatar_v2_accessory_golden_heart_locket",
    "avatar_v2_accessory_cherry_micro_bag",
    "avatar_v2_accessory_cherry_bow_headband"
  ])
})

test("removed feature ids are absent from the new source of truth", () => {
  for (const id of legacyIds) {
    assert.equal(AVATAR_V2_CATALOG.some((item) => item.id === id), false, id)
    assert.equal(id in DEFAULT_AVATAR_ROOM_PROJECTION_MAP, false, id)
  }
})
