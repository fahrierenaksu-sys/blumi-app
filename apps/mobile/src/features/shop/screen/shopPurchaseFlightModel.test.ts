import assert from "node:assert/strict"
import test from "node:test"
import type { ShopCheckout, ShopCheckoutLine } from "../shopCheckoutModel"
import { getShopCheckoutFlightProductIds, SHOP_PURCHASE_FLIGHT_MAX_ITEMS } from "./shopPurchaseFlightModel"

const line = (productId: string, status: ShopCheckoutLine["status"]): ShopCheckoutLine => ({
  productId,
  title: productId,
  priceCoins: 100,
  status
})
const checkout = (phase: ShopCheckout["phase"], lines: ShopCheckoutLine[]): ShopCheckout => ({
  phase,
  lines,
  productIds: lines.map((entry) => entry.productId)
})

test("only server-confirmed purchases fly, and only once the checkout sheet is gone", () => {
  const applied = checkout("applied", [line("top", "purchased"), line("skirt", "purchased")])
  assert.deepEqual(getShopCheckoutFlightProductIds(applied, applied), [], "the sheet is still open")
  assert.deepEqual(getShopCheckoutFlightProductIds(null, applied), [])
  assert.deepEqual(getShopCheckoutFlightProductIds(applied, null), ["top", "skirt"])
})

test("failed, uncharged and never-started lines never fly", () => {
  const partial = checkout("partial", [
    line("top", "purchased"),
    line("skirt", "failed"),
    line("shoes", "not_charged")
  ])
  assert.deepEqual(getShopCheckoutFlightProductIds(partial, null), ["top"])
  const cancelled = checkout("review", [line("top", "pending"), line("skirt", "pending")])
  assert.deepEqual(getShopCheckoutFlightProductIds(cancelled, null), [], "a cancelled review charges and flies nothing")
})

test("a big look flies only its first few pieces", () => {
  const big = checkout("applied", ["a", "b", "c", "d", "e"].map((id) => line(id, "purchased")))
  const flown = getShopCheckoutFlightProductIds(big, null)
  assert.equal(flown.length, SHOP_PURCHASE_FLIGHT_MAX_ITEMS)
  assert.deepEqual(flown, ["a", "b", "c"].slice(0, SHOP_PURCHASE_FLIGHT_MAX_ITEMS))
})
