import type { ShopCheckout } from "../shopCheckoutModel"

/**
 * The purchase flight: a bought piece's shelf thumbnail flies onto the
 * avatar. It only ever follows a server-confirmed purchase and only
 * decorates it (the purchase, inventory and balance are already settled).
 */
export const SHOP_PURCHASE_FLIGHT_CHANNEL = "shop-purchase"
/** One hero per moment: a big look flies its first few pieces only. */
export const SHOP_PURCHASE_FLIGHT_MAX_ITEMS = 3

/**
 * The pieces to fly when a checkout sheet closes: lines the server
 * confirmed as purchased, in order. Nothing while the sheet is still open
 * (it covers the avatar), nothing for an owned-only look, and nothing for a
 * line that failed or was never charged.
 */
export function getShopCheckoutFlightProductIds(
  previous: ShopCheckout | null,
  next: ShopCheckout | null
): string[] {
  if (!previous || next) return []
  return previous.lines
    .filter((line) => line.status === "purchased")
    .slice(0, SHOP_PURCHASE_FLIGHT_MAX_ITEMS)
    .map((line) => line.productId)
}
