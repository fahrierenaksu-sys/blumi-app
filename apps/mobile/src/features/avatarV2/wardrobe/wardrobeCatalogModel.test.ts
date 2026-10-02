import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { getShopThumbnailLayout } from "../../shop/shopThumbnailLayout"
import { getWardrobeThumbnailPresentation } from "../wardrobeThumbnailPresentation"

test("female and male previews centre visible pixels inside narrow and wide cards on first render", () => {
  const cardSource = readFileSync(new URL("./WardrobeCatalogCard.tsx", import.meta.url), "utf8")
  const boundsById = JSON.parse(readFileSync(new URL("../../shop/shopThumbnailBounds.json", import.meta.url), "utf8"))
  const samples = [
    ["avatar_v2_hair_male_espresso_crop", "hair"],
    ["avatar_v2_hair_male_cocoa_textured_quiff", "hair"],
    ["avatar_v2_top_male_cream_basic_tee", "top"],
    ["avatar_v2_bottom_male_navy_straight_pants", "bottom"],
    ["avatar_v2_shoes_male_cloud_white_trainers", "shoes"],
    ["avatar_v2_hair_ink_pageboy_star", "hair"],
    ["avatar_v2_eyes_mocha_doe", "eyes"],
    ["avatar_v2_nose_soft_button", "nose"],
    ["avatar_v2_mouth_peach_whisper_smile", "mouth"],
    ["avatar_v2_face_warm_peach_foundation", "face"]
  ]
  const jsx = (type: unknown, props: any) => ({ type, props })
  const flatten = (style: any) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  const module = { exports: {} as any }
  runInNewContext(ts.transpileModule(cardSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    module, exports: module.exports,
    require: () => ({
      jsx, jsxs: jsx, memo: (component: unknown) => component,
      Image: "Image", View: "View", Pressable: "Pressable", Text: "Text",
      getShopProductThumbnailBounds: (id: string) => boundsById[id],
      getShopThumbnailLayout, getWardrobeThumbnailPresentation,
      getGarmentThumbnailOverride: () => undefined,
      getStarterLayerThumbnail: () => undefined,
      getAvatarItemPreviewImageStyle: () => ({ width: 100, height: 100 }),
      getMaleRigLayerThumbnailPresentation: () => ({ top: 44.5, scale: 3.2 }),
      MALE_CAPSULE_PREVIEW_SOURCES: Object.fromEntries(samples.filter(([id]) => id.includes("_male_")).map(([id]) => [id, 1])),
      WARDROBE_SQUARE_THUMBNAIL_SOURCES: {},
      getAvatarAutomationSlug: (id: string) => id,
      WARDROBE_ART_ASPECT: 0.82, WARDROBE_THUMB_BOX: { width: 100, height: 68 },
      CATEGORY_ICONS: {}, wardrobeTheme: {},
      wardrobeV2Styles: {
        itemPreviewRigLayer: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
        itemPreviewFeaturePortrait: { position: "absolute", top: 0, width: 116, height: 116 },
        itemPreviewSquare: { width: "100%", height: "100%" }
      }
    })
  })
  for (const width of [80, 110, 145]) {
    for (const [id, type] of samples) {
      const tree = module.exports.WardrobeCatalogCard({
        item: { id, type, name: type }, width, previewSource: 1,
        equipped: false, locked: false, previewing: false
      })
      const box = tree.props.children[0].props.children[0]
      assert.equal(box.type, "View", `${id} must have a fitted viewport`)
      const viewport = flatten(box.props.style)
      const image = flatten(box.props.children.props.style)
      assert.equal(image.transform, undefined, `${id} must not apply a second scale/offset`)
      assert.ok(viewport.width <= width - 3)
      assert.ok(viewport.height <= Math.round(width * 0.82) - 3)
      const [canvasWidth, , x, y, visibleWidth, visibleHeight] = boundsById[id]
      const scale = image.width / canvasWidth
      const left = image.left + x * scale
      const top = image.top + y * scale
      assert.ok(left >= 6 - 1e-6 && top >= 6 - 1e-6, `${id} must not clip`)
      assert.ok(Math.abs(left + visibleWidth * scale / 2 - viewport.width / 2) < 1e-6)
      assert.ok(Math.abs(top + visibleHeight * scale / 2 - viewport.height / 2) < 1e-6)
    }
  }
})

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
  buildWardrobeShopLink,
  getStarterLayerThumbnail,
  getWardrobeActiveItems,
  isAvatarItemRoomPreviewSupported
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

test("starter garments previewed from their room layer are fitted by measured bounds", () => {
  for (const id of ["avatar_v2_top_default", "avatar_v2_bottom_default"]) {
    const fit = getStarterLayerThumbnail(id)
    assert.ok(fit, id)
    assert.equal(fit.bounds.length, 6)
    assert.deepEqual(fit.bounds.slice(0, 2), [256, 384])
    assert.ok(fit.box.width <= 100 && fit.box.height <= 68, "fits the card art box")
  }
  assert.equal(getStarterLayerThumbnail("avatar_v2_hair_mocha_ribbon_blowout"), undefined)
})

test("locked items the Shop sells stay visible after the owned ones (owner decision, MICRO-3)", () => {
  const owned = new Set(
    AVATAR_V2_CATALOG.filter((item) => item.ownedByDefault === true).map((item) => item.id)
  )
  const canEquipItem = (item: (typeof AVATAR_V2_CATALOG)[number]) =>
    canEquipAvatarV2Item({ ownedItemIds: [...owned] }, item, DEFAULT_AVATAR_V2.bodyId)
  const soldInShop = (item: (typeof AVATAR_V2_CATALOG)[number]) => !owned.has(item.id)
  for (const category of ["hair", "top", "shoes"] as const) {
    const items = getWardrobeActiveItems({
      catalog: AVATAR_V2_CATALOG,
      category,
      bodyId: DEFAULT_AVATAR_V2.bodyId,
      canEquipItem,
      isAvailableInShop: soldInShop
    })
    const ownedOnly = getWardrobeActiveItems({
      catalog: AVATAR_V2_CATALOG,
      category,
      bodyId: DEFAULT_AVATAR_V2.bodyId,
      canEquipItem
    })
    assert.ok(items.length > ownedOnly.length, `${category} shows locked Shop items`)
    const firstLocked = items.findIndex((item) => !canEquipItem(item))
    assert.ok(firstLocked >= ownedOnly.length, "owned items come first")
    assert.ok(items.slice(firstLocked).every((item) => !canEquipItem(item)))
    for (const item of items) {
      assert.equal(isAvatarItemRoomPreviewSupported(item), true, item.id)
    }
  }
  const nothingListed = getWardrobeActiveItems({
    catalog: AVATAR_V2_CATALOG,
    category: "hair",
    bodyId: DEFAULT_AVATAR_V2.bodyId,
    canEquipItem,
    isAvailableInShop: () => false
  })
  assert.ok(nothingListed.every((item) => canEquipItem(item)), "unlisted, unowned items stay hidden")
})

test("See in Shop links carry the item's canonical id and a fresh request", () => {
  const item = AVATAR_V2_CATALOG.find((entry) => entry.type === "hair")!
  assert.deepEqual(buildWardrobeShopLink(item, 7), {
    initialShopMode: "avatar",
    focusProductId: item.id,
    focusRequestId: 7
  })
})

test("locked cards read as Shop items in the app language and mark the one being previewed", () => {
  const hair = getWardrobeActiveItems({
    catalog: AVATAR_V2_CATALOG,
    category: "hair",
    bodyId: DEFAULT_AVATAR_V2.bodyId,
    canEquipItem: () => true
  })
  for (const locale of ["en", "tr"] as const) {
    const cards = buildWardrobeCards({
      items: hair,
      avatar: DEFAULT_AVATAR_V2,
      displayedAvatar: DEFAULT_AVATAR_V2,
      inventory: ownNothing,
      canEquipItem: () => false,
      copy: AVATAR_STUDIO_COPY[locale],
      getPreviewSource: () => undefined,
      previewingItemId: hair[0].id
    })
    assert.ok(cards.every((card) => card.locked && card.itemStateLabel === AVATAR_STUDIO_COPY[locale].lockedInShop))
    assert.equal(cards[0].previewing, true)
    assert.ok(cards.slice(1).every((card) => !card.previewing))
  }
  const ownedCards = buildWardrobeCards({
    items: hair,
    avatar: DEFAULT_AVATAR_V2,
    displayedAvatar: DEFAULT_AVATAR_V2,
    inventory: ownAll,
    canEquipItem: () => true,
    copy,
    getPreviewSource: () => undefined,
    previewingItemId: hair[0].id
  })
  assert.equal(ownedCards[0].previewing, false, "only locked items are previewed without saving")
})
