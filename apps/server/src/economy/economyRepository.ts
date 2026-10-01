import {
  getDefaultOwnedItemIds,
  STARTER_COIN_BALANCE
} from "./economyCatalog"

export interface EconomyInventoryRecord {
  userId: string
  coins: number
  coinDebt: number
  ownedAvatarItemIds: string[]
  ownedRoomItemIds: string[]
  updatedAt: string
}

export interface EconomyRepository {
  getInventory(userId: string): Promise<EconomyInventoryRecord | null>
  ensureInventory(input: EconomyEnsureInventoryInput): Promise<EconomyInventoryRecord>
  purchaseItem(input: EconomyPurchaseInput): Promise<EconomyInventoryRecord | null>
  applyCoinTransaction(
    input: EconomyCoinTransactionInput
  ): Promise<EconomyCoinTransactionResult>
  saveInventory(inventory: EconomyInventoryRecord): Promise<void>
  claimReward(input: EconomyRewardClaim): Promise<EconomyRewardClaimResult>
}

export interface EconomyEnsureInventoryInput {
  userId: string
  starterCoins: number
  requiredAvatarItemIds: string[]
  requiredRoomItemIds: string[]
  updatedAt: string
}

export interface EconomyPurchaseInput {
  userId: string
  type: "avatar" | "room"
  itemId: string
  grantedItemIds: string[]
  priceCoins: number
  updatedAt: string
}

export interface EconomyCoinTransactionInput {
  provider: "revenuecat"
  eventId: string
  transactionId: string
  userId: string
  productId: string
  store: "ios" | "android"
  kind: "credit" | "reversal"
  coins: number
  payloadHash: string
  occurredAt: string
  updatedAt: string
}

/**
 * `account` / `transaction`: the provider transaction is already bound to a
 * different account or pack. `event`: the provider event ID was already
 * recorded with a different payload hash. Every conflict leaves balances,
 * ledgers and recorded events untouched; callers decide how to surface it.
 */
export type EconomyCoinTransactionConflict = "account" | "transaction" | "event"

export interface EconomyCoinTransactionResult {
  applied: boolean
  conflict: EconomyCoinTransactionConflict | null
  inventory: EconomyInventoryRecord
}

export interface EconomyRewardClaim {
  userId: string
  rewardType: "daily_login" | "room_complete" | "mutual_match"
  idempotencyKey: string
  coins: number
  createdAt: string
}

export interface EconomyRewardClaimResult {
  claimed: boolean
  inventory: EconomyInventoryRecord
}

export interface InMemoryEconomyStore {
  inventoriesByUserId: Map<string, EconomyInventoryRecord>
  rewardKeys: Set<string>
  commerceEventPayloadHashes: Map<string, string>
  commerceLedgerKeys: Set<string>
  commerceTransactions: Map<string, {
    userId: string
    productId: string
    store: "ios" | "android"
  }>
}

export function createInMemoryEconomyStore(): InMemoryEconomyStore {
  return {
    inventoriesByUserId: new Map(),
    rewardKeys: new Set(),
    commerceEventPayloadHashes: new Map(),
    commerceLedgerKeys: new Set(),
    commerceTransactions: new Map()
  }
}

export function createDefaultEconomyInventory(
  userId: string,
  now = new Date(0)
): EconomyInventoryRecord {
  return {
    userId,
    coins: STARTER_COIN_BALANCE,
    coinDebt: 0,
    ownedAvatarItemIds: getDefaultOwnedItemIds("avatar"),
    ownedRoomItemIds: getDefaultOwnedItemIds("room"),
    updatedAt: now.toISOString()
  }
}

export function createInMemoryEconomyRepository(
  store: InMemoryEconomyStore = createInMemoryEconomyStore()
): EconomyRepository {
  return {
    async getInventory(userId) {
      const inventory = store.inventoriesByUserId.get(userId)
      return inventory ? cloneInventory(inventory) : null
    },
    async ensureInventory(input) {
      const existing = store.inventoriesByUserId.get(input.userId)
      const inventory = existing
        ? {
            ...existing,
            ownedAvatarItemIds: appendMissingItems(
              existing.ownedAvatarItemIds,
              input.requiredAvatarItemIds
            ),
            ownedRoomItemIds: appendMissingItems(
              existing.ownedRoomItemIds,
              input.requiredRoomItemIds
            ),
            updatedAt: hasMissingItems(existing, input)
              ? input.updatedAt
              : existing.updatedAt
          }
        : {
            userId: input.userId,
            coins: input.starterCoins,
            coinDebt: 0,
            ownedAvatarItemIds: [...input.requiredAvatarItemIds],
            ownedRoomItemIds: [...input.requiredRoomItemIds],
            updatedAt: input.updatedAt
          }
      store.inventoriesByUserId.set(input.userId, cloneInventory(inventory))
      return cloneInventory(inventory)
    },
    async purchaseItem(input) {
      const inventory = store.inventoriesByUserId.get(input.userId)
      if (!inventory) return null
      const ownedKey = input.type === "avatar"
        ? "ownedAvatarItemIds"
        : "ownedRoomItemIds"
      const ownedItemIds = inventory[ownedKey]
      if (
        input.priceCoins < 0 ||
        ownedItemIds.includes(input.itemId) ||
        inventory.coinDebt > 0 ||
        inventory.coins < input.priceCoins
      ) {
        return null
      }
      const grantedItemIds = appendMissingItems(ownedItemIds, [
        input.itemId,
        ...input.grantedItemIds
      ])
      const nextInventory = {
        ...inventory,
        coins: inventory.coins - input.priceCoins,
        [ownedKey]: grantedItemIds,
        updatedAt: input.updatedAt
      }
      store.inventoriesByUserId.set(input.userId, cloneInventory(nextInventory))
      return cloneInventory(nextInventory)
    },
    async saveInventory(inventory) {
      store.inventoriesByUserId.set(inventory.userId, cloneInventory(inventory))
    },
    async applyCoinTransaction(input) {
      const inventory = store.inventoriesByUserId.get(input.userId)
      if (!inventory) throw new Error("Economy inventory is unavailable.")
      const unchanged = (conflict: EconomyCoinTransactionConflict | null) => ({
        applied: false,
        conflict,
        inventory: cloneInventory(inventory)
      })
      const transactionKey = `${input.provider}:${input.transactionId}`
      const previousTransaction = store.commerceTransactions.get(transactionKey)
      if (previousTransaction) {
        const conflict = previousTransaction.userId !== input.userId
          ? "account"
          : previousTransaction.productId !== input.productId ||
              previousTransaction.store !== input.store
            ? "transaction"
            : null
        if (conflict) return unchanged(conflict)
      }
      const eventKey = `${input.provider}:${input.eventId}`
      const previousPayloadHash = store.commerceEventPayloadHashes.get(eventKey)
      if (previousPayloadHash !== undefined) {
        // A replay must carry the payload that was first recorded for its
        // event ID; a different payload is reported, never silently accepted.
        return unchanged(previousPayloadHash === input.payloadHash ? null : "event")
      }
      if (!previousTransaction) {
        store.commerceTransactions.set(transactionKey, {
          userId: input.userId,
          productId: input.productId,
          store: input.store
        })
      }
      store.commerceEventPayloadHashes.set(eventKey, input.payloadHash)

      const ledgerKey = `${input.provider}:${input.transactionId}:${input.kind}`
      if (store.commerceLedgerKeys.has(ledgerKey)) return unchanged(null)
      store.commerceLedgerKeys.add(ledgerKey)
      // Mirrors PostgreSQL: a non-positive amount is recorded but moves no coins.
      if (input.coins <= 0) return unchanged(null)
      // Mirrors PostgreSQL: a refund reverses only a recorded credit, and a
      // credit arriving after its refund moves nothing; both rows are kept.
      const creditRecorded = store.commerceLedgerKeys.has(`${transactionKey}:credit`)
      const reversalRecorded = store.commerceLedgerKeys.has(`${transactionKey}:reversal`)
      if (input.kind === "credit" ? reversalRecorded : !creditRecorded) return unchanged(null)

      const nextInventory = input.kind === "credit"
        ? applyCoinCredit(inventory, input.coins, input.updatedAt)
        : applyCoinReversal(inventory, input.coins, input.updatedAt)
      store.inventoriesByUserId.set(input.userId, cloneInventory(nextInventory))
      return { applied: true, conflict: null, inventory: cloneInventory(nextInventory) }
    },
    async claimReward(input) {
      const inventory = store.inventoriesByUserId.get(input.userId)
      if (!inventory) throw new Error("Economy inventory is unavailable.")
      const ledgerKey = `${input.userId}:${input.rewardType}:${input.idempotencyKey}`
      if (store.rewardKeys.has(ledgerKey)) {
        return { claimed: false, inventory: cloneInventory(inventory) }
      }
      store.rewardKeys.add(ledgerKey)
      // Like a purchased credit, an earned reward repays refund debt first.
      const nextInventory = applyCoinCredit(inventory, input.coins, input.createdAt)
      store.inventoriesByUserId.set(input.userId, cloneInventory(nextInventory))
      return { claimed: true, inventory: cloneInventory(nextInventory) }
    }
  }
}

export function cloneInventory(
  inventory: EconomyInventoryRecord
): EconomyInventoryRecord {
  return {
    ...inventory,
    coinDebt: inventory.coinDebt,
    ownedAvatarItemIds: [...inventory.ownedAvatarItemIds],
    ownedRoomItemIds: [...inventory.ownedRoomItemIds]
  }
}

function applyCoinCredit(
  inventory: EconomyInventoryRecord,
  coins: number,
  updatedAt: string
): EconomyInventoryRecord {
  const debtPaid = Math.min(inventory.coinDebt, coins)
  return {
    ...inventory,
    coins: inventory.coins + coins - debtPaid,
    coinDebt: inventory.coinDebt - debtPaid,
    updatedAt
  }
}

function applyCoinReversal(
  inventory: EconomyInventoryRecord,
  coins: number,
  updatedAt: string
): EconomyInventoryRecord {
  const unusedCoins = Math.min(inventory.coins, coins)
  return {
    ...inventory,
    coins: inventory.coins - unusedCoins,
    coinDebt: inventory.coinDebt + coins - unusedCoins,
    updatedAt
  }
}

function hasMissingItems(
  inventory: EconomyInventoryRecord,
  input: EconomyEnsureInventoryInput
): boolean {
  return input.requiredAvatarItemIds.some(
    (itemId) => !inventory.ownedAvatarItemIds.includes(itemId)
  ) || input.requiredRoomItemIds.some(
    (itemId) => !inventory.ownedRoomItemIds.includes(itemId)
  )
}

function appendMissingItems(
  currentItemIds: string[],
  requiredItemIds: string[]
): string[] {
  return requiredItemIds.reduce<string[]>(
    (itemIds, itemId) => itemIds.includes(itemId)
      ? itemIds
      : [...itemIds, itemId],
    [...currentItemIds]
  )
}
