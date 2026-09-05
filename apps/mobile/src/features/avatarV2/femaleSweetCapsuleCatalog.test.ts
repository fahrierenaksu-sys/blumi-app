import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { AVATAR_V2_CATALOG } = require("./avatarV2.mock") as typeof import("./avatarV2.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { ROOM_AVATAR_CATALOG } = require("./room/avatarRoom.mock") as typeof import("./room/avatarRoom.mock")
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

test("female sweet capsule is complete, mapped, and ready for a fitted 4W+1S wardrobe", () => {
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
    assert.equal(existsSync(join(assetRoot, "layers", `avatar_${kind}_${slug}.png`)), true, `${avatarId} profile layer`)
    assert.equal(existsSync(join(assetRoot, "shop-thumbnails", `${avatarId}.png`)), true, `${avatarId} thumbnail`)
    assert.ok(FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES[avatarId], `${avatarId} square thumbnail map`)
  }

  for (const { kind, slug } of everyLayer) {
    const roomId = `room_avatar_${kind}_female_${slug}_v2`
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
  const wardrobeSource = readFileSync(
    join(workspaceRoot, "src/screens/WardrobeV2Screen.tsx"),
    "utf8"
  )
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
