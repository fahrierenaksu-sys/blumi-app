import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2/avatarV2.types"
import { previewAvatarShopItem } from "./shopAvatarDraft"
import {
  applyShopCardRemoveAction,
  canRemoveShopCombinationItem,
  getShopCardRemoveAction,
  removeShopCombinationItem
} from "./shopCardRemoveModel"

const SAVED: UserAvatar = {
  bodyId: "body",
  faceId: "face",
  eyesId: "eyes",
  noseId: "nose",
  mouthId: "mouth",
  hairId: "hair_saved",
  topId: "top_saved",
  bottomId: "bottom_saved",
  shoesId: "shoes_saved",
  dressId: null,
  outerwearId: null,
  accessoryIds: ["glasses_saved", "earrings_saved"]
}

function item(input: Partial<AvatarCatalogItem> & Pick<AvatarCatalogItem, "id" | "type">): AvatarCatalogItem {
  return { name: input.id, sortOrder: 1, layerOrder: 1, assets: {}, ...input }
}

const glassesSaved = item({ id: "glasses_saved", type: "accessory", accessoryGroup: "eyewear" })
const earringsSaved = item({ id: "earrings_saved", type: "accessory", accessoryGroup: "earrings" })
const glassesNew = item({ id: "glasses_new", type: "accessory", accessoryGroup: "eyewear" })
const topNew = item({ id: "top_new", type: "top" })
const topSaved = item({ id: "top_saved", type: "top" })
const CATALOG = [glassesSaved, earringsSaved, glassesNew, topNew, topSaved]

function actionFor(cardItem: AvatarCatalogItem | undefined, draft: UserAvatar, options: { owned?: boolean; canSave?: boolean } = {}) {
  return getShopCardRemoveAction({
    item: cardItem,
    draft,
    equipped: SAVED,
    owned: options.owned ?? true,
    canSave: options.canSave ?? true
  })
}

test("a tried-on item shows the X and taking it off puts the saved item back, saving nothing", () => {
  const draft = previewAvatarShopItem(SAVED, topNew, CATALOG)
  assert.equal(actionFor(topNew, draft, { owned: false }), "undo_try_on", "try-on works for items not bought yet")
  assert.equal(actionFor(topNew, draft, { canSave: false }), "undo_try_on", "undoing a try-on needs no connection")

  const result = applyShopCardRemoveAction({ action: "undo_try_on", item: topNew, draft, equipped: SAVED, catalog: CATALOG })
  assert.equal(result?.draft.topId, "top_saved")
  assert.equal(result?.savedAvatar, null, "a try-on removal never saves the avatar")
})

test("taking off a tried-on accessory restores the saved one in the same group", () => {
  const draft = previewAvatarShopItem(SAVED, glassesNew, CATALOG)
  assert.deepEqual(draft.accessoryIds, ["earrings_saved", "glasses_new"])
  assert.equal(actionFor(glassesNew, draft), "undo_try_on")
  const result = applyShopCardRemoveAction({ action: "undo_try_on", item: glassesNew, draft, equipped: SAVED, catalog: CATALOG })
  assert.deepEqual([...(result?.draft.accessoryIds ?? [])].sort(), ["earrings_saved", "glasses_saved"])
})

test("a saved accessory is taken off the draft and the saved look, keeping other try-ons", () => {
  const draft = previewAvatarShopItem(SAVED, topNew, CATALOG)
  assert.equal(actionFor(earringsSaved, draft), "unequip")
  const result = applyShopCardRemoveAction({ action: "unequip", item: earringsSaved, draft, equipped: SAVED, catalog: CATALOG })
  assert.deepEqual(result?.draft.accessoryIds, ["glasses_saved"])
  assert.equal(result?.draft.topId, "top_new", "the tried-on top stays on the draft")
  assert.deepEqual(result?.savedAvatar?.accessoryIds, ["glasses_saved"])
  assert.equal(result?.savedAvatar?.topId, "top_saved", "only the accessory changes on the saved look")
  assert.deepEqual(SAVED.accessoryIds, ["glasses_saved", "earrings_saved"], "inputs are not mutated")
})

test("a saved accessory has no X when it cannot be saved or is not owned", () => {
  assert.equal(actionFor(earringsSaved, SAVED, { canSave: false }), "none", "offline or busy")
  assert.equal(actionFor(earringsSaved, SAVED, { owned: false }), "none", "ownership is never assumed")
})

test("an outfit row removes only a tried-on piece and puts the saved one back", () => {
  const withTop = previewAvatarShopItem(SAVED, topNew, CATALOG)
  const draft = previewAvatarShopItem(withTop, glassesNew, CATALOG)
  assert.equal(canRemoveShopCombinationItem({ item: topNew, draft, equipped: SAVED }), true)
  const withoutTop = removeShopCombinationItem({ item: topNew, draft, equipped: SAVED, catalog: CATALOG })
  assert.equal(withoutTop?.topId, "top_saved", "the saved top is back")
  assert.ok(withoutTop?.accessoryIds.includes("glasses_new"), "other tried-on pieces stay in the outfit")
  const withoutGlasses = removeShopCombinationItem({ item: glassesNew, draft: withoutTop!, equipped: SAVED, catalog: CATALOG })
  assert.deepEqual([...(withoutGlasses?.accessoryIds ?? [])].sort(), ["earrings_saved", "glasses_saved"])
  assert.deepEqual(
    { ...withoutGlasses, accessoryIds: [...(withoutGlasses?.accessoryIds ?? [])].sort() },
    { ...SAVED, accessoryIds: [...SAVED.accessoryIds].sort() },
    "removing every row returns the saved look"
  )
})

test("an outfit row never changes the saved look", () => {
  assert.equal(canRemoveShopCombinationItem({ item: earringsSaved, draft: SAVED, equipped: SAVED }), false, "saved accessory")
  assert.equal(removeShopCombinationItem({ item: earringsSaved, draft: SAVED, equipped: SAVED, catalog: CATALOG }), null)
  assert.equal(removeShopCombinationItem({ item: topSaved, draft: SAVED, equipped: SAVED, catalog: CATALOG }), null)
  assert.equal(removeShopCombinationItem({ item: glassesNew, draft: SAVED, equipped: SAVED, catalog: CATALOG }), null, "not in the outfit")
  assert.equal(removeShopCombinationItem({ item: undefined, draft: SAVED, equipped: SAVED, catalog: CATALOG }), null, "unknown piece")
})

test("required slots and items not on the avatar have no X", () => {
  assert.equal(actionFor(topSaved, SAVED), "none", "a saved top is replaced, never removed")
  assert.equal(actionFor(glassesNew, SAVED), "none", "not worn")
  assert.equal(actionFor(undefined, SAVED), "none", "room products")
  assert.equal(
    applyShopCardRemoveAction({ action: "none", item: topSaved, draft: SAVED, equipped: SAVED, catalog: CATALOG }),
    null
  )
})
