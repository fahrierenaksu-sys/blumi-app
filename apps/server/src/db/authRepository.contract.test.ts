import assert from "node:assert/strict"
import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import { DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createEmptyAccountDataExporter } from "../account/accountDataExporter"
import { createInMemoryAuthRepository, type AuthRepository } from "../auth/authRepository"
import {
  createAccountRecord,
  createBlumiBackendStore,
  type AccountModerationStatus,
  type AccountRecord,
  type PendingOtp,
  type SessionRecord
} from "../auth/authStore"
import { createPhoneBanHasher } from "../auth/moderationPhoneBan"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { runRepositoryContract } from "./repositoryContract"

// Auth repository behavior owed by both implementations: account fields,
// profile writes, onboarding, avatar CAS and the OTP lifecycles. Outcomes and
// stored rows only; no SQL text or statement order.

interface AuthHarness {
  auth: AuthRepository
  setModeration(account: AccountRecord, status: AccountModerationStatus): Promise<void>
  /** Stores legacy coordinates the way old rows still hold them. */
  seedLegacyLocation(account: AccountRecord, location: { lat: number; lng: number }): Promise<void>
  storedLocation(accountId: string): Promise<{ lat: unknown; lng: unknown }>
  /** Every stored value of the sign-in OTP row for a phone, as text. */
  storedPendingOtpValues(phoneNumber: string): Promise<string[]>
}

const phoneBanHash = createPhoneBanHasher("auth-contract-secret-0123456789abcdef")
const OTP_SECRET = "auth-contract-otp-secret"
const TERMS = { version: "test-terms-v1", locale: "tr" as const, acceptedAt: "2026-09-30T09:00:00.000Z" }
const CODE = "482931"
const MAX_ATTEMPTS = 5

function uniquePhone(): string {
  return `+1557${String(randomInt(0, 10_000_000)).padStart(7, "0")}`
}

function digest(code: string, phoneNumber: string): string {
  return createHmac("sha256", OTP_SECRET).update(`${phoneNumber}:${code}`).digest("hex")
}

function matchesCode(code: string) {
  return (pending: PendingOtp) => pending.codeDigest === digest(code, pending.phoneNumber)
}

function pendingOtp(phoneNumber: string, otpId: string, now: number, code = CODE): PendingOtp {
  return { phoneNumber, otpId, codeDigest: digest(code, phoneNumber), expiresAt: now + 300_000, attemptCount: 0 }
}

function session(account: AccountRecord): SessionRecord {
  return {
    accountId: account.accountId,
    userId: account.userId,
    sessionId: randomUUID(),
    sessionTokenHash: randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString()
  }
}

async function signUp(auth: AuthRepository, phoneNumber = uniquePhone()): Promise<AccountRecord> {
  const result = await auth.finalizeOtpSignIn({
    phoneNumber,
    now: Date.now(),
    maxAttempts: MAX_ATTEMPTS,
    verifiedWithoutOtp: true,
    matches: () => true,
    newAccount: createAccountRecord(phoneNumber, new Date(), TERMS),
    createSession: session,
    phoneBanHash
  })
  return result.kind === "verified" ? result.account : assert.fail(`sign-up failed: ${result.kind}`)
}

async function sendSignInOtp(auth: AuthRepository, phoneNumber: string, now: number): Promise<void> {
  const otpId = randomUUID()
  assert.deepEqual(await auth.claimOtpSend({
    phoneNumber, requestId: otpId, now, cooldownMs: 30_000, windowMs: 300_000, maxRequests: 5
  }), { kind: "claimed" })
  assert.equal(await auth.activatePendingOtp(pendingOtp(phoneNumber, otpId, now)), true)
}

const NEXT_AVATAR: CompleteAvatarSelection = {
  presetId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId,
  revision: 0,
  loadout: { ...DEFAULT_MALE_AVATAR_LOADOUT, accessoryIds: [...DEFAULT_MALE_AVATAR_LOADOUT.accessoryIds] }
}

runRepositoryContract<AuthHarness>({
  name: "auth repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => {
      const store = createBlumiBackendStore()
      const auth = createInMemoryAuthRepository(store)
      return {
        auth,
        async setModeration(account, status) {
          const current = await auth.findAccountById(account.accountId)
          assert.ok(current)
          await auth.saveAccount({ ...current, moderation: { status, updatedAt: new Date().toISOString() } })
        },
        async seedLegacyLocation(account, location) {
          const current = await auth.findAccountById(account.accountId)
          assert.ok(current)
          await auth.saveAccount({ ...current, profile: { ...current.profile, location } })
        },
        async storedLocation(accountId) {
          const location = (await auth.findAccountById(accountId))?.profile.location
          return { lat: location?.lat ?? null, lng: location?.lng ?? null }
        },
        async storedPendingOtpValues(phoneNumber) {
          const pending = store.pendingOtps.get(phoneNumber)
          return pending ? Object.values(pending).map(String) : []
        }
      }
    },
    postgres: (pool: Pool) => ({
      auth: createPostgresAuthRepository(pool),
      async setModeration(account, status) {
        await pool.query(
          "UPDATE blumi_accounts SET moderation_status = $2, moderation_updated_at = now() WHERE account_id = $1",
          [account.accountId, status]
        )
      },
      async seedLegacyLocation(account, location) {
        await pool.query(
          "UPDATE blumi_accounts SET location_lat = $2, location_lng = $3 WHERE account_id = $1",
          [account.accountId, location.lat, location.lng]
        )
      },
      async storedLocation(accountId) {
        const row = (await pool.query(
          "SELECT location_lat, location_lng FROM blumi_accounts WHERE account_id = $1",
          [accountId]
        )).rows[0]
        return { lat: row?.location_lat ?? null, lng: row?.location_lng ?? null }
      },
      async storedPendingOtpValues(phoneNumber) {
        const row = (await pool.query(
          "SELECT to_jsonb(pending) AS row FROM blumi_pending_otps AS pending WHERE phone_number = $1",
          [phoneNumber]
        )).rows[0]?.row as Record<string, unknown> | undefined
        return row ? Object.values(row).map((value) => String(value)) : []
      }
    })
  },
  cases: {
    "moderation status and accepted terms read back through every account lookup": async ({ repository }) => {
      const account = await signUp(repository.auth)
      await repository.setModeration(account, "banned")
      const lookups = [
        await repository.auth.getAccountByPhone(account.phoneNumber),
        await repository.auth.findAccountById(account.accountId),
        await repository.auth.findAccountByUserId(account.userId)
      ]
      for (const found of lookups) {
        assert.equal(found?.moderation?.status, "banned")
        assert.deepEqual(found?.acceptedTerms, TERMS)
      }

      const withoutTerms = createAccountRecord(uniquePhone(), new Date())
      await repository.auth.saveAccount(withoutTerms)
      assert.equal((await repository.auth.findAccountById(withoutTerms.accountId))?.acceptedTerms, undefined,
        "no acceptance record is invented")
    },

    "a profile write clears legacy coordinates and they never reach reads or exports": async ({ repository }) => {
      const account = await signUp(repository.auth)
      await repository.seedLegacyLocation(account, { lat: 41.01, lng: 28.97 })
      const updated = await repository.auth.updateAccountProfile({
        accountId: account.accountId,
        profile: { displayName: "Mina", location: { lat: 40.99, lng: 29.02 } },
        now: new Date()
      })
      assert.equal(updated?.profile.location, undefined)
      assert.deepEqual(await repository.storedLocation(account.accountId), { lat: null, lng: null })
      const loaded = await repository.auth.findAccountByUserId(account.userId)
      assert.equal(loaded?.profile.location, undefined)
      let exported = ""
      for await (const chunk of createEmptyAccountDataExporter().streamExport(loaded!, {
        schemaVersion: "2026-07-21", exportedAt: new Date().toISOString(), exclusions: []
      })) exported += chunk
      assert.doesNotMatch(exported, /location_lat|location_lng|41\.01|28\.97|40\.99|29\.02/)
    },

    "profile writes keep avatar and onboarding, round-trip preferences and clear empty fields": async ({ repository }) => {
      const account = await signUp(repository.auth)
      await repository.auth.updateAccountProfile({
        accountId: account.accountId,
        profile: { displayName: "Mina", age: 24, gender: "woman", bio: "Tea.", interests: ["tea"] },
        now: new Date()
      })
      for (const step of ["profile", "avatar", "room"] as const) {
        await repository.auth.completeOnboardingStep({ accountId: account.accountId, step, now: new Date() })
      }

      const [avatar, profile] = await Promise.all([
        repository.auth.updateAvatarSelection({
          accountId: account.accountId, expectedRevision: 0, selection: NEXT_AVATAR, now: new Date()
        }),
        repository.auth.updateAccountProfile({
          accountId: account.accountId, profile: { displayName: "Concurrent Name" }, now: new Date()
        })
      ])
      assert.equal(avatar.kind, "updated")
      assert.ok(profile)
      const stored = await repository.auth.findAccountById(account.accountId)
      assert.equal(stored?.profile.displayName, "Concurrent Name")
      assert.equal(stored?.profile.avatar.revision, 1, "a concurrent profile write never reverts the avatar")
      assert.deepEqual(stored?.profile.avatar.loadout, NEXT_AVATAR.loadout)
      assert.deepEqual(
        [stored?.onboarding.profile, stored?.onboarding.avatar, stored?.onboarding.room],
        ["complete", "complete", "complete"],
        "a profile write never regresses onboarding"
      )

      const preferences = { ageMin: 23, ageMax: 35, genders: ["woman" as const], vibes: ["coffee"], radiusKm: 25 as const }
      await repository.auth.updateAccountProfile({
        accountId: account.accountId,
        profile: { identityGender: "man", discoveryPreferences: preferences },
        now: new Date()
      })
      const withPreferences = await repository.auth.findAccountById(account.accountId)
      assert.equal(withPreferences?.profile.identityGender, "man")
      assert.deepEqual(withPreferences?.profile.discoveryPreferences, preferences)

      const prompts = [{ promptId: "small_joy" as const, answer: "Fresh coffee." }]
      const cleared = await repository.auth.updateAccountProfile({
        accountId: account.accountId,
        profile: { bio: null, interests: null, prompts },
        now: new Date()
      })
      for (const read of [cleared, await repository.auth.findAccountById(account.accountId)]) {
        assert.equal(read?.profile.bio, undefined)
        assert.equal(read?.profile.interests, undefined)
        assert.deepEqual(read?.profile.prompts, prompts)
        assert.equal(read?.profile.avatar.revision, 1)
      }
    },

    "profile onboarding completes only for a valid name, adult age and woman or man gender": async ({ repository }) => {
      const cases: Array<[string, { displayName: string; age: number; gender?: "woman" | "man" }, boolean]> = [
        ["one-letter name", { displayName: "A", age: 24, gender: "woman" }, false],
        ["age 17", { displayName: "Mina", age: 17, gender: "woman" }, false],
        ["no gender", { displayName: "Mina", age: 24 }, false],
        ["valid", { displayName: "Mina", age: 24, gender: "man" }, true]
      ]
      for (const [label, profile, expected] of cases) {
        const account = await signUp(repository.auth)
        // PostgreSQL also refuses to store an under-age profile at all.
        await repository.auth.updateAccountProfile({ accountId: account.accountId, profile, now: new Date() })
          .catch((error: unknown) => {
            if (profile.age >= 18) throw error
          })
        await repository.auth.completeOnboardingStep({ accountId: account.accountId, step: "profile", now: new Date() })
        const stored = await repository.auth.findAccountById(account.accountId)
        assert.equal(stored?.onboarding.profile, expected ? "complete" : "incomplete", label)
      }
    },

    "avatar saves are a compare-and-swap on the revision": async ({ repository }) => {
      const account = await signUp(repository.auth)
      const results = await Promise.all([0, 1].map(() => repository.auth.updateAvatarSelection({
        accountId: account.accountId, expectedRevision: 0, selection: { ...NEXT_AVATAR, revision: 42 }, now: new Date()
      })))
      const updated = results.filter((result) => result.kind === "updated")
      const conflicts = results.filter((result) => result.kind === "conflict")
      assert.equal(updated.length, 1)
      assert.equal(conflicts.length, 1)
      assert.equal(conflicts[0]?.kind === "conflict" ? conflicts[0].current.revision : null, 1)
      assert.equal(updated[0]?.kind === "updated" ? updated[0].account.profile.avatar.revision : null, 1,
        "the server assigns the next revision, never the client's")
      assert.equal((await repository.auth.updateAvatarSelection({
        accountId: `account_${randomUUID()}`, expectedRevision: 0, selection: NEXT_AVATAR, now: new Date()
      })).kind, "missing")
    },

    "OTP sends respect the cooldown and the window cap under concurrency": async ({ repository }) => {
      const phone = uniquePhone()
      const now = Date.now()
      const concurrent = await Promise.all(Array.from({ length: 6 }, () => repository.auth.claimOtpSend({
        phoneNumber: phone, requestId: randomUUID(), now, cooldownMs: 30_000, windowMs: 300_000, maxRequests: 5
      })))
      assert.equal(concurrent.filter((result) => result.kind === "claimed").length, 1)
      assert.ok(concurrent.every((result) => result.kind === "claimed" || result.kind === "cooldown"))

      const capped = uniquePhone()
      const burst = await Promise.all(Array.from({ length: 8 }, () => repository.auth.claimOtpSend({
        phoneNumber: capped, requestId: randomUUID(), now, cooldownMs: 0, windowMs: 300_000, maxRequests: 3
      })))
      assert.equal(burst.filter((result) => result.kind === "claimed").length, 3)
      assert.equal(burst.filter((result) => result.kind === "limit").length, 5)
    },

    "a sign-in OTP stores no plaintext code, locks after its attempts and verifies once": async ({ repository }) => {
      const phone = uniquePhone()
      const now = Date.now()
      await sendSignInOtp(repository.auth, phone, now)
      const stored = await repository.storedPendingOtpValues(phone)
      assert.ok(stored.length > 0)
      assert.ok(stored.every((value) => !value.includes(CODE)), "the plaintext code is never stored")

      const wrong = await repository.auth.verifyAndConsumePendingOtp({
        phoneNumber: phone, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode("000000")
      })
      assert.deepEqual(wrong, { kind: "invalid", attemptsRemaining: MAX_ATTEMPTS - 1 })
      assert.deepEqual(await repository.auth.verifyAndConsumePendingOtp({
        phoneNumber: phone, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode(CODE)
      }), { kind: "verified" })
      assert.deepEqual(await repository.auth.verifyAndConsumePendingOtp({
        phoneNumber: phone, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode(CODE)
      }), { kind: "missing_or_expired" }, "a code verifies once")

      const locked = uniquePhone()
      await sendSignInOtp(repository.auth, locked, now)
      const outcomes = []
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        outcomes.push((await repository.auth.verifyAndConsumePendingOtp({
          phoneNumber: locked, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode("000000")
        })).kind)
      }
      assert.equal(outcomes.at(-1), "attempt_limit")
      assert.equal((await repository.auth.verifyAndConsumePendingOtp({
        phoneNumber: locked, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode(CODE)
      })).kind, "attempt_limit", "the right code is refused after the limit")
    },

    "recovery and sign-in OTPs never consume each other": async ({ repository }) => {
      const phone = uniquePhone()
      const now = Date.now()
      await sendSignInOtp(repository.auth, phone, now)
      const recoveryId = randomUUID()
      assert.deepEqual(await repository.auth.claimRecoveryOtpSend({
        phoneNumber: phone, requestId: recoveryId, now, cooldownMs: 30_000, windowMs: 300_000, maxRequests: 5
      }), { kind: "claimed" })
      assert.equal(await repository.auth.activatePendingRecoveryOtp(pendingOtp(phone, recoveryId, now, "111111")), true)

      assert.deepEqual(await repository.auth.verifyAndConsumePendingRecoveryOtp({
        phoneNumber: phone, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode("111111")
      }), { kind: "verified" })
      assert.ok(await repository.auth.getPendingOtp(phone), "recovery never consumes the sign-in code")
      assert.equal((await repository.auth.verifyAndConsumePendingRecoveryOtp({
        phoneNumber: phone, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode(CODE)
      })).kind, "missing_or_expired", "the sign-in code never verifies recovery")
      assert.deepEqual(await repository.auth.verifyAndConsumePendingOtp({
        phoneNumber: phone, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode(CODE)
      }), { kind: "verified" })
    },

    "account deletion codes have their own cooldown, cap, expiry and attempt limit": async ({ repository }) => {
      const account = await signUp(repository.auth)
      const now = Date.now()
      const claim = (at: number, requestId = randomUUID()) => repository.auth.claimAccountDeletionOtpSend({
        accountId: account.accountId, phoneNumber: account.phoneNumber, requestId,
        now: at, cooldownMs: 30_000, windowMs: 300_000, maxRequests: 2
      })
      const firstId = randomUUID()
      assert.deepEqual(await claim(now, firstId), { kind: "claimed" })
      assert.deepEqual(await claim(now + 1_000), { kind: "cooldown", retryAfterMs: 29_000 })
      assert.deepEqual(await claim(now + 31_000), { kind: "claimed" })
      assert.deepEqual(await claim(now + 62_000), { kind: "limit", retryAfterMs: 238_000 })

      const verify = (at: number, code: string) => repository.auth.verifyAndCreateAccountDeletionConfirmation({
        accountId: account.accountId, phoneNumber: account.phoneNumber, now: at, maxAttempts: MAX_ATTEMPTS,
        confirmationTokenDigest: "c".repeat(64), confirmationExpiresAt: at + 300_000, matches: matchesCode(code)
      })

      const expiring = { ...pendingOtp(account.phoneNumber, randomUUID(), now), expiresAt: now + 1_000 }
      const otherAccount = await signUp(repository.auth)
      const otherId = randomUUID()
      assert.deepEqual(await repository.auth.claimAccountDeletionOtpSend({
        accountId: otherAccount.accountId, phoneNumber: otherAccount.phoneNumber, requestId: otherId,
        now, cooldownMs: 30_000, windowMs: 300_000, maxRequests: 2
      }), { kind: "claimed" })
      assert.equal(await repository.auth.activatePendingAccountDeletionOtp({
        accountId: otherAccount.accountId,
        pendingOtp: { ...expiring, phoneNumber: otherAccount.phoneNumber, otpId: otherId,
          codeDigest: digest(CODE, otherAccount.phoneNumber) }
      }), true)
      assert.deepEqual(await repository.auth.verifyAndCreateAccountDeletionConfirmation({
        accountId: otherAccount.accountId, phoneNumber: otherAccount.phoneNumber, now: now + 2_000,
        maxAttempts: MAX_ATTEMPTS, confirmationTokenDigest: "d".repeat(64), confirmationExpiresAt: now + 300_000,
        matches: matchesCode(CODE)
      }), { kind: "missing_or_expired" })

      const lastId = randomUUID()
      const fresh = await signUp(repository.auth)
      assert.deepEqual(await repository.auth.claimAccountDeletionOtpSend({
        accountId: fresh.accountId, phoneNumber: fresh.phoneNumber, requestId: lastId,
        now, cooldownMs: 30_000, windowMs: 300_000, maxRequests: 2
      }), { kind: "claimed" })
      assert.equal(await repository.auth.activatePendingAccountDeletionOtp({
        accountId: fresh.accountId, pendingOtp: pendingOtp(fresh.phoneNumber, lastId, now)
      }), true)
      const attempts = []
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        attempts.push((await repository.auth.verifyAndCreateAccountDeletionConfirmation({
          accountId: fresh.accountId, phoneNumber: fresh.phoneNumber, now, maxAttempts: MAX_ATTEMPTS,
          confirmationTokenDigest: "e".repeat(64), confirmationExpiresAt: now + 300_000, matches: matchesCode("000000")
        })).kind)
      }
      assert.deepEqual(attempts, ["invalid", "invalid", "invalid", "invalid", "attempt_limit"])
      assert.equal((await verify(now, CODE)).kind, "missing_or_expired", "the first account never activated a code")
    }
  }
})

// Stored prompt normalization and transaction rollbacks need raw rows and
// injected faults, so they run only on PostgreSQL.
const requirePostgres = {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !process.env.DATABASE_URL
}

test("PostgreSQL account reads drop invented, duplicate and oversized stored prompts", requirePostgres, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  try {
    const auth = createPostgresAuthRepository(pool)
    const account = await signUp(auth)
    await pool.query("UPDATE blumi_accounts SET profile_prompts = $2::jsonb WHERE account_id = $1", [account.accountId, JSON.stringify([
      { promptId: "invented", answer: "Must not leak." },
      { promptId: "small_joy", answer: "  Fresh   coffee. " },
      { promptId: "small_joy", answer: "Duplicate." },
      { promptId: "ask_me_about", answer: "x".repeat(121) }
    ])])
    assert.deepEqual((await auth.findAccountById(account.accountId))?.profile.prompts, [
      { promptId: "small_joy", answer: "Fresh coffee." }
    ])
  } finally {
    await pool.end()
  }
})

async function withFailingTrigger<T>(
  pool: Pool,
  table: string,
  event: "INSERT" | "DELETE",
  run: () => Promise<T>
): Promise<T> {
  const name = `blumi_test_fail_${randomUUID().replace(/-/g, "").slice(0, 12)}`
  await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected failure'; END $$`)
  await pool.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION ${name}()`)
  try {
    return await run()
  } finally {
    await pool.query(`DROP TRIGGER ${name} ON ${table}`)
    await pool.query(`DROP FUNCTION ${name}()`)
  }
}

test("PostgreSQL sign-in that fails to store its session leaves no account and keeps the code", requirePostgres, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  try {
    const auth = createPostgresAuthRepository(pool)
    const phone = uniquePhone()
    const now = Date.now()
    await sendSignInOtp(auth, phone, now)
    await withFailingTrigger(pool, "blumi_sessions", "INSERT", async () => {
      await assert.rejects(auth.finalizeOtpSignIn({
        phoneNumber: phone, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode(CODE),
        newAccount: createAccountRecord(phone, new Date(), TERMS), createSession: session, phoneBanHash
      }), /injected failure/)
    })
    assert.equal(await auth.getAccountByPhone(phone), null)
    assert.ok(await auth.getPendingOtp(phone), "the code survives a failed sign-in")

    const retried = await auth.finalizeOtpSignIn({
      phoneNumber: phone, now, maxAttempts: MAX_ATTEMPTS, matches: matchesCode(CODE),
      newAccount: createAccountRecord(phone, new Date(), TERMS), createSession: session, phoneBanHash
    })
    assert.equal(retried.kind, "verified")
    assert.equal(await auth.getPendingOtp(phone), null)
  } finally {
    await pool.end()
  }
})

test("PostgreSQL account deletion that fails midway leaves every row in place", requirePostgres, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  try {
    const auth = createPostgresAuthRepository(pool)
    const account = await signUp(auth)
    const sessions = async () => Number((await pool.query(
      "SELECT count(*)::int AS n FROM blumi_sessions WHERE account_id = $1", [account.accountId]
    )).rows[0]?.n)
    const sessionsBefore = await sessions()
    assert.ok(sessionsBefore > 0)
    await withFailingTrigger(pool, "blumi_chat_threads", "DELETE", async () => {
      await assert.rejects(auth.deleteAccountData(account, undefined, { phoneBanHash }), /injected failure/)
    })
    assert.equal((await auth.findAccountById(account.accountId))?.accountId, account.accountId)
    assert.equal(await sessions(), sessionsBefore)
    assert.equal(await auth.deleteAccountData(account, undefined, { phoneBanHash }), true)
    assert.equal(await auth.findAccountById(account.accountId), null)
  } finally {
    await pool.end()
  }
})
