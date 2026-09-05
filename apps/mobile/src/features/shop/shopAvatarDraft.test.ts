import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2/avatarV2.types"
import {
  avatarToShopCombinationDraft,
  hasAvatarDraftChanges,
  isAvatarShopItemPreviewing,
  previewAvatarShopItem,
  restoreAvatarShopItemPreview,
  shopCombinationDraftToAvatar
} from "./shopAvatarDraft"

const AVATAR: UserAvatar = {
  bodyId: "body",
  faceId: "face",
  eyesId: "eyes",
  noseId: "nose",
  mouthId: "mouth",
  hairId: "hair",
  topId: "top_old",
  bottomId: "bottom_old",
  shoesId: "shoes",
  dressId: null,
  outerwearId: null,
  accessoryIds: ["glasses_old", "earrings_old"]
}

function item(input: Partial<AvatarCatalogItem> & Pick<AvatarCatalogItem, "id" | "type">): AvatarCatalogItem {
  return {
    name: input.id,
    sortOrder: 1,
    layerOrder: 1,
    assets: {},
    ...input
  }
}

test("previewing a top changes only top and clears a semantic dress", () => {
  const current = { ...AVATAR, dressId: "dress_old" }
  const next = previewAvatarShopItem(
    current,
    item({ id: "top_new", type: "top" }),
    []
  )

  assert.equal(next.topId, "top_new")
  assert.equal(next.bottomId, current.bottomId)
  assert.equal(next.dressId, null)
  assert.deepEqual(next.accessoryIds, current.accessoryIds)
  assert.notEqual(next.accessoryIds, current.accessoryIds)
})

test("previewing an equipped accessory does not remove it in Shop", () => {
  const next = previewAvatarShopItem(
    AVATAR,
    item({ id: "glasses_old", type: "accessory", accessoryGroup: "eyewear" }),
    []
  )

  assert.deepEqual(next, AVATAR)
  assert.notEqual(next.accessoryIds, AVATAR.accessoryIds)
})

test("previewing a bottom changes only bottom", () => {
  const next = previewAvatarShopItem(
    AVATAR,
    item({ id: "bottom_new", type: "bottom" }),
    []
  )

  assert.equal(next.bottomId, "bottom_new")
  assert.equal(next.topId, AVATAR.topId)
  assert.equal(next.shoesId, AVATAR.shoesId)
})

test("an explicitly paired outfit uses dressId and preserves hidden separates", () => {
  const pairedBottom = item({
    id: "outfit_bottom",
    type: "bottom",
    outfitKey: "outfit"
  })
  const next = previewAvatarShopItem(
    AVATAR,
    item({
      id: "outfit_top",
      type: "top",
      outfitKey: "outfit",
      pairedItemId: pairedBottom.id
    }),
    [pairedBottom]
  )

  assert.equal(next.dressId, "outfit_top")
  assert.equal(next.topId, AVATAR.topId)
  assert.equal(next.bottomId, AVATAR.bottomId)
})

test("draft conversion preserves every scalar slot and all accessories", () => {
  const draft = avatarToShopCombinationDraft(AVATAR)
  const restored = shopCombinationDraftToAvatar(draft, AVATAR)

  assert.deepEqual(restored, AVATAR)
  assert.notEqual(restored.accessoryIds, AVATAR.accessoryIds)
  assert.equal(hasAvatarDraftChanges(AVATAR, restored), false)
  assert.equal(hasAvatarDraftChanges(AVATAR, { ...restored, topId: "top_new" }), true)
})

test("a partial draft preserves existing outerwear unless null is explicit", () => {
  const fallback = { ...AVATAR, outerwearId: "coat_existing" }
  assert.equal(
    shopCombinationDraftToAvatar({ top: "top_new" }, fallback).outerwearId,
    "coat_existing"
  )
  assert.equal(
    shopCombinationDraftToAvatar({ outerwear: null }, fallback).outerwearId,
    null
  )
})

test("restoring one previewed top keeps previews in other slots", () => {
  const catalog = [
    item({ id: "top-preview", type: "top" }),
    item({ id: "bottom-preview", type: "bottom" })
  ]
  const previewedTop = previewAvatarShopItem(AVATAR, catalog[0], catalog)
  const previewedBoth = previewAvatarShopItem(previewedTop, catalog[1], catalog)
  assert.equal(isAvatarShopItemPreviewing(previewedBoth, catalog[0]), true)

  const restored = restoreAvatarShopItemPreview(
    previewedBoth,
    AVATAR,
    catalog[0],
    catalog
  )
  assert.equal(restored.topId, AVATAR.topId)
  assert.equal(restored.bottomId, "bottom-preview")
  assert.equal(isAvatarShopItemPreviewing(restored, catalog[0]), false)
})
