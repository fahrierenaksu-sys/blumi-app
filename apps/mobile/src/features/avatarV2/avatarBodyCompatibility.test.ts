import assert from "node:assert/strict"
import test from "node:test"
import {
  getAvatarV2ShopItemsCompatibleWithBody,
  getAvatarV2ItemsCompatibleWithBody,
  isAvatarV2ItemCompatibleWithBody,
  normalizeAvatarV2ForBody
} from "./avatarBodyCompatibility"
import type { AvatarCatalogItem, UserAvatar } from "./avatarV2.types"

const catalog = [
  { id: "avatar_v2_body_default", type: "body", compatibleBodyIds: ["avatar_v2_body_default"] },
  { id: "male-body", type: "body", compatibleBodyIds: ["male-body"] },
  { id: "female-hair", type: "hair", compatibleBodyIds: ["avatar_v2_body_default"] },
  { id: "male-hair", type: "hair", compatibleBodyIds: ["male-body"] }
] as AvatarCatalogItem[]

test("returns only items compatible with the selected body", () => {
  assert.deepEqual(
    getAvatarV2ItemsCompatibleWithBody(catalog, "hair", "male-body").map(
      (item) => item.id
    ),
    ["male-hair"]
  )
  assert.equal(
    isAvatarV2ItemCompatibleWithBody(catalog[2], "male-body"),
    false
  )
})

test("shop catalog exposes only visible wearables compatible with the active body", () => {
  const shopCatalog = [
    ...catalog,
    {
      id: "female-hidden",
      type: "hair",
      compatibleBodyIds: ["avatar_v2_body_default"],
      hiddenFromShop: true
    }
  ] as AvatarCatalogItem[]

  assert.deepEqual(
    getAvatarV2ShopItemsCompatibleWithBody(shopCatalog, "male-body").map(
      (item) => item.id
    ),
    ["male-hair"]
  )
  assert.deepEqual(
    getAvatarV2ShopItemsCompatibleWithBody(
      shopCatalog,
      "avatar_v2_body_default"
    ).map((item) => item.id),
    ["female-hair"]
  )
})

test("keeps body choices visible and treats legacy untagged pieces as female only", () => {
  const legacyHair = { id: "legacy-hair", type: "hair" } as AvatarCatalogItem
  assert.equal(isAvatarV2ItemCompatibleWithBody(catalog[1], "avatar_v2_body_default"), true)
  assert.equal(isAvatarV2ItemCompatibleWithBody(legacyHair, "avatar_v2_body_default"), true)
  assert.equal(isAvatarV2ItemCompatibleWithBody(legacyHair, "male-body"), false)
})

test("keeps hidden starter foundations out of wardrobe lists but uses them for normalization", () => {
  const hiddenMaleFace = {
    id: "male-face",
    type: "face",
    sortOrder: 10,
    hiddenFromWardrobe: true,
    ownedByDefault: true,
    compatibleBodyIds: ["male-body"]
  } as AvatarCatalogItem
  const normalizationCatalog = [
    ...catalog,
    { id: "female-face", type: "face" } as AvatarCatalogItem,
    hiddenMaleFace
  ]
  const femaleAvatar = {
    bodyId: "avatar_v2_body_default",
    faceId: "female-face",
    eyesId: "eyes",
    noseId: "nose",
    mouthId: "mouth",
    hairId: "male-hair",
    topId: "top",
    bottomId: "bottom",
    shoesId: "shoes",
    accessoryIds: []
  } satisfies UserAvatar

  assert.deepEqual(
    getAvatarV2ItemsCompatibleWithBody(normalizationCatalog, "face", "male-body"),
    []
  )
  assert.equal(
    normalizeAvatarV2ForBody(femaleAvatar, "male-body", normalizationCatalog).faceId,
    "male-face"
  )
  assert.equal(femaleAvatar.faceId, "female-face")
})
