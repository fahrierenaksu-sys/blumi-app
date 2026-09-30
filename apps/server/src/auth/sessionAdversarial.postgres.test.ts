import assert from "node:assert/strict"
import { randomInt } from "node:crypto"
import test from "node:test"
import pg from "pg"
import { createPostgresAuthRepository } from "../db/postgresAuthRepository"
import { createInMemoryAuthRepository, type AuthRepository } from "./authRepository"
import { createAuthService, type AuthService } from "./authService"
import {
  SESSION_REFRESH_REUSE_GRACE_MS,
  createBlumiBackendStore,
  hashSessionToken
} from "./authStore"
import type { RealtimeAccessRevocation } from "./realtimeAccessRevocation"

// Adversarial session and account-lifecycle scenarios (audit domain C).
// Every scenario runs against the in-memory repository in the normal suite and
// against PostgreSQL inside the isolated gate, so races are exercised where the
// two implementations can differ.
const databaseUrl = process.env.DATABASE_URL?.trim()
const postgresSkip = process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !databaseUrl
const TERMS = { version: "test-terms-v1", locale: "en" as const }
const T0 = new Date("2026-09-30T10:00:00.000Z")
const at = (ms: number) => new Date(T0.getTime() + ms)

interface Harness {
  service: AuthService
  repository: AuthRepository
  revocations: RealtimeAccessRevocation[]
  deletedAccountIds: string[]
  pool?: pg.Pool
}

type Scenario = (harness: Harness) => Promise<void>

function uniquePhone(): string {
  return `+1556${String(randomInt(0, 10_000_000)).padStart(7, "0")}`
}

function uniqueUid(label: string): string {
  return `uid_${label}_${randomInt(0, 1_000_000_000)}`
}

async function signIn(harness: Harness, options: { phone?: string; firebaseUid?: string; now?: Date } = {}) {
  return harness.service.signInWithVerifiedPhone(
    options.phone ?? uniquePhone(),
    { acceptedTerms: TERMS, ...(options.firebaseUid ? { firebaseUid: options.firebaseUid } : {}) },
    options.now ?? T0
  )
}

async function liveTokens(harness: Harness, tokens: string[], now: Date): Promise<string[]> {
  const live: string[] = []
  for (const token of tokens) {
    if (await harness.service.getSession(token, now)) live.push(token)
  }
  return live
}

async function deletionConfirmation(harness: Harness, signed: Awaited<ReturnType<typeof signIn>>, uid: string, now: Date) {
  const confirmation = await harness.service.verifyFirebaseAccountDeletion(
    signed.sessionToken,
    signed.account.phoneNumber,
    uid,
    now
  )
  assert.ok(confirmation)
  return confirmation.confirmationToken
}

const scenarios: Record<string, Scenario> = {
  async "twenty concurrent refreshes of one token leave exactly one live token and revoke nothing"(harness) {
    const signed = await signIn(harness)
    const results = await Promise.all(
      Array.from({ length: 20 }, () => harness.service.refreshSession(signed.sessionToken, at(1_000)))
    )
    const issued = results.filter((result) => result !== null)
    assert.ok(issued.length >= 1, "at least one refresh succeeds")
    for (const result of issued) {
      assert.equal(result.session.sessionId, signed.session.sessionId, "no refresh forks a new family")
      assert.equal(result.account.accountId, signed.account.accountId)
    }
    const live = await liveTokens(harness, issued.map((result) => result.sessionToken), at(2_000))
    assert.equal(live.length, 1, "exactly one successor stays live")
    assert.equal(await harness.service.getSession(signed.sessionToken, at(2_000)), null, "the parent is spent")
    assert.deepEqual(harness.revocations, [])
  },

  async "the same token refreshed twice in sequence keeps only the newest successor, then reuse after grace revokes"(harness) {
    const signed = await signIn(harness)
    const first = await harness.service.refreshSession(signed.sessionToken, at(0))
    const second = await harness.service.refreshSession(signed.sessionToken, at(1_000))
    assert.ok(first && second)
    assert.deepEqual(
      await liveTokens(harness, [signed.sessionToken, first.sessionToken, second.sessionToken], at(2_000)),
      [second.sessionToken]
    )
    assert.equal(await harness.service.refreshSession(signed.sessionToken, at(SESSION_REFRESH_REUSE_GRACE_MS + 1)), null)
    assert.deepEqual(harness.revocations, [{ kind: "user", userId: signed.account.userId }])
    assert.deepEqual(await liveTokens(harness, [second.sessionToken], at(SESSION_REFRESH_REUSE_GRACE_MS + 2)), [])
  },

  async "reuse detected on one device's family leaves the other device signed in"(harness) {
    const phone = uniquePhone()
    const deviceA = await signIn(harness, { phone })
    const deviceB = await harness.service.signInWithVerifiedPhone(phone, { requireExistingAccount: true }, at(10))
    assert.equal(deviceA.account.accountId, deviceB.account.accountId)
    assert.notEqual(deviceA.session.sessionId, deviceB.session.sessionId)
    const rotatedA = await harness.service.refreshSession(deviceA.sessionToken, at(1_000))
    assert.ok(rotatedA)
    assert.equal(await harness.service.refreshSession(deviceA.sessionToken, at(SESSION_REFRESH_REUSE_GRACE_MS + 2_000)), null)
    assert.equal(await harness.service.getSession(rotatedA.sessionToken, at(SESSION_REFRESH_REUSE_GRACE_MS + 3_000)), null)
    assert.ok(await harness.service.getSession(deviceB.sessionToken, at(SESSION_REFRESH_REUSE_GRACE_MS + 3_000)))
    assert.equal(await harness.service.isRealtimeSessionAllowed({
      userId: deviceB.account.userId,
      sessionFamilyId: deviceB.session.sessionId
    }, at(SESSION_REFRESH_REUSE_GRACE_MS + 3_000)), true)
    const refreshedB = await harness.service.refreshSession(deviceB.sessionToken, at(SESSION_REFRESH_REUSE_GRACE_MS + 4_000))
    assert.ok(refreshedB, "device B keeps refreshing")
  },

  async "a token is dead after logout, a second logout is a no-op, and the spent parent cannot revive the family"(harness) {
    const signed = await signIn(harness)
    const rotated = await harness.service.refreshSession(signed.sessionToken, at(1_000))
    assert.ok(rotated)
    await harness.service.revokeSession(rotated.sessionToken)
    await harness.service.revokeSession(rotated.sessionToken)
    assert.equal(await harness.service.getSession(rotated.sessionToken, at(2_000)), null)
    assert.equal(await harness.service.refreshSession(rotated.sessionToken, at(2_000)), null)
    assert.equal(await harness.service.refreshSession(signed.sessionToken, at(2_000)), null, "parent inside grace")
    assert.equal(await harness.service.refreshSession(signed.sessionToken, at(SESSION_REFRESH_REUSE_GRACE_MS + 5_000)), null)
    assert.equal(await harness.service.isRealtimeSessionAllowed({
      userId: signed.account.userId,
      sessionFamilyId: signed.session.sessionId
    }, at(3_000)), false)
  },

  async "logging out with the spent parent still ends the whole family"(harness) {
    const signed = await signIn(harness)
    const rotated = await harness.service.refreshSession(signed.sessionToken, at(1_000))
    assert.ok(rotated)
    await harness.service.revokeSession(signed.sessionToken)
    assert.equal(await harness.service.getSession(rotated.sessionToken, at(2_000)), null)
  },

  async "a deleted account's tokens neither resolve nor refresh, and a second deletion is refused"(harness) {
    const uid = uniqueUid("delete")
    const signed = await signIn(harness, { firebaseUid: uid })
    const rotated = await harness.service.refreshSession(signed.sessionToken, at(1_000))
    assert.ok(rotated)
    const confirmation = await deletionConfirmation(harness, { ...signed, sessionToken: rotated.sessionToken }, uid, at(2_000))
    const deleted = await harness.service.deleteAccount(rotated.sessionToken, confirmation, at(3_000))
    assert.ok(deleted === "deleted" || deleted === "pending_firebase_deletion")
    assert.equal(await harness.service.deleteAccount(rotated.sessionToken, confirmation, at(4_000)), "missing_session")
    assert.equal(await harness.service.getSession(rotated.sessionToken, at(4_000)), null)
    assert.equal(await harness.service.refreshSession(rotated.sessionToken, at(4_000)), null)
    assert.equal(await harness.service.refreshSession(signed.sessionToken, at(4_000)), null)
    assert.deepEqual(harness.deletedAccountIds, [signed.account.accountId])
  },

  async "two concurrent deletions with one confirmation delete exactly once"(harness) {
    const uid = uniqueUid("double_delete")
    const signed = await signIn(harness, { firebaseUid: uid })
    const confirmation = await deletionConfirmation(harness, signed, uid, at(1_000))
    const results = await Promise.all([
      harness.service.deleteAccount(signed.sessionToken, confirmation, at(2_000)),
      harness.service.deleteAccount(signed.sessionToken, confirmation, at(2_000))
    ])
    const succeeded = results.filter((result) => result === "deleted" || result === "pending_firebase_deletion")
    assert.equal(succeeded.length, 1, `results: ${results.join(",")}`)
    for (const result of results) {
      assert.ok(["deleted", "pending_firebase_deletion", "missing_session", "reauth_required"].includes(result))
    }
    assert.deepEqual(harness.deletedAccountIds, [signed.account.accountId])
    assert.equal(await harness.repository.findAccountById(signed.account.accountId), null)
  },

  async "one account's deletion confirmation cannot delete another account"(harness) {
    const uidA = uniqueUid("victim")
    const uidB = uniqueUid("attacker")
    const victim = await signIn(harness, { firebaseUid: uidA })
    const attacker = await signIn(harness, { firebaseUid: uidB })
    const attackerConfirmation = await deletionConfirmation(harness, attacker, uidB, at(1_000))
    // The attacker's confirmation presented with the victim's session is refused.
    assert.equal(await harness.service.deleteAccount(victim.sessionToken, attackerConfirmation, at(2_000)), "reauth_required")
    assert.ok(await harness.repository.findAccountById(victim.account.accountId))
    assert.ok(await harness.service.getSession(victim.sessionToken, at(2_000)))
    assert.deepEqual(harness.deletedAccountIds, [])
  },

  async "a deletion re-auth cannot be minted for another account's phone number"(harness) {
    const victim = await signIn(harness)
    const attacker = await signIn(harness)
    await assert.rejects(
      harness.service.verifyFirebaseAccountDeletion(attacker.sessionToken, victim.account.phoneNumber, uniqueUid("x"), at(1_000)),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 401
    )
  },

  async "concurrent first Firebase binds of two phones to one uid bind at most one account"(harness) {
    const uid = uniqueUid("contested")
    const phones = [uniquePhone(), uniquePhone()]
    const results = await Promise.allSettled(phones.map((phone) => signIn(harness, { phone, firebaseUid: uid })))
    const fulfilled = results.filter((result) => result.status === "fulfilled")
    assert.equal(fulfilled.length, 1, "exactly one phone claims the uid")
    const owners: string[] = []
    for (const phone of phones) {
      const account = await harness.repository.getAccountByPhone(phone)
      if (account) owners.push(account.accountId)
    }
    assert.equal(owners.length, 1, "the losing phone did not create an account")
    // The uid now proves only the winner.
    const winnerPhone = phones[results.findIndex((result) => result.status === "fulfilled")]!
    const loserPhone = phones.find((phone) => phone !== winnerPhone)!
    await assert.rejects(
      signIn(harness, { phone: loserPhone, firebaseUid: uid, now: at(1_000) }),
      (error: unknown) => (error as { code?: string }).code === "ACCOUNT_RECOVERY_REQUIRED"
    )
  },

  async "concurrent first binds of two uids to one legacy phone bind exactly one uid"(harness) {
    const phone = uniquePhone()
    const legacy = await signIn(harness, { phone })
    const uids = [uniqueUid("first"), uniqueUid("second")]
    const results = await Promise.allSettled(uids.map((uid) => harness.service.signInWithVerifiedPhone(
      phone, { requireExistingAccount: true, firebaseUid: uid }, at(1_000)
    )))
    const fulfilled = results.flatMap((result, index) => result.status === "fulfilled" ? [uids[index]!] : [])
    assert.equal(fulfilled.length, 1)
    for (const result of results) {
      if (result.status === "fulfilled") assert.equal(result.value.account.accountId, legacy.account.accountId)
      else assert.equal((result.reason as { code?: string }).code, "ACCOUNT_RECOVERY_REQUIRED")
    }
    const winner = fulfilled[0]!
    const loser = uids.find((uid) => uid !== winner)!
    await assert.rejects(harness.service.signInWithVerifiedPhone(
      phone, { requireExistingAccount: true, firebaseUid: loser }, at(2_000)
    ))
    assert.ok(await harness.service.signInWithVerifiedPhone(
      phone, { requireExistingAccount: true, firebaseUid: winner }, at(3_000)
    ))
  },

  async "twenty concurrent creates for one phone produce one account"(harness) {
    const phone = uniquePhone()
    const uid = uniqueUid("burst")
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => signIn(harness, { phone, firebaseUid: uid }))
    )
    const accounts = new Set(results.flatMap((result) => result.status === "fulfilled" ? [result.value.account.accountId] : []))
    assert.equal(accounts.size, 1)
    assert.equal(results.filter((result) => result.status === "rejected").length, 0)
  },

  async "a refresh racing account deletion leaves no live session for the deleted account"(harness) {
    const uid = uniqueUid("race_delete")
    const signed = await signIn(harness, { firebaseUid: uid })
    const confirmation = await deletionConfirmation(harness, signed, uid, at(1_000))
    const [refreshed, deleted] = await Promise.allSettled([
      harness.service.refreshSession(signed.sessionToken, at(2_000)),
      harness.service.deleteAccount(signed.sessionToken, confirmation, at(2_000))
    ])
    const tokens = [signed.sessionToken]
    if (refreshed.status === "fulfilled" && refreshed.value) tokens.push(refreshed.value.sessionToken)
    if (deleted.status === "fulfilled" && (deleted.value === "deleted" || deleted.value === "pending_firebase_deletion")) {
      assert.deepEqual(await liveTokens(harness, tokens, at(3_000)), [])
      assert.equal(await harness.repository.findAccountById(signed.account.accountId), null)
    }
  }
}

// PostgreSQL only: force the interleaving the in-memory repository cannot have.
const postgresOnlyScenarios: Record<string, Scenario> = {
  async "logout while a refresh of the same token is in flight leaves no live token in the family"(harness) {
    const pool = harness.pool!
    const signed = await signIn(harness)
    const tokenHash = hashSessionToken(signed.sessionToken)
    const blocker = await pool.connect()
    let refresh: Promise<unknown> | undefined
    let logout: Promise<unknown> | undefined
    try {
      await blocker.query("BEGIN")
      await blocker.query("SELECT 1 FROM blumi_sessions WHERE session_token_hash = $1 FOR UPDATE", [tokenHash])
      const waitingBefore = await lockWaiters(pool)
      refresh = harness.service.refreshSession(signed.sessionToken, at(1_000))
      await waitForLockWaiters(pool, waitingBefore + 1)
      logout = harness.service.revokeSession(signed.sessionToken)
      await waitForLockWaiters(pool, waitingBefore + 2).catch(() => undefined)
      await blocker.query("COMMIT")
    } finally {
      blocker.release()
    }
    const refreshed = await refresh as Awaited<ReturnType<AuthService["refreshSession"]>>
    await logout
    const tokens = [signed.sessionToken, ...(refreshed ? [refreshed.sessionToken] : [])]
    assert.deepEqual(
      await liveTokens(harness, tokens, at(2_000)),
      [],
      "the member logged out; a refresh that raced the logout must not leave a live successor"
    )
    assert.equal(await harness.service.isRealtimeSessionAllowed({
      userId: signed.account.userId,
      sessionFamilyId: signed.session.sessionId
    }, at(2_000)), false)
  }
}

async function lockWaiters(pool: pg.Pool): Promise<number> {
  const result = await pool.query(
    "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
  )
  return Number(result.rows[0]?.waiting ?? 0)
}

async function waitForLockWaiters(pool: pg.Pool, expected: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await lockWaiters(pool) >= expected) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Expected ${expected} lock waiters`)
}

function createHarness(repository: AuthRepository, pool?: pg.Pool): Harness {
  const deletedAccountIds: string[] = []
  const service = createAuthService({
    repository,
    accountDeletionHandlers: [async (account) => { deletedAccountIds.push(account.accountId) }]
  })
  const revocations: RealtimeAccessRevocation[] = []
  service.subscribeRealtimeAccessRevocations((revocation) => { revocations.push(revocation) })
  return { service, repository, revocations, deletedAccountIds, ...(pool ? { pool } : {}) }
}

for (const [name, scenario] of Object.entries(scenarios)) {
  test(`in-memory: ${name}`, async () => {
    await scenario(createHarness(createInMemoryAuthRepository(createBlumiBackendStore())))
  })

  test(`postgres: ${name}`, { skip: postgresSkip }, async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 30 })
    try {
      await scenario(createHarness(createPostgresAuthRepository(pool), pool))
    } finally {
      await pool.end()
    }
  })
}

for (const [name, scenario] of Object.entries(postgresOnlyScenarios)) {
  test(`postgres: ${name}`, { skip: postgresSkip }, async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 30 })
    try {
      await scenario(createHarness(createPostgresAuthRepository(pool), pool))
    } finally {
      await pool.end()
    }
  })
}
