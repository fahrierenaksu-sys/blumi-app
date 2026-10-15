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

test("each worn kind with an item has its own Studio tab and hair lives only under My Character", () => {
  const closet = getAvatarStudioTabs("closet", STUDIO_FIXTURE_CATALOG, DEFAULT_AVATAR_V2)
  const appearance = getAvatarStudioTabs("appearance", STUDIO_FIXTURE_CATALOG, DEFAULT_AVATAR_V2)
  // slots_2140: dresses have their own tab (Elbise), next to Tops; the fixture has no glasses, so no Gözlük tab
  assert.deepEqual(closet.map((tab) => tab.id), ["top", "bottom", "dress", "shoes", "accessory"])
  assert.deepEqual(appearance.map((tab) => tab.id), ["hair", "face", "eyes", "nose"])
  assert.equal(closet.some((tab) => tab.categories.includes("hair")), false)
  assert.deepEqual(closet[0].categories, ["top"])
  assert.deepEqual(
    appearance[1].categories,
    ["face", "mouth", "body"],
    "mouth and the base body stay reachable as Face filters"
  )
})

test("a tab is found from any of its categories and the active category stays valid", () => {
  const tabs = getAvatarStudioTabs("closet", STUDIO_FIXTURE_CATALOG, DEFAULT_AVATAR_V2)
  assert.equal(findAvatarStudioTab(tabs, "dress")?.id, "dress")
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

// New item kinds (WB integration/slots_2140 DESIGN §3, §9): one-piece dresses, glasses and accessories.
const fixtureItem = (id: string, type: "dress" | "accessory", extra: Record<string, unknown> = {}) => ({
  id, type, name: id, sortOrder: 9100, layerOrder: 50, assets: {}, compatibleBodyIds: [DEFAULT_AVATAR_V2.bodyId], ...extra
}) as (typeof AVATAR_V2_CATALOG)[number]
const ONE_PIECE = fixtureItem("fixture_one_piece_dress", "dress")
const GLASSES = fixtureItem("fixture_round_glasses", "accessory", { accessoryGroup: "eyewear" })
const BAG = fixtureItem("fixture_mini_bag", "accessory", { accessoryGroup: "bag" })

test("Elbise, Gözlük and Aksesuar tabs show only when they have an item; glasses never sit under Aksesuar", () => {
  const live = getAvatarStudioTabs("closet", AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2).map((tab) => tab.id)
  assert.ok(!live.includes("dress") && !live.includes("glasses"), "no tab without an item")
  const withNew = [...AVATAR_V2_CATALOG, ONE_PIECE, GLASSES, BAG]
  const tabs = getAvatarStudioTabs("closet", withNew, DEFAULT_AVATAR_V2).map((tab) => tab.id)
  assert.ok((["dress", "glasses", "accessory"] as const).every((id) => tabs.includes(id)), tabs.join())
  assert.ok(getWardrobeCategoryItems(withNew, "glasses").some((item) => item.id === GLASSES.id))
  assert.ok(!getWardrobeCategoryItems(withNew, "accessory").some((item) => item.id === GLASSES.id))
  assert.ok(getWardrobeCategoryItems(withNew, "accessory").some((item) => item.id === BAG.id))
  assert.ok(getWardrobeCategoryItems(withNew, "dress").some((item) => item.id === ONE_PIECE.id))
})

test("a dress goes over the separates, tapping it again restores them, and picking a top takes it off", () => {
  const base = { ...DEFAULT_AVATAR_V2, dressId: null }
  const dressed = equipAvatarV2Item(base, ONE_PIECE)
  assert.equal(dressed.dressId, ONE_PIECE.id)
  assert.equal(dressed.topId, base.topId)
  assert.equal(dressed.bottomId, base.bottomId)
  assert.deepEqual(equipAvatarV2Item(dressed, ONE_PIECE), base)
  const top = AVATAR_V2_CATALOG.find((item) => item.id === base.topId)!
  const separates = equipAvatarV2Item(dressed, top)
  assert.equal(separates.dressId, null)
  assert.equal(base.dressId, null, "the previous look is never mutated")
})

test("glasses toggle on and off, and another pair replaces the worn one", () => {
  const base = { ...DEFAULT_AVATAR_V2, accessoryIds: [] }
  const on = equipAvatarV2Item(base, GLASSES)
  assert.deepEqual(on.accessoryIds, [GLASSES.id])
  assert.deepEqual(equipAvatarV2Item(on, GLASSES).accessoryIds, [])
  // one pair at a time (the catalog's eyewear group)
  const [first, second] = AVATAR_V2_CATALOG.filter((item) => item.accessoryGroup === "eyewear")
  const bag = AVATAR_V2_CATALOG.find((item) => item.accessoryGroup === "bag")!
  const worn = equipAvatarV2Item(equipAvatarV2Item(base, first!), bag)
  assert.deepEqual(equipAvatarV2Item(worn, second!).accessoryIds, [bag.id, second!.id])
})

// Review slots_1330 HIGH-2: without the server's V2 loadout write a one-piece dress cannot be saved, so it is never
// offered: no Elbise tab, no dress card, no try-on. A legacy paired dress (a top + bottom pair) still saves over V1.
const {
  filterSavableAvatarCatalog,
  isAvatarItemSavable
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./avatarDressWriteGate") as typeof import("./avatarDressWriteGate")

test("without the V2 loadout write the closet offers no one-piece dress, and offers it once the server allows it", () => {
  const withDress = [...AVATAR_V2_CATALOG, ONE_PIECE, GLASSES]
  for (const capabilities of [undefined, {}, { avatar_loadout_v2_read: true, avatar_loadout_v2_write: false }]) {
    const closet = filterSavableAvatarCatalog(withDress, capabilities)
    assert.ok(!getAvatarStudioTabs("closet", closet, DEFAULT_AVATAR_V2).some((tab) => tab.id === "dress"))
    assert.ok(!getWardrobeCategoryItems(closet, "dress").some((item) => item.id === ONE_PIECE.id))
    assert.equal(isAvatarItemSavable(ONE_PIECE, capabilities), false)
    assert.ok(getAvatarStudioTabs("closet", closet, DEFAULT_AVATAR_V2).some((tab) => tab.id === "glasses"), "glasses ride on V1")
  }
  const allowed = filterSavableAvatarCatalog(withDress, { avatar_loadout_v2_write: true })
  assert.ok(getAvatarStudioTabs("closet", allowed, DEFAULT_AVATAR_V2).some((tab) => tab.id === "dress"))
  assert.equal(isAvatarItemSavable(ONE_PIECE, { avatar_loadout_v2_write: true }), true)
  const pairTop = { ...AVATAR_V2_CATALOG.find((item) => item.type === "top")!, outfitKey: "fixture_pair" }
  assert.equal(isAvatarItemSavable(pairTop, {}), true, "a legacy paired dress is carried by V1")
})
