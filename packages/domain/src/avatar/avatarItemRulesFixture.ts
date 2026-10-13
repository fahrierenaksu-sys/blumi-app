import type { AvatarLoadoutV1 } from "@blumi/contracts"
import type { EconomyCatalogItem } from "../economy/economyCatalog"
import type { AvatarItemRules } from "./avatarItemRules"
import type { AvatarLoadoutCatalogItem, ReadonlyAvatarLoadout } from "./avatarLoadoutCatalog"

/**
 * TEST-ONLY avatar catalog (lead decision 2026-10-12, plan X15). After X15 the live catalog has one active piece
 * per slot, no dress, no accessory and nothing on sale, so the money and ownership rule tests (dress pairs,
 * accessory groups, retired items, body fit, purchase, equip) inject this fixture through the rules' optional
 * `rules` argument and the server's `avatarRules` / economy `catalog` options. Never wired at start-up. The two
 * bodies are the live body IDs (an account's stored body is what the purchase route checks fit against); every
 * other ID starts with `fixture_avatar_`, so a fixture item can never collide with a real one.
 */
const GIRL = "avatar_v2_body_default"
const BOY = "avatar_v2_body_male_light"

export const TEST_AVATAR_ITEM = Object.freeze({
  girlBody: GIRL,
  boyBody: BOY,
  girlHairPaid: "fixture_avatar_hair_girl_paid",
  sharedHairPaid: "fixture_avatar_hair_shared_paid",
  girlTopPaid: "fixture_avatar_top_girl_paid",
  sharedTopPaid: "fixture_avatar_top_shared_paid",
  boyTopPaid: "fixture_avatar_top_boy_paid",
  girlBottomPaid: "fixture_avatar_bottom_girl_paid",
  sharedShoesPaid: "fixture_avatar_shoes_shared_paid",
  retiredTop: "fixture_avatar_top_retired",
  dressTop: "fixture_avatar_top_picnic_dress",
  dressBottom: "fixture_avatar_bottom_picnic_dress",
  freeHeadwear: "fixture_avatar_accessory_free_beret",
  paidHeadwear: "fixture_avatar_accessory_paid_headband",
  paidEyewear: "fixture_avatar_accessory_paid_glasses",
  paidEarrings: "fixture_avatar_accessory_paid_earrings",
  retiredBag: "fixture_avatar_accessory_retired_bag"
})

const piece = (itemId: string, slot: AvatarLoadoutCatalogItem["slot"], bodies: readonly string[]): AvatarLoadoutCatalogItem =>
  ({ itemId, slot, supportedBodyIds: bodies })

function starter(body: string, name: string): ReadonlyAvatarLoadout<AvatarLoadoutV1> {
  return Object.freeze({
    schemaVersion: 1,
    bodyId: body,
    faceId: `fixture_avatar_face_${name}`,
    eyesId: `fixture_avatar_eyes_${name}`,
    noseId: `fixture_avatar_nose_${name}`,
    mouthId: `fixture_avatar_mouth_${name}`,
    hairId: `fixture_avatar_hair_${name}_starter`,
    topId: `fixture_avatar_top_${name}_starter`,
    bottomId: `fixture_avatar_bottom_${name}_starter`,
    shoesId: `fixture_avatar_shoes_${name}_starter`,
    accessoryIds: Object.freeze([])
  })
}

const GIRL_STARTER = starter(GIRL, "girl")
const BOY_STARTER = starter(BOY, "boy")

function starterPieces(look: ReadonlyAvatarLoadout<AvatarLoadoutV1>): AvatarLoadoutCatalogItem[] {
  return [
    piece(look.bodyId, "body", [look.bodyId]),
    piece(look.faceId, "face", [look.bodyId]),
    piece(look.eyesId, "eyes", [look.bodyId]),
    piece(look.noseId, "nose", [look.bodyId]),
    piece(look.mouthId, "mouth", [look.bodyId]),
    piece(look.hairId, "hair", [look.bodyId]),
    piece(look.topId, "top", [look.bodyId]),
    piece(look.bottomId, "bottom", [look.bodyId]),
    piece(look.shoesId, "shoes", [look.bodyId])
  ]
}

const T = TEST_AVATAR_ITEM
const ITEMS: readonly AvatarLoadoutCatalogItem[] = [
  ...starterPieces(GIRL_STARTER),
  ...starterPieces(BOY_STARTER),
  piece(T.girlHairPaid, "hair", [GIRL]),
  piece(T.sharedHairPaid, "hair", [GIRL, BOY]),
  piece(T.girlTopPaid, "top", [GIRL]),
  piece(T.sharedTopPaid, "top", [GIRL, BOY]),
  piece(T.boyTopPaid, "top", [BOY]),
  piece(T.girlBottomPaid, "bottom", [GIRL]),
  piece(T.sharedShoesPaid, "shoes", [GIRL, BOY]),
  piece(T.retiredTop, "top", [GIRL, BOY]),
  { itemId: T.dressTop, slot: "top", outfitKey: "fixture_picnic_dress", pairedItemId: T.dressBottom, supportedBodyIds: [GIRL] },
  { itemId: T.dressBottom, slot: "bottom", outfitKey: "fixture_picnic_dress", pairedItemId: T.dressTop, supportedBodyIds: [GIRL] },
  { itemId: T.freeHeadwear, slot: "accessory", accessoryGroup: "headwear", supportedBodyIds: [GIRL, BOY] },
  { itemId: T.paidHeadwear, slot: "accessory", accessoryGroup: "headwear", supportedBodyIds: [GIRL] },
  { itemId: T.paidEyewear, slot: "accessory", accessoryGroup: "eyewear", supportedBodyIds: [GIRL, BOY] },
  { itemId: T.paidEarrings, slot: "accessory", accessoryGroup: "earrings", supportedBodyIds: [GIRL] },
  { itemId: T.retiredBag, slot: "accessory", accessoryGroup: "bag", supportedBodyIds: [GIRL, BOY] }
]

export const TEST_AVATAR_ITEM_RULES: AvatarItemRules = Object.freeze({
  items: Object.freeze(ITEMS.map((item) => Object.freeze({ ...item, supportedBodyIds: Object.freeze([...item.supportedBodyIds]) }))),
  retiredItemIds: new Set([T.retiredTop, T.retiredBag]),
  starters: Object.freeze({ female: GIRL_STARTER, male: BOY_STARTER })
})

/** What every test account owns: both starter looks and the free beret. */
export const TEST_AVATAR_OWNED_BY_DEFAULT_IDS: readonly string[] = Object.freeze([
  ...starterPieces(GIRL_STARTER).map((item) => item.itemId),
  ...starterPieces(BOY_STARTER).map((item) => item.itemId),
  T.freeHeadwear
])

export const TEST_AVATAR_TOP_PRICE = 410
/** The shared paid top is the cheap item. */
export const TEST_AVATAR_CHEAP_PRICE = 80

/**
 * Server prices for the fixture: starters free and owned, the shared top cheap, the dress top grants its bottom,
 * everything else `TEST_AVATAR_TOP_PRICE`.
 */
export const TEST_AVATAR_ECONOMY_ITEMS: readonly EconomyCatalogItem[] = Object.freeze(
  TEST_AVATAR_ITEM_RULES.items.map((item): EconomyCatalogItem => {
    const title = item.itemId
    if (TEST_AVATAR_OWNED_BY_DEFAULT_IDS.includes(item.itemId)) {
      return { itemId: item.itemId, type: "avatar", title, priceCoins: 0, ownedByDefault: true }
    }
    if (item.itemId === T.dressTop) {
      return { itemId: item.itemId, type: "avatar", title, priceCoins: 520, grantedItemIds: [T.dressBottom] }
    }
    const priceCoins = item.itemId === T.sharedTopPaid ? TEST_AVATAR_CHEAP_PRICE : TEST_AVATAR_TOP_PRICE
    return { itemId: item.itemId, type: "avatar", title, priceCoins }
  })
)
