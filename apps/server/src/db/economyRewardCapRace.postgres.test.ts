import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresEconomyRepository } from "./postgresEconomyRepository"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "./disposablePostgres"

const requirePostgres = { skip: disposablePostgresSkip().skip }
const AT = "2026-10-01T10:00:00.000Z"
const WINDOW_START = "2026-09-24T10:00:00.000Z"
const CAP = 3
const PARALLEL_CLAIMS = 8
const REWARD_COINS = 50

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

test("parallel capped reward claims for one user pay exactly the cap, never more", requirePostgres, async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  // One connection per claim plus the holder, so every claim can run at once.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: PARALLEL_CLAIMS + 2 })
  const suffix = randomUUID()
  const userId = `user_cap_race_${suffix}`
  const repository = createPostgresEconomyRepository(pool)
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

    // Holding the inventory row makes every claim that already counted the
    // ledger wait at its balance update, so all of them are in flight at once
    // when the holder lets go: without serialisation each would count zero.
    await holder.query("BEGIN")
    await holder.query("SELECT 1 FROM blumi_economy_inventories WHERE user_id = $1 FOR UPDATE", [userId])
    const claims = Array.from({ length: PARALLEL_CLAIMS }, (_, index) => repository.claimReward({
      userId,
      rewardType: "mutual_match",
      idempotencyKey: `pair:${index}`,
      coins: REWARD_COINS,
      createdAt: AT,
      windowCap: { since: WINDOW_START, maxClaims: CAP }
    }))
    await pause(300)
    await holder.query("COMMIT")
    const results = await Promise.all(claims)

    assert.equal(results.filter((result) => result.claimed).length, CAP)
    const ledger = await pool.query(
      `SELECT count(*)::int AS claims FROM blumi_economy_reward_ledger WHERE user_id = $1 AND reward_type = 'mutual_match'`,
      [userId]
    )
    assert.equal(ledger.rows[0]?.claims, CAP)
    const inventory = await repository.getInventory(userId)
    assert.equal(inventory?.coins, CAP * REWARD_COINS)
  } finally {
    holder.release()
    await pool.end()
  }
})

test("parallel uncapped reward claims with distinct keys all pay", requirePostgres, async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: PARALLEL_CLAIMS + 1 })
  const suffix = randomUUID()
  const userId = `user_uncapped_${suffix}`
  const repository = createPostgresEconomyRepository(pool)
  try {
    await pool.query(
      `INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [`account_${userId}`, userId, `+1556${String(Date.now()).slice(-7)}`]
    )
    await repository.ensureInventory({
      userId, starterCoins: 0, requiredAvatarItemIds: [], requiredRoomItemIds: [], updatedAt: AT
    })
    const results = await Promise.all(Array.from({ length: PARALLEL_CLAIMS }, (_, index) => repository.claimReward({
      userId, rewardType: "room_complete", idempotencyKey: `room:${index}`, coins: REWARD_COINS, createdAt: AT
    })))
    assert.equal(results.filter((result) => result.claimed).length, PARALLEL_CLAIMS)
    assert.equal((await repository.getInventory(userId))?.coins, PARALLEL_CLAIMS * REWARD_COINS)
  } finally {
    await pool.end()
  }
})
