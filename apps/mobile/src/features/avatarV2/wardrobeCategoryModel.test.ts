import assert from "node:assert/strict"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

const {
  AVATAR_V2_CATALOG,
  AVATAR_V2_INVENTORY,
  DEFAULT_AVATAR_V2
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./avatarV2Catalog") as typeof import("./avatarV2Catalog")
const {
  canEquipAvatarV2Item,
  equipAvatarV2Item
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./avatarV2Selectors") as typeof import("./avatarV2Selectors")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")
const {
  getWardrobeCategoryItems,
  getAvatarStudioTabs,
  findAvatarStudioTab,
  resolveAvatarStudioCategory
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./wardrobeCategoryModel") as typeof import("./wardrobeCategoryModel")

test("wardrobe exposes both starter body bases after onboarding", () => {
  const bodyIds = getWardrobeCategoryItems(AVATAR_V2_CATALOG, "body").map(
    (item) => item.id
  )
  assert.deepEqual(bodyIds, [
    "avatar_v2_body_default",
    "avatar_v2_body_male_light"
  ])
  assert.equal(
    bodyIds.every((id) => id in DEFAULT_AVATAR_ROOM_PROJECTION_MAP),
    true
  )
  assert.equal(
    getWardrobeCategoryItems(AVATAR_V2_CATALOG, "body").every((item) =>
      canEquipAvatarV2Item(AVATAR_V2_INVENTORY, item, DEFAULT_AVATAR_V2.bodyId)
    ),
    true
  )
})

// Plan X15 retired every old dress and accessory, so the tab tests add one fixture dress (a top with an outfit key)
// and one fixture accessory, both wearable on the girl, to the live catalog.
const STUDIO_FIXTURE_CATALOG = [
  ...AVATAR_V2_CATALOG,
  {
    id: "fixture_studio_dress_top",
    type: "top",
    name: "Fixture dress top",
    sortOrder: 9001,
    layerOrder: 10,
    assets: {},
    outfitKey: "fixture_studio_dress",
    compatibleBodyIds: [DEFAULT_AVATAR_V2.bodyId]
  },
  {
    id: "fixture_studio_accessory",
    type: "accessory",
    name: "Fixture accessory",
    sortOrder: 9002,
    layerOrder: 20,
    assets: {},
    compatibleBodyIds: [DEFAULT_AVATAR_V2.bodyId]
  }
] as typeof AVATAR_V2_CATALOG

test("each Studio section shows four tabs and hair lives only under My Character", () => {
  const closet = getAvatarStudioTabs("closet", STUDIO_FIXTURE_CATALOG, DEFAULT_AVATAR_V2)
  const appearance = getAvatarStudioTabs("appearance", STUDIO_FIXTURE_CATALOG, DEFAULT_AVATAR_V2)
  assert.deepEqual(closet.map((tab) => tab.id), ["top", "bottom", "shoes", "accessory"])
  assert.deepEqual(appearance.map((tab) => tab.id), ["hair", "face", "eyes", "nose"])
  assert.equal(closet.some((tab) => tab.categories.includes("hair")), false)
  assert.deepEqual(closet[0].categories, ["top", "dress"], "dresses are a filter under Tops")
  assert.deepEqual(
    appearance[1].categories,
    ["face", "mouth", "body"],
    "mouth and the base body stay reachable as Face filters"
  )
})

test("a tab is found from any of its categories and the active category stays valid", () => {
  const tabs = getAvatarStudioTabs("closet", STUDIO_FIXTURE_CATALOG, DEFAULT_AVATAR_V2)
  assert.equal(findAvatarStudioTab(tabs, "dress")?.id, "top")
  assert.equal(findAvatarStudioTab(tabs, "hair"), undefined)
  assert.equal(resolveAvatarStudioCategory(tabs, "dress"), "dress")
  assert.equal(resolveAvatarStudioCategory(tabs, "hair"), "top")
  assert.equal(resolveAvatarStudioCategory([], "hair"), "hair")
})

test("female identity parts and the rendered male face are free Studio choices", () => {
  for (const bodyId of [DEFAULT_AVATAR_V2.bodyId]) {
    for (const type of ["face", "eyes", "nose", "mouth"] as const) {
      const choices = getWardrobeCategoryItems(AVATAR_V2_CATALOG, type)
        .filter((item) => item.compatibleBodyIds?.includes(bodyId) || (
          bodyId === DEFAULT_AVATAR_V2.bodyId && item.compatibleBodyIds === undefined
        ))
      assert.ok(choices.length > 0, `${bodyId}:${type}`)
      assert.ok(
        choices.every((item) => canEquipAvatarV2Item({ ownedItemIds: [] }, item, bodyId)),
        `${bodyId}:${type} must stay free outside Shop`
      )
    }
  }

  const maleAvatar = { ...DEFAULT_AVATAR_V2, bodyId: "avatar_v2_body_male_light" }
  const maleFaces = getWardrobeCategoryItems(AVATAR_V2_CATALOG, "face")
    .filter((item) => item.compatibleBodyIds?.includes(maleAvatar.bodyId))
  assert.ok(maleFaces.length > 0)
  assert.ok(maleFaces.every((item) =>
    canEquipAvatarV2Item({ ownedItemIds: [] }, item, maleAvatar.bodyId)
  ))
})

test("switching body refits every incompatible starter slot as one loadout", () => {
  const maleBody = getWardrobeCategoryItems(AVATAR_V2_CATALOG, "body").find(
    (item) => item.id === "avatar_v2_body_male_light"
  )
  assert.ok(maleBody)

  const result = equipAvatarV2Item(DEFAULT_AVATAR_V2, maleBody)

  assert.deepEqual(result, {
    bodyId: "avatar_v2_body_male_light",
    faceId: "avatar_v2_face_male_warm_friendly",
    eyesId: "avatar_v2_eyes_male_warm_brown",
    noseId: "avatar_v2_nose_male_gentle_bridge",
    mouthId: "avatar_v2_mouth_male_soft_smile",
    hairId: "avatar_v2_hair_male_blue_black_curls",
    topId: "avatar_v2_top_male_white_basic_tee",
    bottomId: "avatar_v2_bottom_male_black_straight_trousers",
    shoesId: "avatar_v2_shoes_male_black_clean_sneakers",
    accessoryIds: []
  })
})
