import type { InventoryHydrationStatus } from "../inventory/inventoryScopeModel"

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
