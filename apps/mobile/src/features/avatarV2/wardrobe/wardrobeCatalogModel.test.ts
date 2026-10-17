import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync, statSync } from "node:fs"
import { RETIRED_AVATAR_ITEM_IDS } from "@blumi/domain"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { getShopThumbnailLayout } from "../../shop/shopThumbnailLayout"

test("default feature portraits centre their visible pixels inside narrow and wide cards on first render", () => {
  const cardSource = readFileSync(new URL("./WardrobeCatalogCard.tsx", import.meta.url), "utf8")
  const samples = [
    ["avatar_v2_eyes_mocha_doe", "eyes"],
    ["avatar_v2_nose_soft_button", "nose"],
    ["avatar_v2_mouth_peach_whisper_smile", "mouth"]
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
      getShopThumbnailLayout, getAvatarItemPreviewBounds, isAvatarItemCutoutPreview,
      getAvatarAutomationSlug: (id: string) => id,
      WARDROBE_ART_ASPECT: 0.82,
      CATEGORY_ICONS: {}, wardrobeTheme: {},
      wardrobeV2Styles: {
        itemPreviewFeaturePortrait: { position: "absolute", top: 0, width: 116, height: 116 },
        itemPreviewSquare: { width: "100%", height: "100%" }
      }
    })
  })
  for (const width of [80, 110, 145]) {
    for (const [id, type] of samples) {
      const bounds = getAvatarItemPreviewBounds({ id })
      assert.ok(bounds, `${id} has measured bounds`)
      const tree = module.exports.WardrobeCatalogCard({
        item: { id, type, name: type }, name: type, width, previewSource: getAvatarItemPreviewSource({ id }),
        equipped: false, locked: false, previewing: false
      })
      const box = tree.props.children[0].props.children[0]
      assert.equal(box.type, "View", `${id} must have a fitted viewport`)
      const viewport = flatten(box.props.style)
      const image = flatten(box.props.children.props.style)
      assert.equal(image.transform, undefined, `${id} must not apply a second scale/offset`)
      assert.ok(viewport.width <= width - 3)
      assert.ok(viewport.height <= Math.round(width * 0.82) - 3)
      const [canvasWidth, , x, y, visibleWidth, visibleHeight] = bounds
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
  getWardrobeActiveItems,
  isAvatarItemRoomPreviewSupported
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./wardrobeCatalogModel") as typeof import("./wardrobeCatalogModel")
const {
  AVATAR_STUDIO_COPY
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./wardrobeCopy") as typeof import("./wardrobeCopy")

const copy = AVATAR_STUDIO_COPY.en
const { getAvatarItemPreviewBounds, getAvatarItemPreviewSource, isAvatarItemCutoutPreview
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./wardrobePreviewSources") as typeof import("./wardrobePreviewSources")
const { getAvatarItemDisplayName
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../avatarItemDisplayNames") as typeof import("../avatarItemDisplayNames")
// Plan X15 retired every old paid piece, so the locked-card tests add one paid fixture piece per slot to the live
// catalog. They are wearable on the girl, not owned by default, and have no room art, so the tests say they preview.
const PAID_FIXTURE_ITEMS = (["hair", "top", "shoes"] as const).map((type, index) => ({
  id: `fixture_wardrobe_${type}_paid`,
  type,
  name: `Fixture paid ${type}`,
  sortOrder: 9000 + index,
  layerOrder: 10,
  assets: {},
  compatibleBodyIds: [DEFAULT_AVATAR_V2.bodyId]
})) as unknown as typeof AVATAR_V2_CATALOG
const WARDROBE_FIXTURE_CATALOG = [...AVATAR_V2_CATALOG, ...PAID_FIXTURE_ITEMS]
const isFixturePreviewSupported = (item: (typeof AVATAR_V2_CATALOG)[number]) =>
  PAID_FIXTURE_ITEMS.some((fixture) => fixture.id === item.id) || isAvatarItemRoomPreviewSupported(item)
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
    catalog: WARDROBE_FIXTURE_CATALOG,
    category: "hair",
    bodyId: DEFAULT_AVATAR_V2.bodyId,
    canEquipItem: () => true,
    isPreviewSupported: isFixturePreviewSupported
  })
  const target = hair[hair.length - 1]
  const displayedAvatar = equipAvatarV2Item(DEFAULT_AVATAR_V2, target)
  const source = { uri: "preview" }
  const cards = buildWardrobeCards({
    items: hair,
    displayedAvatar,
    canEquipItem: () => true,
    copy,
    getPreviewSource: () => source,
    isPreviewSupported: isFixturePreviewSupported
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
    displayedAvatar: DEFAULT_AVATAR_V2,
    canEquipItem: () => false,
    copy,
    getPreviewSource: () => undefined,
    isPreviewSupported: isFixturePreviewSupported
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
    displayedAvatar: DEFAULT_AVATAR_V2,
    canEquipItem: () => true,
    copy,
    getPreviewSource: () => undefined
  })
  assert.ok(cards.length > 0)
  for (const card of cards) {
    assert.equal(card.itemStateLabel, copy.switchBase)
  }
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
      catalog: WARDROBE_FIXTURE_CATALOG,
      category,
      bodyId: DEFAULT_AVATAR_V2.bodyId,
      canEquipItem,
      isAvailableInShop: soldInShop,
      isPreviewSupported: isFixturePreviewSupported
    })
    const ownedOnly = getWardrobeActiveItems({
      catalog: WARDROBE_FIXTURE_CATALOG,
      category,
      bodyId: DEFAULT_AVATAR_V2.bodyId,
      canEquipItem,
      isPreviewSupported: isFixturePreviewSupported
    })
    assert.ok(items.length > ownedOnly.length, `${category} shows locked Shop items`)
    const firstLocked = items.findIndex((item) => !canEquipItem(item))
    assert.ok(firstLocked >= ownedOnly.length, "owned items come first")
    assert.ok(items.slice(firstLocked).every((item) => !canEquipItem(item)))
    for (const item of items) {
      assert.equal(isFixturePreviewSupported(item), true, item.id)
    }
  }
  const nothingListed = getWardrobeActiveItems({
    catalog: WARDROBE_FIXTURE_CATALOG,
    category: "hair",
    bodyId: DEFAULT_AVATAR_V2.bodyId,
    canEquipItem,
    isAvailableInShop: () => false,
    isPreviewSupported: isFixturePreviewSupported
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
      displayedAvatar: DEFAULT_AVATAR_V2,
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
    displayedAvatar: DEFAULT_AVATAR_V2,
    canEquipItem: () => true,
    copy,
    getPreviewSource: () => undefined,
    previewingItemId: hair[0].id
  })
  assert.equal(ownedCards[0].previewing, false, "only locked items are previewed without saving")
})

// Beta-2 smoke: the boy's 2.5D thumbnails are whole-garment cutouts. Shifted like the old 256x384 room layers, every
// shoe card was blank and tops/bottoms showed only a hem. Each card must contain its whole garment, unshifted.
const LIVE_WARDROBE_ITEMS = AVATAR_V2_CATALOG.filter((item) =>
  !RETIRED_AVATAR_ITEM_IDS.has(item.id) && !item.hiddenFromWardrobe)
const BOY_PIECES = LIVE_WARDROBE_ITEMS.filter((item) =>
  (item.compatibleBodyIds ?? []).includes("avatar_v2_body_male_light") &&
  ["hair", "top", "bottom", "shoes"].includes(item.type))

function renderCardWithLivePreview(item: (typeof AVATAR_V2_CATALOG)[number], width: number) {
  const cardSource = readFileSync(new URL("./WardrobeCatalogCard.tsx", import.meta.url), "utf8")
  const jsx = (type: unknown, props: any) => ({ type, props })
  const module = { exports: {} as any }
  runInNewContext(ts.transpileModule(cardSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    module, exports: module.exports,
    require: () => ({
      jsx, jsxs: jsx, memo: (component: unknown) => component,
      Image: "Image", View: "View", Pressable: "Pressable", Text: "Text",
      getShopThumbnailLayout, getAvatarItemPreviewBounds, isAvatarItemCutoutPreview,
      getAvatarAutomationSlug: (id: string) => id,
      WARDROBE_ART_ASPECT: 0.82,
      CATEGORY_ICONS: {}, wardrobeTheme: {},
      wardrobeV2Styles: { itemThumbBox: {}, itemPreviewSquare: { width: "100%", height: "100%" } }
    })
  })
  return module.exports.WardrobeCatalogCard({
    item, name: item.name, width, previewSource: getAvatarItemPreviewSource(item),
    equipped: false, locked: false, previewing: false
  })
}

test("every boy wardrobe piece card shows a real picture of the whole garment", () => {
  assert.ok(BOY_PIECES.length > 0, "the guard scanned the boy wardrobe")
  for (const item of BOY_PIECES) {
    const source = getAvatarItemPreviewSource(item)
    assert.equal(typeof source, "string", `${item.id} has no card picture`)
    assert.ok(statSync(source as unknown as string).size > 1024, `${item.id} card picture is empty`)
    assert.ok(isAvatarItemCutoutPreview(item), `${item.id} must be framed as a whole-garment cutout`)
  }
  const flatten = (style: any) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
  for (const width of [80, 97, 110, 145]) {
    const artHeight = Math.round(width * 0.82)
    for (const item of BOY_PIECES) {
      const art = renderCardWithLivePreview(item, width).props.children[0]
      const box = art.props.children[0]
      assert.equal(box.type, "View", `${item.id} must be fitted in a box`)
      const viewport = flatten(box.props.style)
      assert.ok(viewport.width > 0 && viewport.width <= width - 3, `${item.id} box is wider than the card`)
      assert.ok(viewport.height > 0 && viewport.height <= artHeight - 3, `${item.id} box is taller than the art`)
      const image = box.props.children
      assert.equal(image.props.contentFit, "contain", `${item.id} must contain the whole garment`)
      const style = flatten(image.props.style)
      assert.equal(style.transform, undefined, `${item.id} must not be shifted out of its box`)
      assert.equal(style.width, "100%")
      assert.equal(style.height, "100%")
    }
  }
})

/** Greedy word wrap at the card's narrowest line (a 97pt card on a 375pt phone fits about 13 characters). */
const WARDROBE_NAME_LINE_CHARS = 13
const wrapName = (name: string) => name.split(" ").reduce<string[]>((lines, word) => {
  const last = lines.at(-1)
  return last !== undefined && `${last} ${word}`.length <= WARDROBE_NAME_LINE_CHARS
    ? [...lines.slice(0, -1), `${last} ${word}`]
    : [...lines, word]
}, [])

test("every visible wardrobe piece has a Turkish name that fits the card's two lines", () => {
  const seen = new Set<string>()
  for (const item of LIVE_WARDROBE_ITEMS) {
    const name = getAvatarItemDisplayName(item, "tr")
    assert.notEqual(name, item.name, `${item.id} has no Turkish name`)
    const lines = wrapName(name)
    assert.ok(lines.length <= 2 && lines.every((line) => line.length <= WARDROBE_NAME_LINE_CHARS),
      `${item.id}: "${name}" does not fit two card lines`)
    assert.ok(!seen.has(`${item.type}:${name}`), `${item.id}: "${name}" repeats another piece's name`)
    seen.add(`${item.type}:${name}`)
    assert.equal(getAvatarItemDisplayName(item, "en"), item.name)
  }
  const cards = buildWardrobeCards({
    items: BOY_PIECES,
    displayedAvatar: DEFAULT_AVATAR_V2,
    canEquipItem: () => true,
    copy: AVATAR_STUDIO_COPY.tr,
    locale: "tr",
    getPreviewSource: () => undefined,
    isPreviewSupported: () => true
  })
  assert.ok(cards.every((card) => card.name === getAvatarItemDisplayName(card.item, "tr")))
  assert.equal(cards.find((card) => card.item.id === "avatar_v2_shoes_male_tan_loafers")?.name, "Taba Loafer")
})
