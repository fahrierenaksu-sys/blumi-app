import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

const {
  AVATAR_V2_CATALOG,
  AVATAR_V2_INVENTORY,
  DEFAULT_AVATAR_V2
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./avatarV2.mock") as typeof import("./avatarV2.mock")
const {
  canEquipAvatarV2Item,
  equipAvatarV2Item
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./avatarV2Selectors") as typeof import("./avatarV2Selectors")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")
const {
  getWardrobeCarouselProgress,
  getWardrobeCarouselIndicator,
  getWardrobeCarouselItemLayout,
  getWardrobeCategoryItems,
  getWardrobeEquippedSlotItem,
  getWardrobeEquippedSlotPreviewScale,
  getWardrobeVisibleSlots,
  getWardrobeSecondaryCategories,
  getAvatarStudioCategories,
  getAvatarStudioDefaultCategory,
  shouldUseWardrobeVerticalFallback,
  shouldUseWardrobeSlotCompactLayout,
  AVATAR_STUDIO_SECTIONS,
  WARDROBE_EQUIPPED_SLOTS,
  WARDROBE_CATEGORIES
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./wardrobeCategoryModel") as typeof import("./wardrobeCategoryModel")
const {
  getWardrobeThumbnailPresentation
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./wardrobeThumbnailPresentation") as typeof import("./wardrobeThumbnailPresentation")

test("wardrobe exposes both starter body bases after onboarding", () => {
  assert.equal(
    WARDROBE_CATEGORIES.some((category) => category.id === "body"),
    true
  )

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

test("Avatar Studio separates identity editing from the owned closet", () => {
  assert.deepEqual(AVATAR_STUDIO_SECTIONS, [
    { id: "closet", label: "My Closet" },
    { id: "appearance", label: "Avatar" }
  ])
  assert.deepEqual(
    getAvatarStudioCategories("appearance", AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2)
      .map((category) => category.id),
    ["body", "face", "eyes", "nose", "mouth"]
  )
  assert.deepEqual(
    getAvatarStudioCategories("closet", AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2)
      .map((category) => category.id),
    ["hair", "top", "dress", "bottom", "shoes", "accessory"]
  )
  assert.equal(getAvatarStudioDefaultCategory("appearance"), "face")
  assert.equal(getAvatarStudioDefaultCategory("closet"), "top")
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
  assert.deepEqual(
    getAvatarStudioCategories("appearance", AVATAR_V2_CATALOG, maleAvatar)
      .map((category) => category.id),
    ["body", "face"]
  )
  const maleFaces = getWardrobeCategoryItems(AVATAR_V2_CATALOG, "face")
    .filter((item) => item.compatibleBodyIds?.includes(maleAvatar.bodyId))
  assert.ok(maleFaces.length > 0)
  assert.ok(maleFaces.every((item) =>
    canEquipAvatarV2Item({ ownedItemIds: [] }, item, maleAvatar.bodyId)
  ))
})

test("Avatar Studio exposes real Avatar and My Closet controls", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/screens/WardrobeV2Screen.tsx"),
    "utf8"
  )
  assert.match(source, /Avatar Studio/)
  assert.match(source, /Avatar/)
  assert.match(source, /My Closet/)
  assert.match(source, /activeSection/)
  assert.match(source, /useState<AvatarStudioSectionId>\("closet"\)/)
  assert.match(source, /getAvatarStudioDefaultCategory\("closet"\)/)
})

test("wardrobe announces server save rejection instead of failing silently", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/screens/WardrobeV2Screen.tsx"),
    "utf8"
  )

  assert.match(source, /saveErrorMessage/)
  assert.match(source, /accessibilityRole="alert"/)
  assert.match(source, /accessibilityLiveRegion="polite"/)
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
    hairId: "avatar_v2_hair_male_espresso_crop",
    topId: "avatar_v2_top_male_powder_blue_crew_tee",
    bottomId: "avatar_v2_bottom_male_navy_straight_pants",
    shoesId: "avatar_v2_shoes_male_milk_tea_court",
    accessoryIds: []
  })
})

test("female wearable thumbnails use a full square frame instead of a cropped rig canvas", () => {
  for (const type of ["top", "bottom", "shoes"] as const) {
    assert.deepEqual(
      getWardrobeThumbnailPresentation({
        type,
        isRigLayer: false,
        isSquareAsset: true
      }),
      {
        frame: "square",
        scale: 1,
        translateY: 0
      },
      `${type} thumbnails must show the complete square asset`
    )
  }
})

test("canonical canvas fallbacks keep the legacy fit profile", () => {
  assert.deepEqual(
    getWardrobeThumbnailPresentation({
      type: "top",
      isRigLayer: false,
      isSquareAsset: false
    }),
    {
      frame: "legacy",
      scale: 1,
      translateY: 0
    }
  )
})

test("equipped wardrobe slots resolve only the item worn in their category", () => {
  const top = getWardrobeEquippedSlotItem(
    AVATAR_V2_CATALOG,
    DEFAULT_AVATAR_V2,
    "top"
  )
  const bottom = getWardrobeEquippedSlotItem(
    AVATAR_V2_CATALOG,
    DEFAULT_AVATAR_V2,
    "bottom"
  )

  assert.equal(top?.id, DEFAULT_AVATAR_V2.topId)
  assert.equal(bottom?.id, DEFAULT_AVATAR_V2.bottomId)
  assert.notEqual(top?.id, bottom?.id)
  assert.deepEqual(
    WARDROBE_EQUIPPED_SLOTS.map((slot) => slot.id),
    ["hair", "top", "bottom", "shoes", "accessory"]
  )
})

test("horizontal wardrobe progress clamps and handles non-scrollable content", () => {
  assert.equal(getWardrobeCarouselProgress(0, 640, 320), 0)
  assert.equal(getWardrobeCarouselProgress(160, 640, 320), 0.5)
  assert.equal(getWardrobeCarouselProgress(320, 640, 320), 1)
  assert.equal(getWardrobeCarouselProgress(900, 640, 320), 1)
  assert.equal(getWardrobeCarouselProgress(-20, 640, 320), 0)
  assert.equal(getWardrobeCarouselProgress(20, 280, 320), 1)
})

test("carousel relayout preserves the real scroll offset instead of resetting accessibility progress", () => {
  const actualOffsetX = 160
  assert.equal(getWardrobeCarouselProgress(actualOffsetX, 640, 320), 0.5)
  assert.equal(
    getWardrobeCarouselProgress(actualOffsetX, 640, 400),
    2 / 3,
    "a viewport relayout must recompute from the preserved native offset"
  )

  const source = readFileSync(
    resolve(process.cwd(), "src/screens/WardrobeV2Screen.tsx"),
    "utf8"
  )
  assert.match(source, /carouselOffsetXRef\.current/)
  assert.match(source, /getWardrobeCarouselProgress\(\s*carouselOffsetXRef\.current,/)
})

test("carousel indicator exposes honest thumb size and position", () => {
  assert.deepEqual(getWardrobeCarouselIndicator(0, 640, 320), {
    thumbFraction: 0.5,
    positionFraction: 0
  })
  assert.deepEqual(getWardrobeCarouselIndicator(160, 640, 320), {
    thumbFraction: 0.5,
    positionFraction: 0.5
  })
  assert.deepEqual(getWardrobeCarouselIndicator(320, 640, 320), {
    thumbFraction: 0.5,
    positionFraction: 1
  })
  assert.deepEqual(getWardrobeCarouselIndicator(10, 280, 320), {
    thumbFraction: 1,
    positionFraction: 0
  })
})

test("an equipped dress is represented by one atomic Look slot", () => {
  const dressTop = AVATAR_V2_CATALOG.find((item) =>
    item.type === "top" && Boolean(item.outfitKey)
  )
  assert.ok(dressTop?.pairedItemId)

  const dressed = {
    ...DEFAULT_AVATAR_V2,
    topId: dressTop.id,
    bottomId: dressTop.pairedItemId
  }
  const slots = getWardrobeVisibleSlots(AVATAR_V2_CATALOG, dressed)

  assert.deepEqual(slots.map((slot) => slot.id), [
    "hair",
    "look",
    "shoes",
    "accessory"
  ])
  assert.equal(slots.find((slot) => slot.id === "look")?.category, "dress")
  assert.equal(slots.find((slot) => slot.id === "look")?.item?.id, dressTop.id)
  assert.equal(slots.some((slot) => slot.id === "top" || slot.id === "bottom"), false)
  assert.deepEqual(
    getWardrobeSecondaryCategories(AVATAR_V2_CATALOG, dressed).slice(0, 2),
    [
      { id: "top", label: "Separates" },
      { id: "bottom", label: "Bottoms" }
    ]
  )
})

test("a regular outfit keeps independent Top and Bottom slots", () => {
  const slots = getWardrobeVisibleSlots(AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2)
  assert.deepEqual(slots.map((slot) => slot.id), [
    "hair",
    "top",
    "bottom",
    "shoes",
    "accessory"
  ])
  assert.equal(slots.find((slot) => slot.id === "top")?.category, "top")
  assert.equal(slots.find((slot) => slot.id === "bottom")?.category, "bottom")
})

test("the compact Extra slot honestly summarizes every equipped accessory", () => {
  const accessoryIds = AVATAR_V2_CATALOG
    .filter((item) => item.type === "accessory")
    .slice(0, 3)
    .map((item) => item.id)
  assert.equal(accessoryIds.length, 3)

  const slots = getWardrobeVisibleSlots(AVATAR_V2_CATALOG, {
    ...DEFAULT_AVATAR_V2,
    accessoryIds
  })
  const extra = slots.find((slot) => slot.id === "accessory")

  assert.equal(extra?.item?.id, accessoryIds[0])
  assert.equal(extra?.itemCount, 3)
  assert.equal(extra?.label, "Extras · 3")
  assert.equal(extra?.accessibilitySummary, `${extra?.item?.name} and 2 more`)
})

test("standard viewport stays fixed while short and large-text layouts scroll safely", () => {
  assert.equal(shouldUseWardrobeVerticalFallback(844, 1), false)
  assert.equal(shouldUseWardrobeVerticalFallback(759, 1), true)
  assert.equal(shouldUseWardrobeVerticalFallback(844, 1.16), true)
  assert.equal(shouldUseWardrobeSlotCompactLayout(1.29), false)
  assert.equal(shouldUseWardrobeSlotCompactLayout(1.3), true)
})

test("equipped slot previews enlarge transparent room layers by category", () => {
  assert.equal(getWardrobeEquippedSlotPreviewScale("hair"), 1.7)
  assert.equal(getWardrobeEquippedSlotPreviewScale("top"), 2.35)
  assert.equal(getWardrobeEquippedSlotPreviewScale("bottom"), 2.75)
  assert.equal(getWardrobeEquippedSlotPreviewScale("shoes"), 3.1)
  assert.equal(getWardrobeEquippedSlotPreviewScale("accessory"), 1.9)
  assert.equal(getWardrobeEquippedSlotPreviewScale("face"), 1)
})

test("horizontal wardrobe cards expose deterministic virtualization geometry", () => {
  assert.deepEqual(getWardrobeCarouselItemLayout(undefined, 0), {
    length: 148,
    offset: 20,
    index: 0
  })
  assert.deepEqual(getWardrobeCarouselItemLayout(undefined, 3), {
    length: 148,
    offset: 494,
    index: 3
  })
})
