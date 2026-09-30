import assert from "node:assert/strict"
import {
  createInMemoryEconomyRepository,
  type EconomyCoinTransactionInput,
  type EconomyRepository
} from "../economy/economyRepository"
import { createPostgresEconomyRepository } from "./postgresEconomyRepository"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"

const AT = "2026-09-30T10:00:00.000Z"
const LATER = "2026-09-30T11:00:00.000Z"

type Backend = RepositoryContractBackend<EconomyRepository>

async function seedInventory(backend: Backend, coins = 1000) {
  const userId = backend.id("user")
  await backend.ensureUsers(userId)
  const inventory = await backend.repository.ensureInventory({
    userId,
    starterCoins: coins,
    requiredAvatarItemIds: ["avatar_default"],
    requiredRoomItemIds: ["room_default"],
    updatedAt: AT
  })
  return { userId, inventory }
}

function coinEvent(
  backend: Backend,
  userId: string,
  overrides: Partial<EconomyCoinTransactionInput> = {}
): EconomyCoinTransactionInput {
  return {
    provider: "revenuecat",
    eventId: backend.id("event"),
    transactionId: backend.id("transaction"),
    userId,
    productId: "com.blumi.mobile.coins.500",
    store: "ios",
    kind: "credit",
    coins: 500,
    payloadHash: "a".repeat(64),
    occurredAt: AT,
    updatedAt: AT,
    ...overrides
  }
}

runRepositoryContract<EconomyRepository>({
  name: "economy repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryEconomyRepository(),
    postgres: (pool) => createPostgresEconomyRepository(pool)
  },
  cases: {
    "ensureInventory creates once and only appends missing required items": async (backend) => {
      const { userId, inventory } = await seedInventory(backend)
      assert.equal(inventory.coins, 1000)
      assert.equal(inventory.coinDebt, 0)
      assert.equal(await backend.repository.getInventory(backend.id("missing")), null)

      const unchanged = await backend.repository.ensureInventory({
        userId,
        starterCoins: 9999,
        requiredAvatarItemIds: ["avatar_default"],
        requiredRoomItemIds: [],
        updatedAt: LATER
      })
      assert.equal(unchanged.coins, 1000, "starter coins are granted only once")
      assert.equal(unchanged.updatedAt, AT, "no new item means no write timestamp")

      const extended = await backend.repository.ensureInventory({
        userId,
        starterCoins: 9999,
        requiredAvatarItemIds: ["avatar_default", "avatar_new"],
        requiredRoomItemIds: ["room_default"],
        updatedAt: LATER
      })
      assert.deepEqual(extended.ownedAvatarItemIds, ["avatar_default", "avatar_new"])
      assert.deepEqual(extended.ownedRoomItemIds, ["room_default"])
      assert.equal(extended.updatedAt, LATER)
    },

    "purchaseItem debits once and rejects owned, unaffordable, negative or indebted purchases": async (backend) => {
      const { userId } = await seedInventory(backend, 300)
      const purchase = {
        userId,
        type: "avatar" as const,
        itemId: "avatar_hat",
        grantedItemIds: ["avatar_hat_variant", "avatar_hat"],
        priceCoins: 200,
        updatedAt: LATER
      }
      const bought = await backend.repository.purchaseItem(purchase)
      assert.equal(bought?.coins, 100)
      assert.deepEqual(bought?.ownedAvatarItemIds, ["avatar_default", "avatar_hat", "avatar_hat_variant"])

      assert.equal(await backend.repository.purchaseItem(purchase), null, "owned")
      assert.equal(await backend.repository.purchaseItem({ ...purchase, itemId: "avatar_coat", priceCoins: 101 }), null, "unaffordable")
      assert.equal(await backend.repository.purchaseItem({ ...purchase, itemId: "avatar_coat", priceCoins: -50 }), null, "negative price")
      assert.equal(await backend.repository.purchaseItem({ ...purchase, userId: backend.id("missing") }), null, "no inventory")

      await backend.repository.applyCoinTransaction(coinEvent(backend, userId, { kind: "reversal", coins: 500 }))
      const indebted = await backend.repository.getInventory(userId)
      assert.equal(indebted?.coinDebt, 400)
      assert.equal(await backend.repository.purchaseItem({ ...purchase, itemId: "avatar_free", priceCoins: 0 }), null, "debt blocks purchases")
      assert.equal((await backend.repository.getInventory(userId))?.coins, 0)
    },

    "claimReward credits once per idempotency key and never consumes a key without an inventory": async (backend) => {
      const { userId } = await seedInventory(backend, 10)
      const claim = { userId, rewardType: "daily_login" as const, idempotencyKey: "2026-09-30", coins: 25, createdAt: LATER }
      const first = await backend.repository.claimReward(claim)
      const replay = await backend.repository.claimReward(claim)
      assert.equal(first.claimed, true)
      assert.equal(first.inventory.coins, 35)
      assert.equal(replay.claimed, false)
      assert.equal(replay.inventory.coins, 35)
      assert.equal((await backend.repository.claimReward({ ...claim, rewardType: "mutual_match" })).inventory.coins, 60)

      const orphanUserId = backend.id("orphan")
      await backend.ensureUsers(orphanUserId)
      const orphanClaim = { ...claim, userId: orphanUserId }
      await assert.rejects(backend.repository.claimReward(orphanClaim), /inventory is unavailable/)
      await backend.repository.ensureInventory({
        userId: orphanUserId, starterCoins: 0, requiredAvatarItemIds: [], requiredRoomItemIds: [], updatedAt: AT
      })
      const late = await backend.repository.claimReward(orphanClaim)
      assert.equal(late.claimed, true, "a failed claim must not have consumed its key")
      assert.equal(late.inventory.coins, 25)
    },

    "a coin credit applies once; identical replays and second events for the same entry are no-ops": async (backend) => {
      const { userId } = await seedInventory(backend, 1000)
      const credit = coinEvent(backend, userId)
      const first = await backend.repository.applyCoinTransaction(credit)
      assert.deepEqual([first.applied, first.conflict, first.inventory.coins], [true, null, 1500])

      const replay = await backend.repository.applyCoinTransaction({ ...credit, updatedAt: LATER })
      assert.deepEqual([replay.applied, replay.conflict, replay.inventory.coins], [false, null, 1500])

      const secondEvent = await backend.repository.applyCoinTransaction({ ...credit, eventId: backend.id("event_retry") })
      assert.deepEqual([secondEvent.applied, secondEvent.conflict, secondEvent.inventory.coins], [false, null, 1500])
    },

    "a replayed event ID with a different payload hash is reported and changes nothing": async (backend) => {
      const { userId } = await seedInventory(backend, 1000)
      const credit = coinEvent(backend, userId)
      await backend.repository.applyCoinTransaction(credit)

      const tampered = await backend.repository.applyCoinTransaction({ ...credit, payloadHash: "f".repeat(64) })
      assert.deepEqual([tampered.applied, tampered.conflict, tampered.inventory.coins], [false, "event", 1500])

      // Even a reversal reusing the recorded event ID cannot slip through.
      const reusedForReversal = await backend.repository.applyCoinTransaction({
        ...credit, kind: "reversal", payloadHash: "e".repeat(64)
      })
      assert.deepEqual([reusedForReversal.applied, reusedForReversal.conflict], [false, "event"])

      // The event ID reused for an unseen transaction records no transaction.
      const reusedTransaction = backend.id("transaction_new")
      const reusedEvent = await backend.repository.applyCoinTransaction({
        ...credit, transactionId: reusedTransaction, payloadHash: "d".repeat(64)
      })
      assert.deepEqual([reusedEvent.applied, reusedEvent.conflict], [false, "event"])
      const freshUse = await backend.repository.applyCoinTransaction(coinEvent(backend, userId, {
        eventId: backend.id("event_fresh"), transactionId: reusedTransaction, productId: "com.blumi.mobile.coins.1500"
      }))
      assert.equal(freshUse.conflict, null, "the rejected replay did not bind the transaction")
      assert.equal((await backend.repository.getInventory(userId))?.coins, 2000)
    },

    "reversal consumes unused coins first, then records debt that later credits repay": async (backend) => {
      const { userId } = await seedInventory(backend, 100)
      const credit = coinEvent(backend, userId, { coins: 500 })
      await backend.repository.applyCoinTransaction(credit)
      const reversal = await backend.repository.applyCoinTransaction({
        ...credit, eventId: backend.id("event_refund"), kind: "reversal", payloadHash: "b".repeat(64)
      })
      assert.equal(reversal.applied, true)
      assert.deepEqual([reversal.inventory.coins, reversal.inventory.coinDebt], [100, 0])

      const secondReversal = await backend.repository.applyCoinTransaction(coinEvent(backend, userId, {
        eventId: backend.id("event_two"), kind: "reversal", coins: 300, transactionId: backend.id("transaction_two")
      }))
      assert.deepEqual([secondReversal.inventory.coins, secondReversal.inventory.coinDebt], [0, 200])

      const repay = await backend.repository.applyCoinTransaction(coinEvent(backend, userId, {
        eventId: backend.id("event_repay"), transactionId: backend.id("transaction_three"), coins: 500
      }))
      assert.deepEqual([repay.inventory.coins, repay.inventory.coinDebt], [300, 0])
    },

    "a transaction is bound to its first account, pack and store": async (backend) => {
      const owner = await seedInventory(backend, 0)
      const other = { userId: backend.id("other_user") }
      await backend.ensureUsers(other.userId)
      await backend.repository.ensureInventory({
        userId: other.userId, starterCoins: 0, requiredAvatarItemIds: [], requiredRoomItemIds: [], updatedAt: AT
      })
      const credit = coinEvent(backend, owner.userId)
      await backend.repository.applyCoinTransaction(credit)

      const crossAccount = await backend.repository.applyCoinTransaction({
        ...credit, eventId: backend.id("event_cross"), userId: other.userId
      })
      assert.deepEqual([crossAccount.applied, crossAccount.conflict, crossAccount.inventory.coins], [false, "account", 0])

      const otherPack = await backend.repository.applyCoinTransaction({
        ...credit, eventId: backend.id("event_pack"), productId: "com.blumi.mobile.coins.1500"
      })
      assert.deepEqual([otherPack.applied, otherPack.conflict], [false, "transaction"])
      const otherStore = await backend.repository.applyCoinTransaction({
        ...credit, eventId: backend.id("event_store"), store: "android"
      })
      assert.deepEqual([otherStore.applied, otherStore.conflict], [false, "transaction"])
      assert.equal((await backend.repository.getInventory(owner.userId))?.coins, 500)
    },

    "a coin transaction for a missing inventory fails without recording anything": async (backend) => {
      const userId = backend.id("late_user")
      await backend.ensureUsers(userId)
      const credit = coinEvent(backend, userId)
      await assert.rejects(backend.repository.applyCoinTransaction(credit), /inventory is unavailable/)
      await backend.repository.ensureInventory({
        userId, starterCoins: 0, requiredAvatarItemIds: [], requiredRoomItemIds: [], updatedAt: AT
      })
      const retried = await backend.repository.applyCoinTransaction(credit)
      assert.deepEqual([retried.applied, retried.inventory.coins], [true, 500])
    }
  }
})
