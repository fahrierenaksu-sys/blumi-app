import assert from "node:assert/strict"
import test from "node:test"
import {
  createShopCheckout,
  getShopCheckoutSummary,
  isShopCheckoutDismissible,
  reduceShopCheckout,
  type ShopCheckout
} from "./shopCheckoutModel"

const products = [
  { sourceItemId: "top", title: "Blossom top", priceCoins: 120 },
  { sourceItemId: "skirt", title: "Cloud skirt", priceCoins: 90 },
  { sourceItemId: "shoes", title: "Milk shoes", priceCoins: 60 }
]
const queue = [
  { slot: "top" as const, productId: "top" },
  { slot: "bottom" as const, productId: "skirt" },
  { slot: "shoes" as const, productId: "shoes" }
]

function open(): ShopCheckout {
  return createShopCheckout({ items: queue, products })
}

test("the checkout lists every queued item with its title and price, in queue order", () => {
  const checkout = open()
  assert.equal(checkout.phase, "review")
  assert.deepEqual(checkout.lines.map((line) => [line.productId, line.title, line.priceCoins, line.status]), [
    ["top", "Blossom top", 120, "pending"],
    ["skirt", "Cloud skirt", 90, "pending"],
    ["shoes", "Milk shoes", 60, "pending"]
  ])
  assert.deepEqual(checkout.productIds, ["top", "skirt", "shoes"])
})

test("review shows the total and the balance after purchase; confirm needs enough server-confirmed coins", () => {
  assert.deepEqual(getShopCheckoutSummary(open(), 1000), {
    total: 270, balanceAfter: 730, shortfall: 0, canConfirm: true,
    purchasedCount: 0, failedCount: 0, notChargedCount: 0
  })
  const short = getShopCheckoutSummary(open(), 200)
  assert.equal(short.shortfall, 70)
  assert.equal(short.balanceAfter, null)
  assert.equal(short.canConfirm, false)
  const unverified = getShopCheckoutSummary(open(), null)
  assert.equal(unverified.canConfirm, false, "no ownership or price decision without a verified balance")
  assert.equal(unverified.balanceAfter, null)
})

test("an unknown or invalid price closes the checkout instead of guessing", () => {
  const checkout = createShopCheckout({
    items: queue,
    products: [{ sourceItemId: "top", title: "Blossom top", priceCoins: null }]
  })
  assert.equal(checkout.lines[1].title, null, "unknown products keep their id")
  const summary = getShopCheckoutSummary(checkout, 1000)
  assert.equal(summary.total, null)
  assert.equal(summary.canConfirm, false)
})

test("each server-confirmed purchase ticks its line; nothing else changes", () => {
  let checkout = reduceShopCheckout(open(), { type: "confirm" })
  assert.equal(checkout.phase, "purchasing")
  checkout = reduceShopCheckout(checkout, { type: "purchase_started", productId: "top" })
  assert.equal(checkout.lines[0].status, "purchasing")
  checkout = reduceShopCheckout(checkout, { type: "purchase_succeeded", productId: "top" })
  assert.deepEqual(checkout.lines.map((line) => line.status), ["purchased", "pending", "pending"])
  const ignored = reduceShopCheckout(checkout, { type: "purchase_succeeded", productId: "unknown" })
  assert.equal(ignored, checkout)
  for (const productId of ["skirt", "shoes"]) {
    checkout = reduceShopCheckout(checkout, { type: "purchase_started", productId })
    checkout = reduceShopCheckout(checkout, { type: "purchase_succeeded", productId })
  }
  checkout = reduceShopCheckout(checkout, { type: "applying" })
  assert.equal(checkout.phase, "applying")
  checkout = reduceShopCheckout(checkout, { type: "applied" })
  assert.equal(checkout.phase, "applied")
  assert.equal(getShopCheckoutSummary(checkout, 730).purchasedCount, 3)
})

test("a failed item stops the checkout: earlier items stay bought, later ones are not charged", () => {
  let checkout = reduceShopCheckout(open(), { type: "confirm" })
  checkout = reduceShopCheckout(checkout, { type: "purchase_started", productId: "top" })
  checkout = reduceShopCheckout(checkout, { type: "purchase_succeeded", productId: "top" })
  checkout = reduceShopCheckout(checkout, { type: "purchase_started", productId: "skirt" })
  checkout = reduceShopCheckout(checkout, { type: "purchase_failed", productId: "skirt", reason: "not_enough_coins" })
  assert.equal(checkout.phase, "partial")
  assert.deepEqual(checkout.lines.map((line) => line.status), ["purchased", "failed", "not_charged"])
  assert.equal(checkout.lines[1].failureReason, "not_enough_coins")
  const summary = getShopCheckoutSummary(checkout, 880)
  assert.equal(summary.purchasedCount, 1)
  assert.equal(summary.failedCount, 1)
  assert.equal(summary.notChargedCount, 1)
  assert.equal(summary.canConfirm, false)
})

test("a save failure after the purchases keeps every tick and reports the look as not applied", () => {
  let checkout = reduceShopCheckout(open(), { type: "confirm" })
  for (const { productId } of queue) {
    checkout = reduceShopCheckout(checkout, { type: "purchase_succeeded", productId })
  }
  checkout = reduceShopCheckout(checkout, { type: "applying" })
  checkout = reduceShopCheckout(checkout, { type: "apply_failed" })
  assert.equal(checkout.phase, "apply_failed")
  assert.ok(checkout.lines.every((line) => line.status === "purchased"))
})

test("only review and finished checkouts can be dismissed; purchases in flight cannot", () => {
  const review = open()
  const purchasing = reduceShopCheckout(review, { type: "confirm" })
  const applying = reduceShopCheckout(purchasing, { type: "applying" })
  assert.equal(isShopCheckoutDismissible(review), true)
  assert.equal(isShopCheckoutDismissible(purchasing), false)
  assert.equal(isShopCheckoutDismissible(applying), false)
  assert.equal(isShopCheckoutDismissible(reduceShopCheckout(applying, { type: "applied" })), true)
  assert.equal(isShopCheckoutDismissible(reduceShopCheckout(applying, { type: "apply_failed" })), true)
  assert.equal(isShopCheckoutDismissible(null), true)
})

test("events out of phase are ignored", () => {
  const review = open()
  assert.equal(reduceShopCheckout(review, { type: "purchase_succeeded", productId: "top" }), review)
  assert.equal(reduceShopCheckout(review, { type: "applied" }), review)
  const purchasing = reduceShopCheckout(review, { type: "confirm" })
  assert.equal(reduceShopCheckout(purchasing, { type: "confirm" }), purchasing)
})
