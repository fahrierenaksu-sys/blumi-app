import { createHash } from "node:crypto"
import { findCoinPack } from "@blumi/domain"
import type { EconomyInventoryRecord } from "../economy/economyRepository"
import type { EconomyService } from "../economy/economyService"
import type { RevenueCatStore, RevenueCatWebhookTransactionKind } from "./revenueCatWebhook"

export type CommerceTransactionKind = RevenueCatWebhookTransactionKind

export interface VerifiedCoinTransaction {
  eventId: string
  transactionId: string
  userId: string
  productId: string
  store: RevenueCatStore
  kind: CommerceTransactionKind
  occurredAt: string
  providerPayload: unknown
}

export interface AppliedCoinTransaction {
  applied: boolean
  inventory: EconomyInventoryRecord
  productId: string
  coins: number
}

export interface CommerceService {
  getInventory(userId: string, now?: Date): Promise<EconomyInventoryRecord>
  reconcile(
    authenticatedUserId: string,
    transactions: readonly VerifiedCoinTransaction[],
    now?: Date
  ): Promise<AppliedCoinTransaction[]>
  applyVerifiedTransaction(
    transaction: VerifiedCoinTransaction,
    now?: Date
  ): Promise<AppliedCoinTransaction>
}

export class CommerceAuthorizationError extends Error {
  readonly code = "COMMERCE_TRANSACTION_ACCOUNT_MISMATCH"
  readonly statusCode = 409

  constructor() {
    super("That purchase does not belong to this account.")
    this.name = "CommerceAuthorizationError"
  }
}

export class CommerceVerificationError extends Error {
  readonly code = "COMMERCE_TRANSACTION_INVALID"
  readonly statusCode = 409

  constructor(message = "That purchase could not be verified.") {
    super(message)
    this.name = "CommerceVerificationError"
  }
}

export function createCommerceService(input: {
  economyService: EconomyService
}): CommerceService {
  return {
    async getInventory(userId, now = new Date()) {
      return input.economyService.getInventory(userId, now)
    },
    async reconcile(authenticatedUserId, transactions, now = new Date()) {
      return Promise.all(transactions.map(async (transaction) => {
        if (transaction.userId !== authenticatedUserId) {
          throw new CommerceAuthorizationError()
        }
        return this.applyVerifiedTransaction(transaction, now)
      }))
    },
    async applyVerifiedTransaction(transaction, now = new Date()) {
      const normalized = normalizeVerifiedTransaction(transaction)
      const coinPack = findCoinPack(normalized.productId)
      if (!coinPack) throw new CommerceVerificationError()

      await input.economyService.getInventory(normalized.userId, now)
      const result = await input.economyService.repository.applyCoinTransaction({
        provider: "revenuecat",
        eventId: normalized.eventId,
        transactionId: normalized.transactionId,
        userId: normalized.userId,
        productId: normalized.productId,
        store: normalized.store,
        kind: normalized.kind,
        coins: coinPack.coins,
        payloadHash: createProviderPayloadHash(normalized.providerPayload),
        occurredAt: normalized.occurredAt,
        updatedAt: now.toISOString()
      })
      if (result.conflict === "account") throw new CommerceAuthorizationError()
      if (result.conflict === "transaction") {
        throw new CommerceVerificationError(
          "That purchase conflicts with an existing transaction."
        )
      }
      return {
        ...result,
        productId: coinPack.productId,
        coins: coinPack.coins
      }
    }
  }
}

function normalizeVerifiedTransaction(
  transaction: VerifiedCoinTransaction
): VerifiedCoinTransaction {
  const eventId = normalizeIdentifier(transaction.eventId)
  const transactionId = normalizeIdentifier(transaction.transactionId)
  const userId = normalizeIdentifier(transaction.userId)
  const productId = normalizeIdentifier(transaction.productId)
  if (!eventId || !transactionId || !userId || !productId) {
    throw new CommerceVerificationError()
  }
  if (transaction.store !== "ios" && transaction.store !== "android") {
    throw new CommerceVerificationError()
  }
  if (transaction.kind !== "credit" && transaction.kind !== "reversal") {
    throw new CommerceVerificationError()
  }
  const occurredAt = new Date(transaction.occurredAt)
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new CommerceVerificationError()
  }
  return {
    ...transaction,
    eventId,
    transactionId,
    userId,
    productId,
    occurredAt: occurredAt.toISOString()
  }
}

function normalizeIdentifier(value: string): string | null {
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= 255 ? normalized : null
}

function createProviderPayloadHash(payload: unknown): string {
  const serialized = typeof payload === "string"
    ? payload
    : JSON.stringify(payload)
  if (!serialized) throw new CommerceVerificationError()
  return createHash("sha256").update(serialized, "utf8").digest("hex")
}
