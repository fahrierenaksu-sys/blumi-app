import type { InventoryHydrationStatus } from "../inventory/inventoryScopeModel"
import type { AppLocale } from "../session/appLocale"
import { getShopCopy } from "./shopCopy"

export type ShopPresentationState = "loading" | "offline" | "empty" | "error" | "ready"

export interface ShopPresentationInput {
  isProduction: boolean
  isConnected: boolean
  isReady: boolean
  hydrationStatus: InventoryHydrationStatus
  productCount: number
}

export function getShopPresentationState(
  input: ShopPresentationInput
): ShopPresentationState {
  if (input.isProduction && !input.isConnected) return "offline"
  if (input.hydrationStatus === "failed") return "error"
  if (!input.isReady || input.hydrationStatus === "loading") return "loading"
  if (input.productCount === 0) return "empty"
  return "ready"
}

export function shouldRenderShopContent(input: {
  state: ShopPresentationState
  isReady: boolean
  productCount: number
}): boolean {
  if (input.state === "ready") return true
  return input.state === "offline" && input.isReady && input.productCount > 0
}

export interface ShopInteractionPolicy {
  /** Cached products may be browsed and previewed, but never mutate remotely. */
  isReadOnly: boolean
  disabledReason?: string
}

/**
 * Keep this policy beside the presentation state so all Shop actions share the
 * same offline behaviour. The screen passes it to both the primary action and
 * the action coordinator as defence in depth.
 */
export function getShopInteractionPolicy(input: {
  state: ShopPresentationState
  isProduction: boolean
}): ShopInteractionPolicy {
  if (input.isProduction && input.state === "offline") {
    return {
      isReadOnly: true,
      disabledReason: "Reconnect to unlock, equip, place, or buy coin packs."
    }
  }
  return { isReadOnly: false }
}

/** What the status card's button does: try loading again, or open what the person already owns. */
export type ShopStatusAction = "retry" | "openWardrobe" | "openRoom"

export interface ShopStatusContent {
  title: string
  body: string
  testID: string
  /** Absent while loading: there is nothing to press yet. */
  action?: { kind: ShopStatusAction; label: string; accessibilityLabel: string }
}

/**
 * The status card for a shop that cannot show products. An empty tab is not an outage (beta-2 smoke): nothing is for
 * sale, so it never offers a retry and instead points to the Wardrobe (avatar tab) or the room (home tab).
 */
export function getShopStatusContent(input: {
  state: Exclude<ShopPresentationState, "ready">
  mode: "avatar" | "home"
  locale: AppLocale
}): ShopStatusContent {
  const copy = getShopCopy(input.locale)
  const retry = { kind: "retry" as const, label: copy.retry, accessibilityLabel: copy.retryAccessibility }
  switch (input.state) {
    case "loading":
      return { title: copy.loading.title, body: copy.loading.body, testID: "shop-status-loading" }
    case "offline":
      return { title: copy.offline.title, body: copy.offline.body, testID: "shop-status-offline", action: retry }
    case "error":
      return { title: copy.error.title, body: copy.error.body, testID: "shop-status-error", action: retry }
    case "empty": {
      const empty = copy.empty[input.mode]
      return {
        title: empty.title,
        body: empty.body,
        testID: "shop-status-empty",
        action: {
          kind: input.mode === "avatar" ? "openWardrobe" : "openRoom",
          label: empty.action,
          accessibilityLabel: empty.actionAccessibility
        }
      }
    }
  }
}
