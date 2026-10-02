import assert from "node:assert/strict"
import test from "node:test"
import type { UserAvatar } from "./avatarV2.types"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2 } = require("./avatarV2Catalog") as typeof import("./avatarV2Catalog")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { equipAvatarV2Item, resolveAvatarV2 } = require("./avatarV2Selectors") as typeof import("./avatarV2Selectors")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")

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
