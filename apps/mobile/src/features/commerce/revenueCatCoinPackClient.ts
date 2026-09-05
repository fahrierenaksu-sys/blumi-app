export const COIN_PACKS = [
  {
    id: "com.blumi.mobile.coins.500",
    coins: 500,
    launchPriceUsdCents: 199,
    type: "consumable"
  },
  {
    id: "com.blumi.mobile.coins.1500",
    coins: 1500,
    launchPriceUsdCents: 499,
    type: "consumable"
  },
  {
    id: "com.blumi.mobile.coins.4000",
    coins: 4000,
    launchPriceUsdCents: 999,
    type: "consumable"
  }
] as const

export type CoinPackId = (typeof COIN_PACKS)[number]["id"]
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
    async syncAuthenticatedUser(userId: string | undefined): Promise<void> {
      const normalizedUserId = userId?.trim() || undefined
      if (!normalizedUserId) {
        if (!authenticatedUserId) return
        const resolvedBridge = await ensureAvailable()
        await resolvedBridge.logOut()
        authenticatedUserId = undefined
        return
      }
      if (authenticatedUserId === normalizedUserId) return

      const resolvedBridge = await ensureAvailable()
      if (authenticatedUserId) {
        await resolvedBridge.logOut()
      }
      await resolvedBridge.logIn(normalizedUserId)
      authenticatedUserId = normalizedUserId
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
      if (!authenticatedUserId) {
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
