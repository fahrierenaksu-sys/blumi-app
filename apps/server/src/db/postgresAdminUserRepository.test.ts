import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresAdminUserRepository } from "./postgresAdminUserRepository"
import { AdminQuotaExtensionLimitError, AdminUserNotFoundError } from "../admin/adminUsersService"
import { createAdminUsersService } from "../admin/adminUsersService"

test("PostgreSQL admin search and quota changes are scoped, bounded, concurrent-safe, and audited", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const userId = "admin_console_fixture"
  const now = new Date("2026-09-27T23:50:00.000Z")
  try {
    const publicAccess = await pool.query(
      `SELECT has_table_privilege('anon', 'blumi_admin_user_audit', 'SELECT') AS anon_read,
              has_table_privilege('authenticated', 'blumi_admin_user_audit', 'SELECT') AS user_read,
              has_sequence_privilege('anon', 'blumi_admin_user_audit_sequence_id_seq', 'USAGE') AS anon_sequence,
              has_sequence_privilege('authenticated', 'blumi_admin_user_audit_sequence_id_seq', 'USAGE') AS user_sequence`
    )
    assert.deepEqual(publicAccess.rows[0], {
      anon_read: false, user_read: false, anon_sequence: false, user_sequence: false
    })
    await pool.query(
      `INSERT INTO blumi_accounts (account_id, user_id, phone_number, display_name, created_at, updated_at)
       VALUES ($1, $1, $2, $3, $4, $4) ON CONFLICT (user_id) DO NOTHING`,
      [userId, "+905551234567", "Ops 50% User", now]
    )
    const repository = createPostgresAdminUserRepository(pool)
    const service = createAdminUsersService({ repository, now: () => now })
    const found = await service.searchUsers("50%")
    assert.equal(found.length, 1)
    assert.equal(found[0]?.userId, userId)
    assert.equal(found[0]?.maskedPhone, "••••••••••67")
    assert.equal((await service.searchUsers("Ops% User")).length, 0)

    await pool.query(
      `INSERT INTO blumi_discovery_decision_quotas (user_id, quota_day, used_decisions, extension_decisions)
       VALUES ($1, $2::date, 10, 3) ON CONFLICT (user_id, quota_day)
       DO UPDATE SET used_decisions = 10, extension_decisions = 3`,
      [userId, now.toISOString().slice(0, 10)]
    )
    const before = await repository.getQuota(userId, now)
    assert.deepEqual({ limit: before.limit, used: before.used, remaining: before.remaining }, {
      limit: 13, used: 10, remaining: 3
    })
    await assert.rejects(repository.resetQuota({
      userId: "missing_admin_fixture", operatorId: "admin-test", tokenId: "token-missing",
      reason: "Missing account should not be changed", now
    }), AdminUserNotFoundError)

    const grants = await Promise.all([1, 2, 3].map((amount) => repository.grantQuota({
      userId, amount, operatorId: "admin-test", tokenId: `token-${amount}`,
      reason: "Parallel support quota grant", now
    })))
    const afterGrants = await repository.getQuota(userId, now)
    assert.equal(afterGrants.extensionDecisions, 9)
    assert.equal(afterGrants.limit, 19)
    assert.equal(grants.length, 3)

    const reset = await repository.resetQuota({
      userId, operatorId: "admin-test", tokenId: "token-reset",
      reason: "Approved daily quota reset", now
    })
    assert.equal(reset.quota.used, 0)
    assert.equal(reset.quota.extensionDecisions, 9)
    const audit = await repository.listQuotaAudit(userId, 20)
    assert.equal(audit.length, 4)
    assert.equal(audit[0]?.action, "quota_reset")
    assert.equal(audit[0]?.operatorId, "admin-test")
    assert.equal(audit[0]?.previousQuota.extensionDecisions, 9)
    assert.equal(audit[0]?.currentQuota.used, 0)

    await pool.query(
      `UPDATE blumi_discovery_decision_quotas SET extension_decisions = 100
        WHERE user_id = $1 AND quota_day = $2::date`,
      [userId, now.toISOString().slice(0, 10)]
    )
    await assert.rejects(repository.grantQuota({
      userId, amount: 1, operatorId: "admin-test", tokenId: "token-capped",
      reason: "Quota extension cap must hold", now
    }), AdminQuotaExtensionLimitError)
    assert.equal((await repository.listQuotaAudit(userId, 20)).length, 4)
  } finally {
    await pool.query("DELETE FROM blumi_accounts WHERE user_id = $1", [userId]).catch(() => undefined)
    await pool.end()
  }
})
