import assert from "node:assert/strict"
import test from "node:test"

for (const extension of [".png", ".webp", ".jpg", ".jpeg"]) {
  require.extensions[extension] = (module, filename) => {
    module.exports = filename
  }
}

const {
  AVATAR_V2_CATALOG,
  DEFAULT_AVATAR_V2
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../avatarV2Catalog") as typeof import("../avatarV2Catalog")
const {
  canEquipAvatarV2Item,
  equipAvatarV2Item
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../avatarV2Selectors") as typeof import("../avatarV2Selectors")
const {
  buildWardrobeCards,
  getAvatarItemPreviewImageStyle,
  getWardrobeActiveItems,
  isAvatarItemRoomPreviewSupported,
  resolveWardrobeEquippedLabel,
  sortWardrobeItemsEquippedFirst
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./wardrobeCatalogModel") as typeof import("./wardrobeCatalogModel")
const {
  AVATAR_STUDIO_COPY
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./wardrobeCopy") as typeof import("./wardrobeCopy")

const copy = AVATAR_STUDIO_COPY.en
const ownAll = { ownedItemIds: AVATAR_V2_CATALOG.map((item) => item.id) }
const ownNothing = { ownedItemIds: [] as string[] }

test("active items keep only body-compatible, room-supported, equippable entries", () => {
  const canEquipItem = (item: (typeof AVATAR_V2_CATALOG)[number]) =>
    canEquipAvatarV2Item(ownAll, item, DEFAULT_AVATAR_V2.bodyId)
  for (const category of ["hair", "top", "shoes", "accessory"] as const) {
    const items = getWardrobeActiveItems({
      catalog: AVATAR_V2_CATALOG,
      category,
      bodyId: DEFAULT_AVATAR_V2.bodyId,
      canEquipItem
    })
    for (const item of items) {
      assert.equal(isAvatarItemRoomPreviewSupported(item), true, item.id)
      assert.equal(canEquipItem(item), true, item.id)
    }
  }
  const noneOwned = getWardrobeActiveItems({
    catalog: AVATAR_V2_CATALOG,
    category: "hair",
    bodyId: DEFAULT_AVATAR_V2.bodyId,
    canEquipItem: (item) => canEquipAvatarV2Item(ownNothing, item, DEFAULT_AVATAR_V2.bodyId)
  })
  assert.ok(noneOwned.every((item) => item.ownedByDefault === true))
})

test("equipped items sort first and the rest keep their order", () => {
  const hair = getWardrobeActiveItems({
    catalog: AVATAR_V2_CATALOG,
    category: "hair",
    bodyId: DEFAULT_AVATAR_V2.bodyId,
    canEquipItem: () => true
  })
  assert.ok(hair.length >= 2)
  const target = hair[hair.length - 1]
  const avatar = equipAvatarV2Item(DEFAULT_AVATAR_V2, target)
  const sorted = sortWardrobeItemsEquippedFirst(hair, avatar)
  assert.equal(sorted[0].id, target.id)
  assert.deepEqual(
    sorted.slice(1).map((item) => item.id),
    hair.filter((item) => item.id !== target.id).map((item) => item.id)
  )
  assert.notEqual(sorted, hair)
})

test("equipped label names the equipped item or asks to choose", () => {
  const hair = getWardrobeActiveItems({
    catalog: AVATAR_V2_CATALOG,
    category: "hair",
    bodyId: DEFAULT_AVATAR_V2.bodyId,
    canEquipItem: () => true
  })
  assert.equal(
    resolveWardrobeEquippedLabel({
      items: [],
      displayedAvatar: DEFAULT_AVATAR_V2,
      categoryLabel: "Hair",
      copy
    }),
    "Choose: Hair"
  )
  const target = hair[hair.length - 1]
  assert.equal(
    resolveWardrobeEquippedLabel({
      items: hair,
      displayedAvatar: equipAvatarV2Item(DEFAULT_AVATAR_V2, target),
      categoryLabel: "Hair",
      copy
    }),
    `${target.name} equipped`
  )
})

test("cards resolve state labels, lock state, and preview source per item", () => {
  const hair = getWardrobeActiveItems({
    catalog: AVATAR_V2_CATALOG,
    category: "hair",
    bodyId: DEFAULT_AVATAR_V2.bodyId,
    canEquipItem: () => true
  })
  const target = hair[hair.length - 1]
  const displayedAvatar = equipAvatarV2Item(DEFAULT_AVATAR_V2, target)
  const source = { uri: "preview" }
  const cards = buildWardrobeCards({
    items: hair,
    avatar: DEFAULT_AVATAR_V2,
    displayedAvatar,
    inventory: ownAll,
    canEquipItem: () => true,
    copy,
    getPreviewSource: () => source
  })
  assert.equal(cards.length, hair.length)
  const targetCard = cards.find((card) => card.item.id === target.id)
  assert.equal(targetCard?.equipped, true)
  assert.equal(targetCard?.locked, false)
  assert.equal(targetCard?.previewSource, source)
  const other = cards.find((card) => card.item.id !== target.id)
  assert.equal(other?.equipped, false)
  assert.equal(other?.itemStateLabel, other?.item.outfitKey ? copy.fullLook : copy.tryOn)

  const locked = buildWardrobeCards({
    items: hair,
    avatar: DEFAULT_AVATAR_V2,
    displayedAvatar: DEFAULT_AVATAR_V2,
    inventory: ownNothing,
    canEquipItem: () => false,
    copy,
    getPreviewSource: () => undefined
  })
  assert.ok(locked.every((card) => card.locked && !card.previewSource))
})

test("body cards read as base switches", () => {
  const bodies = getWardrobeActiveItems({
    catalog: AVATAR_V2_CATALOG,
    category: "body",
    bodyId: DEFAULT_AVATAR_V2.bodyId,
    canEquipItem: () => true
  })
  const cards = buildWardrobeCards({
    items: bodies,
    avatar: DEFAULT_AVATAR_V2,
    displayedAvatar: DEFAULT_AVATAR_V2,
    inventory: ownAll,
    canEquipItem: () => true,
    copy,
    getPreviewSource: () => undefined
  })
  assert.ok(cards.length > 0)
  for (const card of cards) {
    assert.equal(card.itemStateLabel, copy.switchBase)
  }
})

test("legacy preview image styles keep their per-type frames", () => {
  const style = (id: string, type: string) =>
    getAvatarItemPreviewImageStyle({ id, type } as never)
  assert.deepEqual(style("avatar_v2_top_default", "top"), {
    width: 170, height: 255, transform: [{ translateY: -24 }]
  })
  assert.deepEqual(style("avatar_v2_top_cream_basic_tee", "top"), {
    width: 170, height: 255, transform: [{ translateY: -24 }]
  })
  assert.deepEqual(style("other-top", "top"), {
    width: 178, height: 267, transform: [{ translateY: -60 }]
  })
  assert.deepEqual(style("b", "bottom"), {
    width: 196, height: 294, transform: [{ translateY: -116 }]
  })
  assert.deepEqual(style("s", "shoes"), {
    width: 196, height: 294, transform: [{ translateY: -130 }]
  })
  assert.deepEqual(style("h", "hair"), {
    width: 100, height: 100, transform: [{ translateY: 0 }]
  })
  for (const type of ["eyes", "nose", "mouth"]) {
    assert.deepEqual(style("f", type), {
      width: 172, height: 172, transform: [{ translateY: -8 }]
    })
  }
  assert.deepEqual(style("a", "accessory"), {
    width: 142, height: 213, transform: [{ translateY: -32 }]
  })
})
