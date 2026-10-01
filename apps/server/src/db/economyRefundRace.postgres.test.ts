import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import type { EconomyCoinTransactionInput } from "../economy/economyRepository"
import { createPostgresEconomyRepository } from "./postgresEconomyRepository"

const requirePostgres = { skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" }
const AT = "2026-10-01T10:00:00.000Z"

function openPool(): Pool {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

test("a credit and its refund that run at the same moment settle to zero: neither misses the other's ledger row", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const userId = `user_race_${suffix}`
  const transactionId = `transaction_race_${suffix}`
  const repository = createPostgresEconomyRepository(pool)
  const event = (kind: "credit" | "reversal"): EconomyCoinTransactionInput => ({
    provider: "revenuecat",
    eventId: `event_${kind}_${suffix}`,
    transactionId,
    userId,
    productId: "com.blumi.mobile.coins.500",
    store: "ios",
    kind,
    coins: 500,
    payloadHash: (kind === "credit" ? "a" : "b").repeat(64),
    occurredAt: AT,
    updatedAt: AT
  })
  const holder = await pool.connect()
  try {
    await pool.query(
      `INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [`account_${userId}`, userId, `+1555${String(Date.now()).slice(-7)}`]
    )
    await repository.ensureInventory({
      userId, starterCoins: 0, requiredAvatarItemIds: [], requiredRoomItemIds: [], updatedAt: AT
    })

    // An uncommitted insert of the same store transaction makes both webhook
    // statements wait at the same point, so they run at the same moment.
    await holder.query("BEGIN")
    await holder.query(
      `INSERT INTO blumi_store_transactions (provider, provider_transaction_id, user_id, product_id, store,
         payload_hash, created_at, updated_at)
       VALUES ('revenuecat', $1, $2, 'com.blumi.mobile.coins.500', 'ios', $3, $4, $4)`,
      [transactionId, userId, "a".repeat(64), new Date(AT)]
    )
    const credit = repository.applyCoinTransaction(event("credit"))
    await pause(200)
    const reversal = repository.applyCoinTransaction(event("reversal"))
    await pause(200)
    await holder.query("COMMIT")
    const [credited, reversed] = await Promise.all([credit, reversal])
    assert.equal(credited.conflict, null)
    assert.equal(reversed.conflict, null)

    const inventory = await repository.getInventory(userId)
    assert.equal(inventory?.coins, 0, "the refund reversed the credit")
    assert.equal(inventory?.coinDebt, 0)
    const ledger = await pool.query(
      `SELECT entry_type FROM blumi_economy_iap_ledger WHERE provider_transaction_id = $1 ORDER BY entry_type`,
      [transactionId]
    )
    assert.deepEqual(ledger.rows.map((row) => row.entry_type), ["credit", "reversal"])
  } finally {
    holder.release()
    await pool.end()
  }
})
