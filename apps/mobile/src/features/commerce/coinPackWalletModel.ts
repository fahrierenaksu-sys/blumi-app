export type CoinPackWalletPhase = "idle" | "processing" | "pending" | "failed"
export type CoinPackWalletStateKind =
  | "ready"
  | "offline"
  | "unavailable"
  | "processing"
  | "pending"
  | "error"

export interface CoinPackWalletState {
  kind: CoinPackWalletStateKind
  canPurchase: boolean
}

/**
 * Purchase availability is intentionally conservative. Catalog browsing can
 * remain available elsewhere in Shop, but a wallet mutation needs both an
 * online connection and a configured native provider.
 */
export function getCoinPackWalletState(input: {
  isConnected: boolean
  providerAvailable: boolean
  phase: CoinPackWalletPhase
}): CoinPackWalletState {
  if (!input.providerAvailable) return { kind: "unavailable", canPurchase: false }
  if (!input.isConnected) return { kind: "offline", canPurchase: false }
  if (input.phase === "processing") return { kind: "processing", canPurchase: false }
  if (input.phase === "pending") return { kind: "pending", canPurchase: false }
  if (input.phase === "failed") return { kind: "error", canPurchase: false }
  return { kind: "ready", canPurchase: true }
}
