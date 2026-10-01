import assert from "node:assert/strict"
import { randomInt } from "node:crypto"
import test from "node:test"
import pg from "pg"
import { createPostgresAuthRepository } from "../db/postgresAuthRepository"
import { createInMemoryAuthRepository, type AuthRepository } from "./authRepository"
import { createAuthService, type AuthService } from "./authService"
import { createPhoneBanHasher } from "./moderationPhoneBan"
import {
  SESSION_FAMILY_MAX_LIFETIME_MS,
  SESSION_REFRESH_REUSE_GRACE_MS,
  SESSION_TOKEN_TTL_MS,
  createBlumiBackendStore,
  hashSessionToken
} from "./authStore"
import type { RealtimeAccessRevocation } from "./realtimeAccessRevocation"

// Every scenario runs against the in-memory repository in the normal suite
// and against PostgreSQL inside the isolated gate (npm run verify:postgres),
// so both repositories must behave identically.
const databaseUrl = process.env.DATABASE_URL?.trim()
const postgresSkip = process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !databaseUrl
const TERMS = { version: "test-terms-v1", locale: "en" as const }
const T0 = new Date("2026-09-30T10:00:00.000Z")
const at = (ms: number) => new Date(T0.getTime() + ms)
const DAY = 24 * 60 * 60 * 1000

interface Harness {
  service: AuthService
  repository: AuthRepository
  revocations: RealtimeAccessRevocation[]
}

type Scenario = (harness: Harness) => Promise<void>

function uniquePhone(): string {
  return `+1555${String(randomInt(0, 10_000_000)).padStart(7, "0")}`
}

async function signIn(harness: Harness, options: { phone?: string; firebaseUid?: string; now?: Date } = {}) {
  return harness.service.signInWithVerifiedPhone(
    options.phone ?? uniquePhone(),
    { acceptedTerms: TERMS, ...(options.firebaseUid ? { firebaseUid: options.firebaseUid } : {}) },
    options.now ?? T0
  )
}

async function rejectsWithRecovery(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal((error as { code?: string }).code, "ACCOUNT_RECOVERY_REQUIRED")
    assert.equal((error as { statusCode?: number }).statusCode, 409)
    return true
  })
}

const scenarios: Record<string, Scenario> = {
  async "rotated token reused within the grace window re-issues and supersedes the earlier successor"(harness) {
    const signed = await signIn(harness)
    const first = await harness.service.refreshSession(signed.sessionToken, at(1_000))
    assert.ok(first)
    const retried = await harness.service.refreshSession(signed.sessionToken, at(SESSION_REFRESH_REUSE_GRACE_MS))
    assert.ok(retried, "a retry inside the grace window keeps the member signed in")
    assert.equal(retried.session.sessionId, signed.session.sessionId)
    assert.equal(await harness.service.getSession(first.sessionToken, at(31_000)), null)
    assert.ok(await harness.service.getSession(retried.sessionToken, at(31_000)))
    assert.deepEqual(harness.revocations, [])
  },

  async "concurrent refreshes of one token leave exactly one live token and revoke nothing"(harness) {
    const signed = await signIn(harness)
    const results = await Promise.all([
      harness.service.refreshSession(signed.sessionToken, at(1_000)),
      harness.service.refreshSession(signed.sessionToken, at(1_000))
    ])
    const issued = results.filter((result) => result !== null)
    assert.ok(issued.length >= 1)
    const live = []
    for (const result of issued) {
      if (await harness.service.getSession(result.sessionToken, at(2_000))) live.push(result)
    }
    assert.equal(live.length, 1)
    assert.deepEqual(harness.revocations, [])
  },

  async "rotated token reused after the grace window revokes the whole family and realtime access"(harness) {
    const signed = await signIn(harness)
    const next = await harness.service.refreshSession(signed.sessionToken, at(0))
    assert.ok(next)
    const reused = await harness.service.refreshSession(
      signed.sessionToken,
      at(SESSION_REFRESH_REUSE_GRACE_MS + 1)
    )
    assert.equal(reused, null)
    assert.deepEqual(harness.revocations, [{ kind: "user", userId: signed.account.userId }])
    assert.equal(await harness.service.getSession(next.sessionToken, at(SESSION_REFRESH_REUSE_GRACE_MS + 2)), null)
    assert.equal(await harness.service.isRealtimeSessionAllowed({
      userId: signed.account.userId,
      sessionFamilyId: signed.session.sessionId
    }, at(SESSION_REFRESH_REUSE_GRACE_MS + 2)), false)
    assert.equal(await harness.repository.getSessionByTokenHash(hashSessionToken(next.sessionToken)), null)
  },

  async "a superseded successor presented after the grace window revokes the family"(harness) {
    const signed = await signIn(harness)
    const victim = await harness.service.refreshSession(signed.sessionToken, at(0))
    const attacker = await harness.service.refreshSession(signed.sessionToken, at(5_000))
    assert.ok(victim && attacker)
    assert.equal(await harness.service.refreshSession(victim.sessionToken, at(60_000)), null)
    assert.deepEqual(harness.revocations, [{ kind: "user", userId: signed.account.userId }])
    assert.equal(await harness.service.getSession(attacker.sessionToken, at(60_001)), null)
  },

  async "presenting the parent after its successor was used is reuse even inside the grace window"(harness) {
    const signed = await signIn(harness)
    const second = await harness.service.refreshSession(signed.sessionToken, at(0))
    assert.ok(second)
    const third = await harness.service.refreshSession(second.sessionToken, at(1_000))
    assert.ok(third)
    assert.equal(await harness.service.refreshSession(signed.sessionToken, at(2_000)), null)
    assert.deepEqual(harness.revocations, [{ kind: "user", userId: signed.account.userId }])
    assert.equal(await harness.service.getSession(third.sessionToken, at(3_000)), null)
  },

  async "a session family cannot slide past its absolute lifetime"(harness) {
    const signed = await signIn(harness)
    assert.equal(signed.session.familyExpiresAt, at(SESSION_FAMILY_MAX_LIFETIME_MS).toISOString())
    let token = signed.sessionToken
    let expiresAt = ""
    for (const day of [29, 58, 87]) {
      const refreshed = await harness.service.refreshSession(token, at(day * DAY))
      assert.ok(refreshed, `refresh on day ${day}`)
      token = refreshed.sessionToken
      expiresAt = refreshed.session.expiresAt
      assert.equal(refreshed.session.familyExpiresAt, at(SESSION_FAMILY_MAX_LIFETIME_MS).toISOString())
    }
    assert.equal(expiresAt, at(SESSION_FAMILY_MAX_LIFETIME_MS).toISOString(), "the last token is capped")
    assert.equal(await harness.service.refreshSession(token, at(SESSION_FAMILY_MAX_LIFETIME_MS + 1)), null)
    assert.deepEqual(harness.revocations, [], "an expired family is not reuse")
  },

  async "a legacy session without a family lifetime is anchored on its next rotation"(harness) {
    const signed = await signIn(harness)
    const legacyToken = `dv_legacy_${randomInt(0, 1_000_000)}`
    await harness.repository.saveSession({
      accountId: signed.account.accountId,
      userId: signed.account.userId,
      sessionId: `session_legacy_${randomInt(0, 1_000_000)}`,
      sessionTokenHash: hashSessionToken(legacyToken),
      expiresAt: at(10 * DAY).toISOString()
    })
    const refreshed = await harness.service.refreshSession(legacyToken, at(DAY))
    assert.ok(refreshed)
    assert.equal(refreshed.session.familyExpiresAt, at(DAY + SESSION_FAMILY_MAX_LIFETIME_MS).toISOString())
    assert.equal(refreshed.session.expiresAt, at(DAY + SESSION_TOKEN_TTL_MS).toISOString())
  },

  async "the first verified Firebase completion binds the uid and later completions must match"(harness) {
    const phone = uniquePhone()
    const created = await signIn(harness, { phone, firebaseUid: `uid_a_${phone}` })
    const again = await harness.service.signInWithVerifiedPhone(
      phone, { requireExistingAccount: true, firebaseUid: `uid_a_${phone}` }, at(1_000)
    )
    assert.equal(again.account.accountId, created.account.accountId)
    await rejectsWithRecovery(harness.service.signInWithVerifiedPhone(
      phone, { requireExistingAccount: true, firebaseUid: `uid_b_${phone}` }, at(2_000)
    ))
    const owner = await harness.service.signInWithVerifiedPhone(
      phone, { requireExistingAccount: true, firebaseUid: `uid_a_${phone}` }, at(3_000)
    )
    assert.equal(owner.account.accountId, created.account.accountId)
  },

  async "the bound Firebase uid is found by user id for refresh-token revocation"(harness) {
    const phone = uniquePhone()
    const bound = await signIn(harness, { phone, firebaseUid: `uid_lookup_${phone}` })
    const legacy = await signIn(harness)
    assert.equal(await harness.repository.findFirebaseUidByUserId(bound.account.userId), `uid_lookup_${phone}`)
    assert.equal(await harness.repository.findFirebaseUidByUserId(legacy.account.userId), null)
    assert.equal(await harness.repository.findFirebaseUidByUserId(`user_missing_${phone}`), null)
  },

  async "deleting an account confirmed without Firebase still deletes its bound Firebase user"(harness) {
    const phone = uniquePhone()
    const signed = await signIn(harness, { phone, firebaseUid: `uid_delete_${phone}` })
    const digest = "c".repeat(64)
    await harness.repository.createAccountDeletionConfirmation({
      accountId: signed.account.accountId,
      confirmationTokenDigest: digest,
      confirmationExpiresAt: at(60_000).getTime()
    })
    const deleted = await harness.repository.deleteAccountData(
      signed.account,
      { confirmationTokenDigest: digest, now: at(1_000).getTime() },
      { phoneBanHash: createPhoneBanHasher("phone-ban-test-secret-0123456789abcdef") }
    )
    assert.equal(deleted, true)
    // Deleting the Firebase user invalidates its refresh tokens; until the
    // worker has done it, sign-in with that uid is refused.
    assert.equal(await harness.repository.isFirebaseUserDeletionPending(`uid_delete_${phone}`), true)
    await harness.repository.completeFirebaseUserDeletion(`uid_delete_${phone}`)
  },

  async "reuse after the grace window reports the user once for Firebase revocation"(harness) {
    const reused: string[] = []
    harness.service.subscribeSessionReuse((userId) => { reused.push(userId) })
    const signed = await signIn(harness)
    const next = await harness.service.refreshSession(signed.sessionToken, at(0))
    assert.ok(next)
    assert.ok(await harness.service.refreshSession(signed.sessionToken, at(1_000)), "grace retry")
    assert.deepEqual(reused, [], "a grace-window retry is not reuse")
    assert.equal(await harness.service.refreshSession(signed.sessionToken, at(SESSION_REFRESH_REUSE_GRACE_MS + 1_001)), null)
    assert.deepEqual(reused, [signed.account.userId])
  },

  async "a legacy account without a uid binds on its next sign-in"(harness) {
    const phone = uniquePhone()
    const legacy = await signIn(harness, { phone })
    const bound = await harness.service.signInWithVerifiedPhone(
      phone, { requireExistingAccount: true, firebaseUid: `uid_legacy_${phone}` }, at(1_000)
    )
    assert.equal(bound.account.accountId, legacy.account.accountId)
    await rejectsWithRecovery(harness.service.signInWithVerifiedPhone(
      phone, { requireExistingAccount: true, firebaseUid: `uid_other_${phone}` }, at(2_000)
    ))
  },

  async "a uid bound to another account cannot claim a second phone"(harness) {
    const phone = uniquePhone()
    await signIn(harness, { phone, firebaseUid: `uid_shared_${phone}` })
    await rejectsWithRecovery(signIn(harness, { phone: uniquePhone(), firebaseUid: `uid_shared_${phone}` }))
  },

  async "a completed phone change clears the binding so the new number's uid binds"(harness) {
    const phone = uniquePhone()
    const nextPhone = uniquePhone()
    const signed = await signIn(harness, { phone, firebaseUid: `uid_old_${phone}` })
    const expires = at(60_000).getTime()
    await harness.repository.createAccountActionConfirmation({
      accountId: signed.account.accountId,
      purpose: "phone_change_current",
      targetPhoneNumber: phone,
      confirmationTokenDigest: "a".repeat(64),
      confirmationExpiresAt: expires
    })
    await harness.repository.createAccountActionConfirmation({
      accountId: signed.account.accountId,
      purpose: "phone_change_new",
      targetPhoneNumber: nextPhone,
      confirmationTokenDigest: "b".repeat(64),
      confirmationExpiresAt: expires
    })
    const changed = await harness.repository.completePhoneChange({
      accountId: signed.account.accountId,
      currentPhoneConfirmationDigest: "a".repeat(64),
      newPhoneConfirmationDigest: "b".repeat(64),
      now: at(1_000),
      phoneBanHash: createPhoneBanHasher("phone-ban-test-secret-0123456789abcdef")
    })
    assert.equal(changed.kind, "updated")
    const rebound = await harness.service.signInWithVerifiedPhone(
      nextPhone, { requireExistingAccount: true, firebaseUid: `uid_new_${nextPhone}` }, at(2_000)
    )
    assert.equal(rebound.account.accountId, signed.account.accountId)
  }
}

function withRevocations(service: AuthService, repository: AuthRepository): Harness {
  const revocations: RealtimeAccessRevocation[] = []
  service.subscribeRealtimeAccessRevocations((revocation) => { revocations.push(revocation) })
  return { service, repository, revocations }
}

for (const [name, scenario] of Object.entries(scenarios)) {
  test(`in-memory: ${name}`, async () => {
    const repository = createInMemoryAuthRepository(createBlumiBackendStore())
    await scenario(withRevocations(createAuthService({ repository }), repository))
  })

  test(`postgres: ${name}`, { skip: postgresSkip }, async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl })
    try {
      const repository = createPostgresAuthRepository(pool)
      await scenario(withRevocations(createAuthService({ repository }), repository))
    } finally {
      await pool.end()
    }
  })
}
