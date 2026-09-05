import Purchases, {
  PURCHASES_ERROR_CODE
} from "react-native-purchases"
import { Platform } from "react-native"
import {
  COIN_PACKS,
  isCoinPackId,
  type CoinPackId,
  type CoinPackStore,
  type NativeCoinPackPurchaseResult,
  type RevenueCatNativeBridge
} from "./revenueCatCoinPackClient"

type RevenueCatSdk = Pick<
  typeof Purchases,
  | "configure"
  | "getProducts"
  | "logIn"
  | "logOut"
  | "purchaseStoreProduct"
  | "PRODUCT_CATEGORY"
> & {
  PURCHASES_ERROR_CODE: typeof PURCHASES_ERROR_CODE
}

export interface CreateReactNativeRevenueCatBridgeInput {
  sdk?: RevenueCatSdk
  platform?: "ios" | "android" | string
}

/**
 * The only module that speaks to the RevenueCat native SDK. It never creates
 * a wallet value: the returned transaction proof must still be reconciled by
 * the authenticated Blumi server.
 */
export function createReactNativeRevenueCatBridge(
  input: CreateReactNativeRevenueCatBridgeInput = {}
): RevenueCatNativeBridge {
  const sdk = input.sdk ?? Purchases
  const store = resolveStore(input.platform ?? Platform.OS)

  return {
    configure: async ({ apiKey }) => {
      if (!store) throw new Error("Coin packs are not available on this platform.")
      sdk.configure({ apiKey })
    },
    logIn: async (userId) => {
      await sdk.logIn(userId)
    },
    logOut: async () => {
      await sdk.logOut()
    },
    getProducts: async (productIds) => {
      const products = await sdk.getProducts(
        [...productIds],
        sdk.PRODUCT_CATEGORY.NON_SUBSCRIPTION
      )
      return products
        .filter((product) => isCoinPackId(product.identifier))
        .map((product) => ({
          id: product.identifier as CoinPackId,
          priceString: product.priceString
        }))
    },
    purchaseProduct: async (productId) => {
      if (!store) throw new Error("Coin packs are not available on this platform.")
      const products = await sdk.getProducts(
        [productId],
        sdk.PRODUCT_CATEGORY.NON_SUBSCRIPTION
      )
      const product = products.find((candidate) => candidate.identifier === productId)
      if (!product) throw new Error("That coin pack is not available from this store.")

      try {
        const result = await sdk.purchaseStoreProduct(product)
        if (result.productIdentifier !== productId || result.transaction.productIdentifier !== productId) {
          throw new Error("The store returned an unexpected product.")
        }
        return {
          status: "purchased",
          transaction: {
            productId,
            transactionId: result.transaction.transactionIdentifier,
            store,
            purchasedAt: result.transaction.purchaseDate
          }
        } satisfies NativeCoinPackPurchaseResult
      } catch (error) {
        if (isRevenueCatPurchaseError(error, sdk.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)) {
          return { status: "cancelled" }
        }
        if (isRevenueCatPurchaseError(error, sdk.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR)) {
          return { status: "pending" }
        }
        throw error
      }
    }
  }
}

function resolveStore(platform: string): CoinPackStore | undefined {
  if (platform === "ios") return "ios"
  if (platform === "android") return "android"
  return undefined
}

function isRevenueCatPurchaseError(error: unknown, expectedCode: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === expectedCode
  )
}

export function getR1CoinPackIds(): readonly CoinPackId[] {
  return COIN_PACKS.map((pack) => pack.id)
}
