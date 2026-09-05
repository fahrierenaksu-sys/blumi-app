import { findCoinPack } from "@blumi/domain"
import { matchesPurchaseEnvironment, type PurchaseEnvironment } from "./purchaseEnvironment"
import {
  CommerceAuthorizationError,
  CommerceVerificationError,
  type VerifiedCoinTransaction
} from "./commerceService"

export type RevenueCatReconciliationResult =
  | { transactionId: string; kind: "verified"; transaction: VerifiedCoinTransaction }
  | { transactionId: string; kind: "pending" }

export interface RevenueCatPurchaseVerifier {
  verifyTransactions(input: {
    userId: string
    transactionIds: readonly string[]
  }): Promise<RevenueCatReconciliationResult[]>
}

const REVENUECAT_PURCHASE_LOOKUP_TIMEOUT_MS = 8_000

export class CommerceProviderUnavailableError extends Error {
  readonly code = "COMMERCE_VERIFICATION_UNAVAILABLE"
  readonly statusCode = 503

  constructor() {
    super("Purchases are temporarily unavailable. Try again shortly.")
    this.name = "CommerceProviderUnavailableError"
  }
}

export function createUnavailableRevenueCatPurchaseVerifier(): RevenueCatPurchaseVerifier {
  return {
    async verifyTransactions() {
      throw new CommerceProviderUnavailableError()
    }
  }
}

export function createRevenueCatApiPurchaseVerifier(input: {
  apiKey: string
  projectId: string
  coinProductIdMap: Readonly<Record<string, string>>
  fetcher?: typeof fetch
  timeoutMs?: number
  purchaseEnvironment?: PurchaseEnvironment
}): RevenueCatPurchaseVerifier {
  const fetcher = input.fetcher ?? fetch
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs)
  if (!input.apiKey || !input.projectId) {
    return createUnavailableRevenueCatPurchaseVerifier()
  }

  return {
    async verifyTransactions({ userId, transactionIds }) {
      return Promise.all(transactionIds.map(async (transactionId) => {
        let response: Response
        let payload: unknown
        const controller = new AbortController()
        const timeout = setTimeout(
          () => controller.abort(),
          timeoutMs
        )
        try {
          response = await fetcher(
            createPurchaseLookupUrl(input.projectId, transactionId),
            {
              headers: {
                authorization: `Bearer ${input.apiKey}`
              },
              signal: controller.signal
            }
          )
          if (response.status === 404) return { transactionId, kind: "pending" }
          if (!response.ok) throw new CommerceProviderUnavailableError()
          payload = await response.json()
        } catch {
          throw new CommerceProviderUnavailableError()
        } finally {
          clearTimeout(timeout)
        }
        const purchase = findMatchingPurchase(payload, transactionId)
        if (!purchase) return { transactionId, kind: "pending" }
        if (purchase.customerId !== userId) throw new CommerceAuthorizationError()
        if (!matchesPurchaseEnvironment(purchase.raw.environment, input.purchaseEnvironment)) {
          return { transactionId, kind: "pending" }
        }
        const productId = input.coinProductIdMap[purchase.productId]
        if (!productId || !findCoinPack(productId) || purchase.status !== "owned") {
          return { transactionId, kind: "pending" }
        }
        const store = normalizeStore(purchase.store)
        if (!store) return { transactionId, kind: "pending" }
        return {
          transactionId,
          kind: "verified",
          transaction: {
            eventId: `reconcile:${purchase.id}`,
            transactionId,
            userId,
            productId,
            store,
            kind: "credit",
            occurredAt: new Date(purchase.purchasedAt).toISOString(),
            providerPayload: purchase.raw
          }
        }
      }))
    }
  }
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (value === undefined) return REVENUECAT_PURCHASE_LOOKUP_TIMEOUT_MS
  if (!Number.isSafeInteger(value) || value < 1 || value > 30_000) {
    return REVENUECAT_PURCHASE_LOOKUP_TIMEOUT_MS
  }
  return value
}

function createPurchaseLookupUrl(projectId: string, transactionId: string): string {
  const url = new URL(
    `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/purchases`
  )
  url.searchParams.set("store_purchase_identifier", transactionId)
  return url.toString()
}

function findMatchingPurchase(payload: unknown, transactionId: string): {
  id: string
  customerId: string
  productId: string
  store: string
  status: string
  purchasedAt: number
  raw: Record<string, unknown>
} | null {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return null
  for (const item of payload.items) {
    if (!isRecord(item)) continue
    const storePurchaseIdentifier = readString(item.store_purchase_identifier)
    if (storePurchaseIdentifier !== transactionId) continue
    const id = readString(item.id)
    const customerId = readString(item.customer_id)
    const productId = readString(item.product_id)
    const store = readString(item.store)
    const status = readString(item.status)
    const purchasedAt = item.purchased_at
    if (
      !id ||
      !customerId ||
      !productId ||
      !store ||
      !status ||
      typeof purchasedAt !== "number" ||
      !Number.isSafeInteger(purchasedAt) ||
      !Number.isFinite(new Date(purchasedAt).getTime())
    ) {
      throw new CommerceVerificationError()
    }
    return { id, customerId, productId, store, status, purchasedAt, raw: item }
  }
  return null
}

function normalizeStore(value: string): "ios" | "android" | null {
  if (value === "app_store" || value === "APP_STORE") return "ios"
  if (value === "play_store" || value === "PLAY_STORE") return "android"
  return null
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= 255 ? normalized : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
