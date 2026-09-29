import {
  COIN_PACKS as DOMAIN_COIN_PACKS,
  type CoinPackProductId
} from "@blumi/domain"

// The shared domain catalog is the single source of coin pack IDs and prices;
// the server credits purchases against the same list.
export const COIN_PACKS = DOMAIN_COIN_PACKS.map((pack) => ({
  id: pack.productId,
  coins: pack.coins,
  launchPriceUsdCents: pack.usdPriceCents,
  type: "consumable" as const
}))

export type CoinPackId = CoinPackProductId
/** Matches the server's RevenueCat verified transaction contract. */
export type CoinPackStore = "ios" | "android"

export interface CoinPackTransactionProof {
  productId: CoinPackId
  transactionId: string
  store: CoinPackStore
  purchasedAt?: string
}

export interface CoinPackStoreProduct {
  id: CoinPackId
  priceString: string
}

export type NativeCoinPackPurchaseResult =
  | { status: "cancelled" }
  | { status: "pending" }
  | { status: "purchased"; transaction: CoinPackTransactionProof }

/**
 * Small structural boundary around `react-native-purchases`. Keeping the SDK
 * outside the domain flow makes it testable and ensures an absent native
 * module fails closed instead of falling back to a local coin grant.
 */
export interface RevenueCatNativeBridge {
  configure: (input: { apiKey: string }) => Promise<void>
  logIn: (userId: string) => Promise<void>
  logOut: () => Promise<void>
  getProducts: (productIds: readonly CoinPackId[]) => Promise<readonly CoinPackStoreProduct[]>
  purchaseProduct: (productId: CoinPackId) => Promise<NativeCoinPackPurchaseResult>
}

export interface RevenueCatCoinPackClient {
  readonly isAvailable: boolean
  syncAuthenticatedUser: (userId: string | undefined) => Promise<void>
  getCoinPackProducts: () => Promise<readonly CoinPackStoreProduct[]>
  purchaseCoinPack: (packId: CoinPackId) => Promise<NativeCoinPackPurchaseResult>
}

export interface CreateRevenueCatCoinPackClientInput {
  apiKey: string | undefined
  bridge?: RevenueCatNativeBridge
}

export function isCoinPackId(value: string): value is CoinPackId {
  return COIN_PACKS.some((pack) => pack.id === value)
}

export function createRevenueCatCoinPackClient(
  input: CreateRevenueCatCoinPackClientInput
): RevenueCatCoinPackClient {
  const apiKey = input.apiKey?.trim()
  const bridge = input.bridge
  let configured = false
  let authenticatedUserId: string | undefined
  let requestedUserId: string | undefined
  let pendingIdentityChanges = 0
  let identityQueue = Promise.resolve()

  const ensureAvailable = async (): Promise<RevenueCatNativeBridge> => {
    if (!apiKey || !bridge) {
      throw new Error("Coin packs are not available in this build.")
    }
    if (!configured) {
      await bridge.configure({ apiKey })
      configured = true
    }
    return bridge
  }

  return {
    isAvailable: Boolean(apiKey && bridge),
    syncAuthenticatedUser(userId: string | undefined): Promise<void> {
      const normalizedUserId = userId?.trim() || undefined
      // Record intent before awaiting SDK work: a pending login must not make
      // a later logout look like a no-op or authorize a stale-account purchase.
      requestedUserId = normalizedUserId
      pendingIdentityChanges += 1
      const operation = identityQueue.then(async () => {
        if (authenticatedUserId === normalizedUserId) return
        const resolvedBridge = await ensureAvailable()
        if (authenticatedUserId) {
          await resolvedBridge.logOut()
          authenticatedUserId = undefined
        }
        if (normalizedUserId) {
          await resolvedBridge.logIn(normalizedUserId)
          authenticatedUserId = normalizedUserId
        }
      }).finally(() => {
        pendingIdentityChanges -= 1
      })
      // A failed transition rejects its caller but cannot poison later logout
      // or retry operations. Purchasing remains closed until identity agrees.
      identityQueue = operation.catch(() => undefined)
      return operation
    },
    async getCoinPackProducts(): Promise<readonly CoinPackStoreProduct[]> {
      const resolvedBridge = await ensureAvailable()
      const products = await resolvedBridge.getProducts(COIN_PACKS.map((pack) => pack.id))
      return products.filter((product) => isCoinPackId(product.id))
    },
    async purchaseCoinPack(packId: CoinPackId): Promise<NativeCoinPackPurchaseResult> {
      if (!isCoinPackId(packId)) {
        throw new Error("That coin pack is not available.")
      }
      const resolvedBridge = await ensureAvailable()
      if (
        pendingIdentityChanges > 0 ||
        !authenticatedUserId ||
        authenticatedUserId !== requestedUserId
      ) {
        throw new Error("Sign in before purchasing coin packs.")
      }
      const result = await resolvedBridge.purchaseProduct(packId)
      if (result.status !== "purchased") return result
      if (result.transaction.productId !== packId || !isValidTransaction(result.transaction)) {
        throw new Error("The store purchase proof could not be verified.")
      }
      return result
    }
  }
}

function isValidTransaction(value: CoinPackTransactionProof): boolean {
  return (
    isCoinPackId(value.productId) &&
    value.transactionId.trim().length > 0 &&
    (value.store === "ios" || value.store === "android") &&
    (value.purchasedAt === undefined || !Number.isNaN(Date.parse(value.purchasedAt)))
  )
}
