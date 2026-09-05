import assert from "node:assert/strict"
import test from "node:test"

import type { AvatarCatalogItem, UserAvatar } from "./avatarV2.types"
import {
  applyAvatarOutfitSelection,
  normalizeAvatarOutfitSelection,
  projectSemanticDressForLegacyRenderer
} from "./avatarV2Outfits"

const defaults = {
  topId: "top_default",
  bottomId: "bottom_default"
}

const avatar: UserAvatar = {
  bodyId: "body",
  faceId: "face",
  eyesId: "eyes",
  noseId: "nose",
  mouthId: "mouth",
  hairId: "hair",
  topId: defaults.topId,
  bottomId: defaults.bottomId,
  shoesId: "shoes",
  accessoryIds: []
}

const item = (
  id: string,
  type: AvatarCatalogItem["type"],
  extra: Partial<AvatarCatalogItem> = {}
): AvatarCatalogItem => ({
  id,
  type,
  name: id,
  sortOrder: 0,
  layerOrder: 0,
  assets: {},
  ...extra
})

const dressTop = item("dress_top", "top", {
  outfitKey: "dress",
  pairedItemId: "dress_bottom"
})
const dressBottom = item("dress_bottom", "bottom", {
  outfitKey: "dress",
  hiddenFromShop: true,
  hiddenFromWardrobe: true
})
const secondDressTop = item("second_dress_top", "top", {
  outfitKey: "second_dress",
  pairedItemId: "second_dress_bottom"
})
const secondDressBottom = item("second_dress_bottom", "bottom", {
  outfitKey: "second_dress",
  hiddenFromShop: true,
  hiddenFromWardrobe: true
})
const regularTop = item("regular_top", "top")
const regularBottom = item("regular_bottom", "bottom")
const catalog = [
  dressTop,
  dressBottom,
  secondDressTop,
  secondDressBottom,
  regularTop,
  regularBottom
]

test("selecting a dress preserves hidden separates under semantic dressId", () => {
  const next = applyAvatarOutfitSelection(avatar, dressTop, catalog, defaults)

  assert.notStrictEqual(next, avatar)
  assert.equal(next.dressId, dressTop.id)
  assert.equal(next.topId, defaults.topId)
  assert.equal(next.bottomId, defaults.bottomId)
  assert.equal(avatar.topId, defaults.topId)
  assert.equal(avatar.bottomId, defaults.bottomId)
})

test("selecting a regular bottom removes an active dress top", () => {
  const dressed = { ...avatar, topId: dressTop.id, bottomId: dressBottom.id }
  const next = applyAvatarOutfitSelection(dressed, regularBottom, catalog, defaults)

  assert.equal(next.topId, defaults.topId)
  assert.equal(next.bottomId, regularBottom.id)
})

test("selecting another dress migrates a legacy outfit to semantic dressId", () => {
  const dressed = { ...avatar, topId: dressTop.id, bottomId: dressBottom.id }
  const next = applyAvatarOutfitSelection(dressed, secondDressTop, catalog, defaults)

  assert.equal(next.dressId, secondDressTop.id)
  assert.equal(next.topId, defaults.topId)
  assert.equal(next.bottomId, defaults.bottomId)
})

test("selecting a regular top removes an active hidden dress bottom", () => {
  const dressed = { ...avatar, topId: dressTop.id, bottomId: dressBottom.id }
  const next = applyAvatarOutfitSelection(dressed, regularTop, catalog, defaults)

  assert.equal(next.topId, regularTop.id)
  assert.equal(next.bottomId, defaults.bottomId)
})

test("selecting a regular top never changes the independent lower slots", () => {
  const styled = {
    ...avatar,
    topId: regularTop.id,
    bottomId: "denim_bottom",
    shoesId: "rosewood_shoes",
    accessoryIds: ["pearl_earrings"]
  }
  const next = applyAvatarOutfitSelection(styled, item("second_top", "top"), [
    ...catalog,
    item("second_top", "top"),
    item("denim_bottom", "bottom")
  ], defaults)

  assert.equal(next.topId, "second_top")
  assert.equal(next.bottomId, "denim_bottom")
  assert.equal(next.shoesId, "rosewood_shoes")
  assert.deepEqual(next.accessoryIds, ["pearl_earrings"])
})

test("selecting a regular bottom never changes the independent upper slots", () => {
  const styled = {
    ...avatar,
    topId: regularTop.id,
    bottomId: "old_bottom",
    shoesId: "rosewood_shoes",
    accessoryIds: ["pearl_earrings"]
  }
  const next = applyAvatarOutfitSelection(styled, item("new_bottom", "bottom"), [
    ...catalog,
    item("new_bottom", "bottom")
  ], defaults)

  assert.equal(next.topId, regularTop.id)
  assert.equal(next.bottomId, "new_bottom")
  assert.equal(next.shoesId, "rosewood_shoes")
  assert.deepEqual(next.accessoryIds, ["pearl_earrings"])
})

test("normalization restores the paired bottom for a persisted dress top", () => {
  const mismatched = { ...avatar, topId: dressTop.id, bottomId: regularBottom.id }
  const next = normalizeAvatarOutfitSelection(mismatched, catalog, defaults)

  assert.equal(next.topId, dressTop.id)
  assert.equal(next.bottomId, dressBottom.id)
})

test("normalization removes an orphaned hidden dress bottom", () => {
  const mismatched = { ...avatar, topId: regularTop.id, bottomId: dressBottom.id }
  const next = normalizeAvatarOutfitSelection(mismatched, catalog, defaults)

  assert.equal(next.topId, regularTop.id)
  assert.equal(next.bottomId, defaults.bottomId)
})

test("semantic dress projection affects rendering without mutating hidden separates", () => {
  const dressed = { ...avatar, dressId: dressTop.id }
  const projected = projectSemanticDressForLegacyRenderer(dressed, catalog)

  assert.notStrictEqual(projected, dressed)
  assert.equal(projected.topId, dressTop.id)
  assert.equal(projected.bottomId, dressBottom.id)
  assert.equal(dressed.topId, defaults.topId)
  assert.equal(dressed.bottomId, defaults.bottomId)
})
