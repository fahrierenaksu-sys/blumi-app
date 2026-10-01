import assert from "node:assert/strict"
import test from "node:test"
import {
  createShopCombinationState,
  reduceShopCombination,
  type ShopCombinationDraft,
  type ShopCombinationState,
  type ShopCombinationTransition
} from "./shopCombinationState"

const equipped: ShopCombinationDraft = {
  hair: "hair-current",
  top: "top-current",
  bottom: "bottom-current",
  dress: null,
  outerwear: null,
  shoes: "shoes-current"
}

test("a fresh Shop draft starts from equipped state and previews only its semantic slot", () => {
  const firstMount = createShopCombinationState({
    equipped,
    ownedProductIds: ["hair-current", "top-current", "bottom-current", "shoes-current"],
    avatarRevision: "revision-1"
  })

  const previewed = reduceShopCombination(firstMount, {
    type: "preview_product",
    slot: "shoes",
    productId: "shoes-preview",
    compatible: true
  }).state

  assert.deepEqual(previewed.draft, { ...equipped, shoes: "shoes-preview" })
  assert.deepEqual(firstMount.draft, equipped)

  const switchedCategory = reduceShopCombination(previewed, {
    type: "change_category",
    slot: "hair"
  }).state
  assert.equal(switchedCategory.draft.shoes, "shoes-preview")

  const remounted = createShopCombinationState({
    equipped,
    ownedProductIds: firstMount.ownedProductIds,
    avatarRevision: "revision-1"
  })
  assert.equal(remounted.draft.shoes, "shoes-current")
})

test("leaving Shop explicitly discards the preview and restores equipped state", () => {
  const initial = createShopCombinationState({
    equipped: { ...equipped, accessoryIds: ["accessory-current"] },
    ownedProductIds: [],
    avatarRevision: "revision-1"
  })
  const previewed = reduceShopCombination(initial, {
    type: "preview_product",
    slot: "top",
    productId: "top-preview",
    compatible: true
  }).state

  const discarded = reduceShopCombination(previewed, { type: "discard_draft" }).state

  assert.deepEqual(discarded.draft, initial.equipped)
  assert.notEqual(discarded.draft, initial.equipped)
  assert.notEqual(discarded.draft.accessoryIds, initial.equipped.accessoryIds)
  assert.equal(discarded.phase, "editing")
})

test("dress hides preserved separates, while selecting either separate clears dress", () => {
  const initial = createShopCombinationState({
    equipped,
    ownedProductIds: [],
    avatarRevision: "revision-1"
  })
  const wearingDress = reduceShopCombination(initial, {
    type: "preview_product",
    slot: "dress",
    productId: "dress-preview",
    compatible: true
  }).state

  assert.equal(wearingDress.draft.dress, "dress-preview")
  assert.equal(wearingDress.draft.top, "top-current")
  assert.equal(wearingDress.draft.bottom, "bottom-current")

  const changedTop = reduceShopCombination(wearingDress, {
    type: "preview_product",
    slot: "top",
    productId: "top-preview",
    compatible: true
  }).state
  assert.equal(changedTop.draft.dress, null)
  assert.equal(changedTop.draft.top, "top-preview")
  assert.equal(changedTop.draft.bottom, "bottom-current")

  const changedBottom = reduceShopCombination(wearingDress, {
    type: "preview_product",
    slot: "bottom",
    productId: "bottom-preview",
    compatible: true
  }).state
  assert.equal(changedBottom.draft.dress, null)
  assert.equal(changedBottom.draft.top, "top-current")
  assert.equal(changedBottom.draft.bottom, "bottom-preview")
})

test("outerwear is nullable and incompatible previews are rejected explicitly", () => {
  const initial = createShopCombinationState({
    equipped: { ...equipped, outerwear: "coat-current" },
    ownedProductIds: [],
    avatarRevision: "revision-1"
  })

  const rejected = reduceShopCombination(initial, {
    type: "preview_product",
    slot: "outerwear",
    productId: "coat-incompatible",
    compatible: false
  })
  assert.equal(rejected.state.draft.outerwear, "coat-current")
  assert.deepEqual(rejected.commands, [])

  const removed = reduceShopCombination(initial, {
    type: "preview_product",
    slot: "outerwear",
    productId: null,
    compatible: true
  }).state
  assert.equal(removed.draft.outerwear, null)
})

test("apply asks once for the whole look, then purchases one-by-one in deterministic category order", () => {
  const initial = createShopCombinationState({
    equipped: {
      hair: "hair-owned",
      top: "top-hidden",
      bottom: "bottom-hidden",
      dress: "dress-locked",
      outerwear: "coat-locked",
      shoes: "shoes-locked"
    },
    ownedProductIds: ["hair-owned"],
    avatarRevision: "revision-1"
  })

  const started = reduceShopCombination(initial, { type: "apply" })
  assert.equal(started.state.phase, "confirming")
  assert.deepEqual(started.state.purchaseQueue, [
    { slot: "dress", productId: "dress-locked" },
    { slot: "outerwear", productId: "coat-locked" },
    { slot: "shoes", productId: "shoes-locked" }
  ])
  // One checkout for the whole look instead of one system alert per item.
  assert.deepEqual(started.commands, [{
    type: "request_checkout_confirmation",
    items: [
      { slot: "dress", productId: "dress-locked" },
      { slot: "outerwear", productId: "coat-locked" },
      { slot: "shoes", productId: "shoes-locked" }
    ]
  }])

  const approved = reduceShopCombination(started.state, {
    type: "checkout_approved",
    productIds: ["dress-locked", "coat-locked", "shoes-locked"]
  })
  assert.equal(approved.state.phase, "purchasing")
  assert.deepEqual(approved.commands, [
    { type: "purchase_product", slot: "dress", productId: "dress-locked" }
  ])
  const dressBought = reduceShopCombination(approved.state, {
    type: "purchase_succeeded",
    productId: "dress-locked"
  })
  assert.equal(dressBought.state.phase, "purchasing", "no second confirmation")
  assert.deepEqual(dressBought.commands, [
    { type: "purchase_product", slot: "outerwear", productId: "coat-locked" }
  ])
  assert.deepEqual(dressBought.state.equipped, initial.equipped)

  const coatBought = completePurchase(dressBought.state, "coat-locked")
  assert.deepEqual(coatBought.commands, [
    { type: "purchase_product", slot: "shoes", productId: "shoes-locked" }
  ])

  const shoesBought = completePurchase(coatBought.state, "shoes-locked")
  assert.equal(shoesBought.state.phase, "saving")
  assert.deepEqual(shoesBought.commands, [{
    type: "save_avatar",
    avatarRevision: "revision-1",
    combination: {
      hair: "hair-owned",
      top: "top-hidden",
      bottom: "bottom-hidden",
      dress: "dress-locked",
      outerwear: "coat-locked",
      shoes: "shoes-locked"
    }
  }])
  assert.deepEqual(shoesBought.state.ownedProductIds, [
    "hair-owned",
    "dress-locked",
    "coat-locked",
    "shoes-locked"
  ])
  assert.deepEqual(shoesBought.state.equipped, initial.equipped)
})

test("owned-only apply emits one save command without purchase commands", () => {
  const initial = createShopCombinationState({
    equipped,
    ownedProductIds: ["hair-current", "top-current", "bottom-current", "shoes-current"],
    avatarRevision: "revision-1"
  })

  const result = reduceShopCombination(initial, { type: "apply" })
  assert.equal(result.state.phase, "saving")
  assert.deepEqual(result.commands, [{
    type: "save_avatar",
    avatarRevision: "revision-1",
    combination: equipped
  }])
})

test("one locked product referenced by multiple slots is purchased only once", () => {
  const initial = createShopCombinationState({
    equipped: {
      top: "shared-product",
      outerwear: "shared-product"
    },
    ownedProductIds: [],
    avatarRevision: "revision-7"
  })

  const result = reduceShopCombination(initial, { type: "apply" })
  assert.deepEqual(result.state.purchaseQueue, [
    { slot: "top", productId: "shared-product" }
  ])
  assert.deepEqual(result.commands, [{
    type: "request_checkout_confirmation",
    items: [{ slot: "top", productId: "shared-product" }]
  }])
})

test("a checkout approval must name exactly the queued items", () => {
  const initial = createShopCombinationState({
    equipped: { top: "top-locked", shoes: "shoes-locked" },
    ownedProductIds: [],
    avatarRevision: 1
  })
  const started = reduceShopCombination(initial, { type: "apply" }).state
  for (const productIds of [[], ["top-locked"], ["shoes-locked", "top-locked"], ["top-locked", "shoes-locked", "extra"]]) {
    const stale = reduceShopCombination(started, { type: "checkout_approved", productIds })
    assert.equal(stale.state, started, productIds.join(","))
    assert.deepEqual(stale.commands, [])
  }
  const editing = reduceShopCombination(initial, { type: "checkout_approved", productIds: [] })
  assert.equal(editing.state, initial, "nothing to approve while editing")
})

test("purchase error or cancellation stops apply and keeps the in-memory draft", () => {
  const initial = createShopCombinationState({
    equipped: { ...equipped, shoes: "shoes-locked" },
    ownedProductIds: ["hair-current", "top-current", "bottom-current"],
    avatarRevision: "revision-1"
  })
  const started = reduceShopCombination(initial, { type: "apply" }).state
  const purchasing = reduceShopCombination(started, {
    type: "checkout_approved",
    productIds: ["shoes-locked"]
  }).state

  const failed = reduceShopCombination(purchasing, {
    type: "purchase_failed",
    productId: "shoes-locked",
    reason: "not_enough_coins"
  })
  assert.equal(failed.state.phase, "editing")
  assert.deepEqual(failed.state.draft, initial.draft)
  assert.equal(failed.state.issue, "not_enough_coins")
  assert.deepEqual(failed.commands, [])

  const cancelled = reduceShopCombination(started, { type: "cancel_apply" })
  assert.equal(cancelled.state.phase, "editing")
  assert.deepEqual(cancelled.state.draft, initial.draft)
  assert.deepEqual(cancelled.commands, [])
})

test("a later purchase failure preserves earlier ownership without partially equipping", () => {
  const initial = createShopCombinationState({
    equipped,
    ownedProductIds: ["hair-current", "top-current", "bottom-current"],
    avatarRevision: "revision-1"
  })
  const withLockedDraft = reduceShopCombination(initial, {
    type: "preview_product",
    slot: "outerwear",
    productId: "coat-locked",
    compatible: true
  }).state
  const withTwoLockedItems = reduceShopCombination(withLockedDraft, {
    type: "preview_product",
    slot: "shoes",
    productId: "shoes-locked",
    compatible: true
  }).state
  const started = reduceShopCombination(withTwoLockedItems, { type: "apply" }).state

  const purchasing = reduceShopCombination(started, {
    type: "checkout_approved",
    productIds: ["coat-locked", "shoes-locked"]
  }).state
  const outOfOrderSuccess = reduceShopCombination(purchasing, {
    type: "purchase_succeeded",
    productId: "shoes-locked"
  })
  assert.equal(outOfOrderSuccess.state, purchasing)
  assert.deepEqual(outOfOrderSuccess.commands, [])

  const shoesPurchasing = completePurchase(purchasing, "coat-locked").state
  assert.equal(shoesPurchasing.phase, "purchasing")
  const failed = reduceShopCombination(shoesPurchasing, {
    type: "purchase_failed",
    productId: "shoes-locked",
    reason: "cancelled"
  }).state

  assert.equal(failed.phase, "editing")
  assert.equal(failed.ownedProductIds.includes("coat-locked"), true)
  assert.equal(failed.ownedProductIds.includes("shoes-locked"), false)
  assert.deepEqual(failed.equipped, initial.equipped)
  assert.deepEqual(failed.draft, withTwoLockedItems.draft)
})

test("avatar save error keeps purchases and draft without committing equip", () => {
  const initial = createShopCombinationState({
    equipped,
    ownedProductIds: ["hair-current", "top-current", "bottom-current"],
    avatarRevision: "revision-1"
  })
  const previewed = reduceShopCombination(initial, {
    type: "preview_product",
    slot: "shoes",
    productId: "shoes-locked",
    compatible: true
  }).state
  const started = reduceShopCombination(previewed, { type: "apply" }).state
  const saving = completePurchase(started, "shoes-locked").state
  const failed = reduceShopCombination(saving, {
    type: "avatar_save_failed",
    reason: "offline"
  }).state

  assert.equal(failed.phase, "editing")
  assert.equal(failed.ownedProductIds.includes("shoes-locked"), true)
  assert.deepEqual(failed.equipped, initial.equipped)
  assert.deepEqual(failed.draft, previewed.draft)
})

test("a revision conflict keeps confirmed purchases, never equips partially, and requires refresh", () => {
  const initial = createShopCombinationState({
    equipped,
    ownedProductIds: ["hair-current", "top-current", "bottom-current"],
    avatarRevision: "revision-1"
  })
  const previewed = reduceShopCombination(initial, {
    type: "preview_product",
    slot: "shoes",
    productId: "shoes-locked",
    compatible: true
  }).state
  const started = reduceShopCombination(previewed, { type: "apply" }).state
  const bought = completePurchase(started, "shoes-locked").state

  const conflicted = reduceShopCombination(bought, {
    type: "avatar_save_revision_conflict"
  })
  assert.equal(conflicted.state.phase, "review_required")
  assert.equal(conflicted.state.requiresRefresh, true)
  assert.equal(conflicted.state.ownedProductIds.includes("shoes-locked"), true)
  assert.deepEqual(conflicted.state.equipped, initial.equipped)
  assert.deepEqual(conflicted.state.draft, previewed.draft)
  assert.deepEqual(conflicted.commands, [])

  const ignoredApply = reduceShopCombination(conflicted.state, { type: "apply" })
  assert.equal(ignoredApply.state.phase, "review_required")
  assert.deepEqual(ignoredApply.commands, [])

  const refreshed = reduceShopCombination(conflicted.state, {
    type: "refresh_after_conflict",
    equipped: { ...equipped, hair: "hair-server" },
    ownedProductIds: ["hair-current", "top-current", "bottom-current", "shoes-locked"],
    avatarRevision: "revision-2"
  })
  assert.equal(refreshed.state.phase, "editing")
  assert.equal(refreshed.state.requiresRefresh, false)
  assert.equal(refreshed.state.avatarRevision, "revision-2")
  assert.equal(refreshed.state.equipped.hair, "hair-server")
  assert.deepEqual(refreshed.state.draft, {
    ...refreshed.state.equipped,
    accessoryIds: []
  })
  assert.equal(refreshed.state.ownedProductIds.includes("shoes-locked"), true)
})

test("successful avatar save commits the combination exactly once", () => {
  const initial = createShopCombinationState({
    equipped,
    ownedProductIds: ["hair-current", "top-current", "bottom-current", "shoes-current"],
    avatarRevision: "revision-1"
  })
  const saving = reduceShopCombination(initial, { type: "apply" }).state
  const saved = reduceShopCombination(saving, {
    type: "avatar_save_confirmed",
    avatarRevision: "revision-2"
  })

  assert.equal(saved.state.phase, "editing")
  assert.equal(saved.state.avatarRevision, "revision-2")
  assert.deepEqual(saved.state.equipped, equipped)
  assert.deepEqual(saved.commands, [])
})

test("multiple accessory groups remain in the draft and queue independently", () => {
  const state = createShopCombinationState({
    equipped,
    ownedProductIds: ["hair-current", "top-current", "bottom-current", "shoes-current"],
    avatarRevision: 3
  })
  const previewed = reduceShopCombination(state, {
    type: "preview_accessories",
    productIds: ["glasses_new", "earrings_new"]
  }).state
  const applied = reduceShopCombination(previewed, { type: "apply" })

  assert.deepEqual(previewed.draft.accessoryIds, ["glasses_new", "earrings_new"])
  assert.deepEqual(applied.state.purchaseQueue, [
    { slot: "accessory", productId: "glasses_new" },
    { slot: "accessory", productId: "earrings_new" }
  ])
})

test("saving one piece preserves the other preview selections", () => {
  const previewDraft = { ...equipped, top: "new-top", bottom: "new-bottom", shoes: "new-shoes", hair: "new-hair", accessoryIds: ["new-bag"] }
  const state = createShopCombinationState({ equipped: { ...equipped, top: "new-top" }, previewDraft,
    ownedProductIds: ["new-top"], avatarRevision: 2 })
  assert.deepEqual(state.draft, previewDraft)
  assert.equal(state.equipped.bottom, "bottom-current")
  const applying = reduceShopCombination(state, { type: "apply" })
  assert.equal(applying.state.purchaseQueue.length, 4)
})

test("five selected pieces all enter and complete the purchase queue", () => {
  const state = createShopCombinationState({
    equipped: { top: "top", bottom: "bottom", shoes: "shoes", hair: "hair", accessoryIds: ["bag"] },
    ownedProductIds: [], avatarRevision: 1
  })
  let next = reduceShopCombination(state, { type: "apply" })
  const ids = next.state.purchaseQueue.map((item) => item.productId)
  assert.equal(ids.length, 5)
  for (const id of ids) next = completePurchase(next.state, id)
  assert.equal(next.state.purchasedProductIds.length, 5)
  assert.equal(next.commands[0]?.type, "save_avatar")
})

/** Approves the checkout when it is still waiting, then completes `productId`. */
function completePurchase(
  state: ShopCombinationState,
  productId: string
): ShopCombinationTransition {
  const purchasing = state.phase === "confirming"
    ? reduceShopCombination(state, {
        type: "checkout_approved",
        productIds: state.purchaseQueue.map((item) => item.productId)
      }).state
    : state
  assert.equal(purchasing.phase, "purchasing")
  assert.equal(purchasing.purchaseQueue[0]?.productId, productId)
  return reduceShopCombination(purchasing, {
    type: "purchase_succeeded",
    productId
  })
}
