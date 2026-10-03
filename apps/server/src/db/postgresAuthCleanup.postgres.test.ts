import assert from "node:assert/strict"
import { randomInt, randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import type { AuthRepository } from "../auth/authRepository"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "./disposablePostgres"
import { createPostgresRetentionService } from "./postgresRetention"

type Flow = "sign-in" | "recovery" | "deletion" | "action"
interface Identity { accountId: string; phoneNumber: string }
const PURPOSE = "account_data_export" as const
const FLOWS: readonly Flow[] = ["sign-in", "recovery", "deletion", "action"]

async function seedIdentity(pool: Pool): Promise<Identity> {
  const accountId = randomUUID()
  const phoneNumber = `+1556${String(randomInt(0, 10_000_000)).padStart(7, "0")}`
  await pool.query(`INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())`, [accountId, randomUUID(), phoneNumber])
  return { accountId, phoneNumber }
}

function claim(auth: AuthRepository, flow: Flow, identity: Identity, now: number, requestId = randomUUID()) {
  const input = { ...identity, now, requestId, cooldownMs: 30_000, windowMs: 300_000, maxRequests: 2 }
  switch (flow) {
    case "sign-in": return auth.claimOtpSend(input)
    case "recovery": return auth.claimRecoveryOtpSend(input)
    case "deletion": return auth.claimAccountDeletionOtpSend(input)
    case "action": return auth.claimAccountActionOtpSend({ ...input, purpose: PURPOSE })
  }
}

function activate(auth: AuthRepository, flow: Flow, identity: Identity, now: number, otpId: string) {
  const pendingOtp = { phoneNumber: identity.phoneNumber, otpId, codeDigest: "a".repeat(64), expiresAt: now + 60_000, attemptCount: 0 }
  switch (flow) {
    case "sign-in": return auth.activatePendingOtp(pendingOtp)
    case "recovery": return auth.activatePendingRecoveryOtp(pendingOtp)
    case "deletion": return auth.activatePendingAccountDeletionOtp({ accountId: identity.accountId, pendingOtp })
    case "action": return auth.activatePendingAccountActionOtp({ action: {
      ...pendingOtp, accountId: identity.accountId, purpose: PURPOSE, targetPhoneNumber: identity.phoneNumber
    } })
  }
}

function verify(auth: AuthRepository, flow: Flow, identity: Identity, now: number) {
  const input = { ...identity, now, maxAttempts: 5, matches: () => true,
    confirmationTokenDigest: "b".repeat(64), confirmationExpiresAt: now + 60_000 }
  switch (flow) {
    case "sign-in": return auth.verifyAndConsumePendingOtp(input)
    case "recovery": return auth.verifyAndConsumePendingRecoveryOtp(input)
    case "deletion": return auth.verifyAndCreateAccountDeletionConfirmation(input)
    case "action": return auth.verifyAndCreateAccountActionConfirmation({ ...input, purpose: PURPOSE, targetPhoneNumber: identity.phoneNumber })
  }
}

for (const flow of FLOWS) {
  test(`${flow} OTP requests progress while an unrelated expired challenge is locked; cooldown, cap and expiry still hold`, disposablePostgresSkip(), async () => {
    assertDisposablePostgresDatabase(process.env.DATABASE_URL)
    // A bounded lock timeout turns unrelated-row contention into a failure,
    // without relying on elapsed-time or query-text assertions.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, lock_timeout: 1000 })
    const blocker = await pool.connect()
    const identities: Identity[] = []
    try {
      const own = await seedIdentity(pool)
      const other = await seedIdentity(pool)
      identities.push(own, other)
      const auth = createPostgresAuthRepository(pool)
      const now = Date.now()
      const old = now - 600_000
      const oldRequest = randomUUID()
      assert.deepEqual(await claim(auth, flow, other, old, oldRequest), { kind: "claimed" })
      assert.equal(await activate(auth, flow, other, old, oldRequest), true)
      const table = flow === "sign-in" ? "blumi_pending_otps" : flow === "recovery" ? "blumi_recovery_phone_challenges"
        : flow === "deletion" ? "blumi_account_deletion_challenges" : "blumi_account_action_challenges"
      const key = flow === "sign-in" || flow === "recovery" ? "phone_number" : "account_id"
      const otherKey = key === "phone_number" ? other.phoneNumber : other.accountId
      await blocker.query("BEGIN")
      await blocker.query(`SELECT 1 FROM ${table} WHERE ${key} = $1 FOR UPDATE`, [otherKey])

      const requestId = randomUUID()
      assert.deepEqual(await claim(auth, flow, own, now, requestId), { kind: "claimed" })
      assert.equal(await activate(auth, flow, own, now, requestId), true)
      assert.deepEqual(await claim(auth, flow, own, now + 1000), { kind: "cooldown", retryAfterMs: 29_000 })
      assert.deepEqual(await claim(auth, flow, own, now + 31_000), { kind: "claimed" })
      assert.deepEqual(await claim(auth, flow, own, now + 62_000), { kind: "limit", retryAfterMs: 238_000 })
      assert.deepEqual(await verify(auth, flow, own, now + 62_000), { kind: "missing_or_expired" })
      await blocker.query("ROLLBACK")

      // The expired rate window resets, and its new request cannot activate
      // an earlier in-flight send that arrives late.
      const freshRequest = randomUUID()
      assert.deepEqual(await claim(auth, flow, own, now + 300_000, freshRequest), { kind: "claimed" })
      assert.equal(await activate(auth, flow, own, now + 300_000, requestId), false)
      assert.equal(await activate(auth, flow, own, now + 300_000, freshRequest), true)
      assert.deepEqual(await verify(auth, flow, own, now + 300_001), { kind: "verified" })
      assert.deepEqual(await verify(auth, flow, own, now + 300_002), { kind: "missing_or_expired" })
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined)
      blocker.release()
      await pool.query("DELETE FROM blumi_pending_otps WHERE phone_number = ANY($1::text[])", [identities.map((identity) => identity.phoneNumber)])
      await pool.query("DELETE FROM blumi_otp_send_limits WHERE phone_number = ANY($1::text[])", [identities.map((identity) => identity.phoneNumber)])
      await pool.query("DELETE FROM blumi_recovery_phone_challenges WHERE phone_number = ANY($1::text[])", [identities.map((identity) => identity.phoneNumber)])
      await pool.query("DELETE FROM blumi_recovery_otp_send_limits WHERE phone_number = ANY($1::text[])", [identities.map((identity) => identity.phoneNumber)])
      await pool.query("DELETE FROM blumi_accounts WHERE account_id = ANY($1::text[])", [identities.map((identity) => identity.accountId)])
      await pool.end()
    }
  })
}

test("bounded OTP retention removes cold challenges and counters, preserves active challenges and recent counters, and resumes next tick", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
  try {
    const auth = createPostgresAuthRepository(pool)
    const now = Date.now()
    const old = now - 31 * 24 * 60 * 60_000
    for (const flow of FLOWS) {
      const cold = await Promise.all([seedIdentity(pool), seedIdentity(pool), seedIdentity(pool)])
      const live = await seedIdentity(pool)
      const recent = await seedIdentity(pool)
      for (const [identity, at] of [...cold.map((identity) => [identity, old] as const), [live, now] as const, [recent, now - 600_000] as const]) {
        const request = randomUUID()
        assert.deepEqual(await claim(auth, flow, identity, at, request), { kind: "claimed" })
        assert.equal(await activate(auth, flow, identity, at, request), true)
      }
      const challengeTable = flow === "sign-in" ? "blumi_pending_otps" : flow === "recovery" ? "blumi_recovery_phone_challenges"
        : flow === "deletion" ? "blumi_account_deletion_challenges" : "blumi_account_action_challenges"
      const limitTable = flow === "sign-in" ? "blumi_otp_send_limits" : flow === "recovery" ? "blumi_recovery_otp_send_limits"
        : flow === "deletion" ? "blumi_account_deletion_otp_send_limits" : "blumi_account_action_otp_send_limits"
      const key = flow === "sign-in" || flow === "recovery" ? "phone_number" : "account_id"
      const identityKeys = (identities: Identity[]) => identities.map((identity) => key === "phone_number" ? identity.phoneNumber : identity.accountId)
      const count = async (table: string, identities: Identity[]) => Number((await pool.query(
        `SELECT count(*)::int AS remaining FROM ${table} WHERE ${key} = ANY($1::text[])`, [identityKeys(identities)]
      )).rows[0].remaining)

      await createPostgresRetentionService(pool, { batchSize: 1, maxBatches: 1 }).purgeExpired()
      assert.equal(await count(challengeTable, [...cold, recent]), 3, "one batch cannot drain a challenge backlog")
      assert.equal(await count(limitTable, cold), 2, "one batch cannot drain a counter backlog")
      await createPostgresRetentionService(pool).purgeExpired()
      assert.equal(await count(challengeTable, [...cold, recent]), 0)
      assert.equal(await count(limitTable, cold), 0)
      assert.equal(await count(challengeTable, [live]), 1, "unexpired authorization remains")
      assert.equal(await count(limitTable, [live, recent]), 2, "recent send counters remain")
      assert.deepEqual(await verify(auth, flow, live, now + 1), { kind: "verified" })
    }
  } finally {
    await pool.end()
  }
})
