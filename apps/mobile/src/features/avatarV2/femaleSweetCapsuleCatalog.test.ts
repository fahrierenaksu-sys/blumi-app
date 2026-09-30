import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { isRetiredAvatarItemId } from "@blumi/domain"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { AVATAR_V2_CATALOG } = require("./avatarV2Catalog") as typeof import("./avatarV2Catalog")
type CoralLoadoutCatalogItem = {
  itemId: string
  slot: "top" | "bottom" | "shoes"
  supportedBodyIds: string[]
  outfitKey?: string
  pairedItemId?: string
}
type CoralEconomyCatalogItem = {
  itemId: string
  type: string
  title: string
  priceCoins: number
  ownedByDefault?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- The avatar test runner builds @blumi/domain before compiling tests into its isolated src-only directory.
const { AVATAR_LOADOUT_CATALOG, ECONOMY_CATALOG } = require("@blumi/domain") as {
  AVATAR_LOADOUT_CATALOG: CoralLoadoutCatalogItem[]
  ECONOMY_CATALOG: CoralEconomyCatalogItem[]
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep the test aligned with the authored capsule catalog.
const { FEMALE_SWEET_CAPSULE_LAYERS } = require("./femaleSweetCapsuleDefinitions") as typeof import("./femaleSweetCapsuleDefinitions")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { ROOM_AVATAR_CATALOG } = require("./room/avatarRoomCatalog") as typeof import("./room/avatarRoomCatalog")
const {
  FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./femaleSweetCapsulePreviewSources") as typeof import("./femaleSweetCapsulePreviewSources")

const workspaceRoot = process.cwd()
const assetRoot = join(workspaceRoot, "src/features/avatarV2/assets")
const motionStates = [
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01"
] as const

const tops = [
  "rosebud_picnic_peplum",
  "lilac_cloud_wrap_top",
  "buttercream_bow_tee",
  "azure_garden_halter",
  "ivory_tweed_crop_jacket",
  "cherry_varsity_cardigan",
  "midnight_velvet_bolero"
] as const

const bottoms = [
  { slug: "midnight_ribbon_wide_leg_pants", occlusionRole: "bottomOverShoeUpper" },
  { slug: "buttercream_pearl_tailored_pants", occlusionRole: "bottomOverShoeUpper" },
  { slug: "rose_picnic_pleated_shorts", occlusionRole: "bottomBehindShoes" },
  { slug: "lavender_bow_twill_shorts", occlusionRole: "bottomBehindShoes" }
] as const

const shoes = [
  "rose_satin_bow_heels",
  "ivory_pearl_slingback_heels",
  "lilac_star_platform_sneakers",
  "mint_ribbon_court_sneakers"
] as const

const dresses = [
  "rose_ribbon_tea_dress",
  "moonlit_velvet_ballet_dress",
  "buttercup_picnic_pinafore_dress",
  "lavender_garden_ribbon_dress"
] as const

const assetPath = (kind: "top" | "bottom" | "shoes", slug: string, state?: string) => (
  state
    ? join(assetRoot, "room", "motion", `room_avatar_${kind}_female_${slug}_v2_${state}.png`)
    : join(assetRoot, "room", `avatar_room_${kind}_female_${slug}_v2.png`)
)

const visibleWearables = [
  ...tops.map((slug) => ({ kind: "top" as const, slug })),
  ...bottoms.map(({ slug }) => ({ kind: "bottom" as const, slug })),
  ...shoes.map((slug) => ({ kind: "shoes" as const, slug })),
  ...dresses.map((slug) => ({ kind: "top" as const, slug }))
]

const everyLayer = [
  ...visibleWearables,
  ...dresses.map((slug) => ({ kind: "bottom" as const, slug }))
]

test("active female capsule is complete while retired products stay hidden under stable IDs", () => {
  assert.equal(tops.length, 7, "four tops plus three jackets")
  assert.equal(bottoms.length, 4, "two trousers plus two shorts")
  assert.equal(shoes.length, 4, "two heels plus two sneakers")
  assert.equal(dresses.length, 4, "four complete dress looks")

  const economyCatalog = readFileSync(
    join(workspaceRoot, "../../packages/domain/src/economy/economyCatalog.ts"),
    "utf8"
  )
  const capsuleDefinitions = readFileSync(
    join(workspaceRoot, "src/features/avatarV2/femaleSweetCapsuleDefinitions.ts"),
    "utf8"
  )

  // The legacy asset slug remains stable, but the public-facing art direction
  // must be identical in wardrobe and economy surfaces.
  assert.match(capsuleDefinitions, /cherry_varsity_cardigan", "Cherry Picnic Cardigan"/)
  assert.doesNotMatch(capsuleDefinitions, /cherry_varsity_cardigan", "Cherry Varsity Cardigan"/)
  assert.match(economyCatalog, /avatar_v2_top_cherry_varsity_cardigan", "Cherry Picnic Cardigan"/)
  assert.doesNotMatch(economyCatalog, /avatar_v2_top_cherry_varsity_cardigan", "Cherry Varsity Cardigan"/)

  for (const { kind, slug } of visibleWearables) {
    const avatarId = `avatar_v2_${kind}_${slug}`
    const roomId = `room_avatar_${kind}_female_${slug}_v2`
    const roomSlot = kind === "top" ? "topId" : kind === "bottom" ? "bottomId" : "shoesId"
    const item = AVATAR_V2_CATALOG.find((candidate) => candidate.id === avatarId)
    const roomItem = ROOM_AVATAR_CATALOG.find((candidate) => candidate.id === roomId)

    assert.ok(item, avatarId)
    assert.ok(roomItem, roomId)
    assert.equal(DEFAULT_AVATAR_ROOM_PROJECTION_MAP[avatarId]?.[roomSlot], roomId)
    assert.equal(roomItem.rigId, "blumi_2_5d_layered_v1", roomId)
    assert.equal(roomItem.fitProfileId, "blumi_female_room_avatar_v1", roomId)
    assert.ok(roomItem.assetsByMotion?.walking?.front, `${roomId} walking`)
    assert.ok(roomItem.assetsByMotion?.sitting?.front, `${roomId} sitting`)
    assert.match(economyCatalog, new RegExp(`avatarItem\\(\\s*"${avatarId}"`), avatarId)
    const retired = isRetiredAvatarItemId(avatarId)
    assert.equal(item.hiddenFromShop === true, retired, `${avatarId} shop availability`)
    assert.equal(item.hiddenFromWardrobe === true, retired, `${avatarId} wardrobe availability`)
    if (retired) continue
    assert.equal(existsSync(join(assetRoot, "layers", `avatar_${kind}_${slug}.png`)), !retired, `${avatarId} profile layer`)
    assert.equal(existsSync(join(assetRoot, "shop-thumbnails", `${avatarId}.png`)), !retired, `${avatarId} thumbnail`)
    assert.ok(FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES[avatarId], `${avatarId} square thumbnail map`)
  }

  for (const { kind, slug } of everyLayer) {
    const roomId = `room_avatar_${kind}_female_${slug}_v2`
    const retired = isRetiredAvatarItemId(`avatar_v2_${kind}_${slug}`)
    if (retired) continue
    assert.equal(existsSync(assetPath(kind, slug)), true, `${roomId} static`)
    for (const state of motionStates) {
      assert.equal(existsSync(assetPath(kind, slug, state)), true, `${roomId} ${state}`)
    }
  }

  for (const { slug, occlusionRole } of bottoms) {
    const roomItem = ROOM_AVATAR_CATALOG.find(
      (candidate) => candidate.id === `room_avatar_bottom_female_${slug}_v2`
    )
    assert.equal(roomItem?.occlusionRole, occlusionRole, `${slug} occlusion role`)
  }

  for (const slug of dresses) {
    const topId = `avatar_v2_top_${slug}`
    const bottomId = `avatar_v2_bottom_${slug}`
    const dressTop = AVATAR_V2_CATALOG.find((candidate) => candidate.id === topId)
    const dressBottom = AVATAR_V2_CATALOG.find((candidate) => candidate.id === bottomId)
    assert.equal(dressTop?.pairedItemId, bottomId, `${slug} atomic top pair`)
    assert.equal(dressTop?.outfitKey, slug, `${slug} top outfit key`)
    assert.equal(dressBottom?.outfitKey, slug, `${slug} bottom outfit key`)
    assert.equal(dressBottom?.hiddenFromShop, true, `${slug} hidden bottom shop row`)
    assert.equal(dressBottom?.hiddenFromWardrobe, true, `${slug} hidden bottom wardrobe row`)
  }
})

test("female sweet capsule is visible through both wardrobe and shop thumbnail surfaces", () => {
  const wardrobeSource = [
    "src/screens/WardrobeV2Screen.tsx",
    "src/features/avatarV2/wardrobe/wardrobePreviewSources.ts"
  ].map((file) => readFileSync(join(workspaceRoot, file), "utf8")).join("\n")
  const shopScreenSource = readFileSync(
    join(workspaceRoot, "src/screens/CosmeticShopScreen.tsx"),
    "utf8"
  )
  const shopAssetsSource = readFileSync(
    join(workspaceRoot, "src/features/shop/shopAssets.ts"),
    "utf8"
  )

  for (const source of [wardrobeSource, shopAssetsSource]) {
    assert.match(source, /FEMALE_SWEET_CAPSULE_RIG_PREVIEW_SOURCES/)
    assert.match(source, /FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES/)
  }
  assert.match(shopScreenSource, /from "\.\.\/features\/shop\/shopAssets"/)
})

test("Coral Wave is listed as three independent paid female capsule layers", () => {
  const expectedLayers = [
    { kind: "top", slug: "coral_wave_polo", name: "Coral Wave Polo", priceCoins: 80 },
    { kind: "bottom", slug: "coral_wave_pants", name: "Coral Wave Pants", priceCoins: 440 },
    { kind: "shoes", slug: "coral_wave_shoes", name: "Coral Wave Shoes", priceCoins: 450 }
  ] as const

  for (const expected of expectedLayers) {
    const matches = FEMALE_SWEET_CAPSULE_LAYERS.filter(
      (item) => item.kind === expected.kind && item.slug === expected.slug
    )
    assert.equal(matches.length, 1, expected.slug)
    assert.equal(matches[0]?.visible, true, expected.slug)
    assert.equal(matches[0]?.name, expected.name, expected.slug)
    assert.equal(matches[0]?.priceCoins, expected.priceCoins, expected.slug)
    assert.equal(matches[0]?.outfitKey, undefined, expected.slug)
    assert.equal(matches[0]?.pairedItemId, undefined, expected.slug)
  }

  const expectedCatalogEntries = [
    { itemId: "avatar_v2_top_coral_wave_polo", slot: "top", title: "Coral Wave Polo", priceCoins: 80 },
    { itemId: "avatar_v2_bottom_coral_wave_pants", slot: "bottom", title: "Coral Wave Pants", priceCoins: 440 },
    { itemId: "avatar_v2_shoes_coral_wave_shoes", slot: "shoes", title: "Coral Wave Shoes", priceCoins: 450 }
  ] as const

  for (const expected of expectedCatalogEntries) {
    const mobileItem = AVATAR_V2_CATALOG.find((item) => item.id === expected.itemId)
    assert.ok(mobileItem, expected.itemId)
    assert.equal(mobileItem.type, expected.slot, expected.itemId)
    assert.equal(mobileItem.hiddenFromShop, undefined, expected.itemId)
    assert.notEqual(mobileItem.ownedByDefault, true, expected.itemId)

    const roomId = `room_avatar_${expected.slot}_female_${expected.itemId.split("_").slice(3).join("_")}_v2`
    const roomSlot = expected.slot === "top" ? "topId" : expected.slot === "bottom" ? "bottomId" : "shoesId"
    const roomItem = ROOM_AVATAR_CATALOG.find((item) => item.id === roomId)
    assert.ok(roomItem, roomId)
    assert.equal(DEFAULT_AVATAR_ROOM_PROJECTION_MAP[expected.itemId]?.[roomSlot], roomId)
    assert.equal(roomItem.bodyPreset, "female", roomId)
    assert.equal(roomItem.rigId, "blumi_2_5d_layered_v1", roomId)
    assert.equal(roomItem.fitProfileId, "blumi_female_room_avatar_v1", roomId)
    assert.equal(roomItem.asset.key, `${roomId.replace(/_v2$/, "_v1")}`, `${roomId} static asset`)

    const walking = roomItem.assetsByMotion?.walking?.front
    assert.ok(walking && "frames" in walking, `${roomId} walking sequence`)
    assert.equal(walking.frames.length, 4, `${roomId} walking frame count`)
    assert.deepEqual(
      walking.frames.map((frame) => frame.key),
      [1, 2, 3, 4].map((frame) => `${roomId.replace(/_v2$/, "_v1")}_walking_front_f0${frame}`),
      `${roomId} pose-specific walking sources`
    )
    const sitting = roomItem.assetsByMotion?.sitting?.front
    assert.ok(sitting && "key" in sitting, `${roomId} sitting frame`)
    assert.equal(
      sitting.key,
      `${roomId.replace(/_v2$/, "_v1")}_sitting_front_f01`,
      `${roomId} sitting source`
    )
    assert.equal(roomItem.layerOrder, expected.slot === "top" ? 60 : expected.slot === "shoes" ? 50 : 51)
    if (expected.slot === "bottom") {
      assert.equal(roomItem.occlusionRole, "bottomOverShoeUpper", roomId)
    }

    const loadoutItem = AVATAR_LOADOUT_CATALOG.find((item) => item.itemId === expected.itemId)
    assert.ok(loadoutItem, expected.itemId)
    assert.equal(loadoutItem.slot, expected.slot, expected.itemId)
    assert.deepEqual(loadoutItem.supportedBodyIds, ["avatar_v2_body_default"])
    assert.equal(loadoutItem.outfitKey, undefined, expected.itemId)
    assert.equal(loadoutItem.pairedItemId, undefined, expected.itemId)

    const economyItem = ECONOMY_CATALOG.find((item) => item.itemId === expected.itemId)
    assert.ok(economyItem, expected.itemId)
    assert.equal(economyItem.type, "avatar", expected.itemId)
    assert.equal(economyItem.title, expected.title, expected.itemId)
    assert.equal(economyItem.priceCoins, expected.priceCoins, expected.itemId)
    assert.equal(economyItem.ownedByDefault, undefined, expected.itemId)
  }

  const premiumAvatarItems = ECONOMY_CATALOG.filter(
    (item) => item.type === "avatar" && item.priceCoins > 0
  )
  assert.equal(premiumAvatarItems.length, 109)
  assert.equal(new Set(premiumAvatarItems.map((item) => item.itemId)).size, premiumAvatarItems.length)
})
