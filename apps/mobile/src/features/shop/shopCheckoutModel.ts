import type { ShopCombinationQueueItem } from "./shopCombinationState"

/**
 * The "Buy the look" checkout sheet (SHOP-1): one confirmation for every
 * item a look still needs, then one line per item that ticks as the server
 * confirms each purchase. The server stays authoritative: a line is
 * "purchased" only after the inventory store reports a server-confirmed
 * purchase, and the balance shown is the server-confirmed inventory balance.
 */
export type ShopCheckoutPhase =
  | "review"
  | "purchasing"
  | "applying"
  | "applied"
  | "partial"
  | "apply_failed"

export type ShopCheckoutLineStatus =
  | "pending"
  | "purchasing"
  | "purchased"
  | "failed"
  | "not_charged"

export interface ShopCheckoutLine {
  productId: string
  /** Null when the catalog no longer lists the product. */
  title: string | null
  priceCoins: number | null
  status: ShopCheckoutLineStatus
  failureReason?: string
}

export interface ShopCheckout {
  phase: ShopCheckoutPhase
  lines: readonly ShopCheckoutLine[]
  /** The queued ids, in order; the approval must name exactly these. */
  productIds: readonly string[]
}

export type ShopCheckoutEvent =
  | { type: "confirm" }
  | { type: "purchase_started"; productId: string }
  | { type: "purchase_succeeded"; productId: string }
  | { type: "purchase_failed"; productId: string; reason: string }
  | { type: "applying" }
  | { type: "applied" }
  | { type: "apply_failed" }

export function createShopCheckout(input: {
  items: readonly ShopCombinationQueueItem[]
  products: readonly { sourceItemId: string; title: string; priceCoins: number | null }[]
}): ShopCheckout {
  const lines = input.items.map((item): ShopCheckoutLine => {
    const product = input.products.find((entry) => entry.sourceItemId === item.productId)
    return {
      productId: item.productId,
      title: product?.title ?? null,
      priceCoins: product?.priceCoins ?? null,
      status: "pending"
    }
  })
  return { phase: "review", lines, productIds: lines.map((line) => line.productId) }
}

export interface ShopCheckoutSummary {
  /** Sum of every line's price; null when any price is unknown or invalid. */
  total: number | null
  /** Server-confirmed balance minus the total; null when it cannot be paid. */
  balanceAfter: number | null
  /** Coins still missing for the total (0 when affordable or unknown). */
  shortfall: number
  /** Review only: every price known and the verified balance covers it. */
  canConfirm: boolean
  purchasedCount: number
  failedCount: number
  notChargedCount: number
}

/** `balance` is the server-confirmed balance, or null while it is unverified. */
export function getShopCheckoutSummary(
  checkout: ShopCheckout,
  balance: number | null
): ShopCheckoutSummary {
  let total: number | null = 0
  for (const line of checkout.lines) {
    const price = line.priceCoins
    if (price === null || !Number.isSafeInteger(price) || price < 0 || total === null) {
      total = null
      break
    }
    total += price
  }
  const verifiedBalance = balance !== null && Number.isFinite(balance) ? balance : null
  const shortfall = total !== null && verifiedBalance !== null ? Math.max(0, total - verifiedBalance) : 0
  const balanceAfter = total !== null && verifiedBalance !== null && shortfall === 0
    ? verifiedBalance - total
    : null
  const count = (status: ShopCheckoutLineStatus) =>
    checkout.lines.filter((line) => line.status === status).length
  return {
    total,
    balanceAfter,
    shortfall,
    canConfirm: checkout.phase === "review" && balanceAfter !== null && checkout.lines.length > 0,
    purchasedCount: count("purchased"),
    failedCount: count("failed"),
    notChargedCount: count("not_charged")
  }
}

export function reduceShopCheckout(checkout: ShopCheckout, event: ShopCheckoutEvent): ShopCheckout {
  if (event.type === "confirm") {
    return checkout.phase === "review" ? { ...checkout, phase: "purchasing" } : checkout
  }
  if (event.type === "purchase_started" || event.type === "purchase_succeeded") {
    if (checkout.phase !== "purchasing") return checkout
    const status: ShopCheckoutLineStatus = event.type === "purchase_started" ? "purchasing" : "purchased"
    return updateLine(checkout, event.productId, (line) => ({ ...line, status }))
  }
  if (event.type === "purchase_failed") {
    if (checkout.phase !== "purchasing") return checkout
    if (!checkout.lines.some((line) => line.productId === event.productId)) return checkout
    return {
      ...checkout,
      phase: "partial",
      lines: checkout.lines.map((line) => {
        if (line.productId === event.productId) {
          return { ...line, status: "failed", failureReason: event.reason }
        }
        return line.status === "purchased" ? line : { ...line, status: "not_charged" }
      })
    }
  }
  if (event.type === "applying") {
    return checkout.phase === "purchasing" ? { ...checkout, phase: "applying" } : checkout
  }
  if (event.type === "applied" || event.type === "apply_failed") {
    if (checkout.phase !== "applying") return checkout
    return { ...checkout, phase: event.type === "applied" ? "applied" : "apply_failed" }
  }
  return checkout
}

/** Purchases and the avatar save in flight keep the sheet open. */
export function isShopCheckoutDismissible(checkout: ShopCheckout | null): boolean {
  if (!checkout) return true
  return checkout.phase !== "purchasing" && checkout.phase !== "applying"
}

function updateLine(
  checkout: ShopCheckout,
  productId: string,
  update: (line: ShopCheckoutLine) => ShopCheckoutLine
): ShopCheckout {
  const index = checkout.lines.findIndex((line) => line.productId === productId)
  if (index < 0) return checkout
  const lines = [...checkout.lines]
  lines[index] = update(lines[index])
  return { ...checkout, lines }
}
