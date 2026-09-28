import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresEconomyRepository } from "./postgresEconomyRepository"
import { auditDatabaseRelease } from "../operations/databaseReleaseAudit"

const databaseUrl = process.env.DATABASE_URL?.trim()

test("inventory constraints and atomic purchase survive concurrent requests", {
  skip: !databaseUrl
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 })
  const suffix = randomUUID()
  const userId = `release_integrity_${suffix}`
  const accountId = `release_integrity_account_${suffix}`
  const itemId = "avatar_v2_top_blush_lace_cardigan"
  try {
    await pool.query(
      `INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [accountId, userId, `+1555${suffix.replaceAll("-", "").slice(0, 7)}`]
    )
    const repository = createPostgresEconomyRepository(pool)
    const first = await repository.ensureInventory({
      userId,
      starterCoins: 1250,
      requiredAvatarItemIds: ["avatar_v2_top_default"],
      requiredRoomItemIds: [],
      updatedAt: new Date().toISOString()
    })
    assert.equal(first.coins, 1250)
    const again = await repository.ensureInventory({
      userId,
      starterCoins: 1250,
      requiredAvatarItemIds: ["avatar_v2_top_default"],
      requiredRoomItemIds: [],
      updatedAt: new Date().toISOString()
    })
    assert.deepEqual(again.ownedAvatarItemIds, ["avatar_v2_top_default"])
    assert.equal(again.coins, 1250)

    const purchase = {
      userId, type: "avatar" as const, itemId,
      grantedItemIds: [] as string[], priceCoins: 390,
      updatedAt: new Date().toISOString()
    }
    const attempts = await Promise.all([
      repository.purchaseItem(purchase),
      repository.purchaseItem(purchase)
    ])
    assert.equal(attempts.filter(Boolean).length, 1)
    const owned = await repository.getInventory(userId)
    assert.equal(owned?.coins, 860)
    assert.equal(owned?.ownedAvatarItemIds.filter(id => id === itemId).length, 1)

    await assert.rejects(
      pool.query(
        `UPDATE blumi_economy_inventories SET owned_avatar_item_ids = ARRAY['']::text[] WHERE user_id = $1`,
        [userId]
      ),
      { code: "23514" }
    )
    await assert.rejects(
      pool.query(
        `INSERT INTO blumi_economy_inventories
         (user_id, coins, owned_avatar_item_ids, owned_room_item_ids, updated_at)
         VALUES ($1, 0, '{}', '{}', NOW())`,
        [`missing_${suffix}`]
      ),
      { code: "23503" }
    )
    await pool.query("DELETE FROM blumi_accounts WHERE account_id = $1", [accountId])
    assert.equal(await repository.getInventory(userId), null)
  } finally {
    await pool.query("DELETE FROM blumi_economy_inventories WHERE user_id = $1", [userId])
    await pool.query("DELETE FROM blumi_accounts WHERE account_id = $1", [accountId])
    await pool.end()
  }
})

test("release audit detects catalog drift, duplicate ownership, and exposed API grants", {
  skip: !databaseUrl
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 })
  const suffix = randomUUID()
  const userId = `release_audit_${suffix}`
  const accountId = `release_audit_account_${suffix}`
  try {
    await pool.query(
      `INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [accountId, userId, `+1666${suffix.replaceAll("-", "").slice(0, 7)}`]
    )
    await pool.query(
      `INSERT INTO blumi_economy_inventories
       (user_id, coins, owned_avatar_item_ids, owned_room_item_ids, updated_at)
       VALUES ($1, 1250, ARRAY[$2, $2, $3], '{}', NOW())`,
      [userId, "avatar_v2_top_default", "avatar_v2_top_unknown_release_audit"]
    )
    const cleanGrants = await auditDatabaseRelease(pool)
    assert.equal(cleanGrants.missingMigrations, 0)
    assert.equal(cleanGrants.changedMigrations, 0)
    assert.equal(cleanGrants.duplicateAvatarInventoryRows, 1)
    assert.equal(cleanGrants.unknownOwnedAvatarIds, 1)
    assert.equal(cleanGrants.exposedTables, 0)
    assert.equal(cleanGrants.exposedFunctions, 0)

    await pool.query("GRANT SELECT ON blumi_economy_inventories TO anon")
    const unsafeGrants = await auditDatabaseRelease(pool)
    assert.equal(unsafeGrants.exposedTables, 1)
    await pool.query("CREATE TABLE blumi_release_future_privilege_probe (id integer)")
    const futureGrants = await pool.query(`
      SELECT has_table_privilege('anon', 'blumi_release_future_privilege_probe', 'SELECT') AS anon,
             has_table_privilege('authenticated', 'blumi_release_future_privilege_probe', 'SELECT') AS authenticated
    `)
    assert.deepEqual(futureGrants.rows[0], { anon: false, authenticated: false })
  } finally {
    await pool.query("DROP TABLE IF EXISTS blumi_release_future_privilege_probe")
    await pool.query("REVOKE ALL ON blumi_economy_inventories FROM anon")
    await pool.query("DELETE FROM blumi_accounts WHERE account_id = $1", [accountId])
    await pool.end()
  }
})
