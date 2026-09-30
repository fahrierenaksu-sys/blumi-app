import assert from "node:assert/strict"
import { randomBytes, randomInt, randomUUID } from "node:crypto"
import type { Pool } from "pg"
import { createInMemoryAuthRepository, type AuthRepository } from "../auth/authRepository"
import {
  createAccountRecord,
  createBlumiBackendStore,
  type AccountModerationStatus,
  type AccountRecord,
  type SessionRecord
} from "../auth/authStore"
import { createPhoneBanHasher } from "../auth/moderationPhoneBan"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { runRepositoryContract } from "./repositoryContract"

// Moderation phone bans (migration 069): a banned account that is deleted or
// moves to another number leaves a keyed-hash ban on the freed number, and a
// new account for that number starts banned. Suspensions are not carried.
interface PhoneBanHarness {
  auth: AuthRepository
  setModeration(account: AccountRecord, status: AccountModerationStatus): Promise<void>
  storedBanHashes(): Promise<string[]>
}

const phoneBanHash = createPhoneBanHasher("phone-ban-contract-secret-0123456789")
const TERMS = { version: "test-terms-v1", locale: "en" as const, acceptedAt: "2026-09-30T09:00:00.000Z" }

function uniquePhone(): string {
  return `+1556${String(randomInt(0, 10_000_000)).padStart(7, "0")}`
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

async function signUp(auth: AuthRepository, phoneNumber: string): Promise<AccountRecord> {
  const result = await auth.finalizeOtpSignIn({
    phoneNumber,
    now: Date.now(),
    maxAttempts: 5,
    verifiedWithoutOtp: true,
    matches: () => true,
    newAccount: createAccountRecord(phoneNumber, new Date(), TERMS),
    createSession: session,
    phoneBanHash
  })
  assert.equal(result.kind, "verified")
  return result.kind === "verified" ? result.account : assert.fail("sign-up failed")
}

async function deleteAccount(auth: AuthRepository, account: AccountRecord): Promise<void> {
  assert.equal(await auth.deleteAccountData(account, undefined, { phoneBanHash }), true)
}

async function changePhone(auth: AuthRepository, account: AccountRecord, nextPhone: string) {
  const expiresAt = Date.now() + 600_000
  for (const [purpose, digit] of [["phone_change_current", "a"], ["phone_change_new", "b"]] as const) {
    await auth.createAccountActionConfirmation({
      accountId: account.accountId,
      purpose,
      targetPhoneNumber: purpose === "phone_change_new" ? nextPhone : account.phoneNumber,
      confirmationTokenDigest: digit.repeat(64),
      confirmationExpiresAt: expiresAt
    })
  }
  return auth.completePhoneChange({
    accountId: account.accountId,
    currentPhoneConfirmationDigest: "a".repeat(64),
    newPhoneConfirmationDigest: "b".repeat(64),
    now: new Date(),
    phoneBanHash
  })
}

function moderationOf(account: AccountRecord): AccountModerationStatus {
  return account.moderation?.status ?? "active"
}

runRepositoryContract<PhoneBanHarness>({
  name: "auth moderation phone bans",
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
          await auth.saveAccount({
            ...current,
            moderation: {
              status,
              updatedAt: new Date().toISOString(),
              ...(status === "suspended" ? { suspendedUntil: new Date(Date.now() + 86_400_000).toISOString() } : {})
            }
          })
        },
        async storedBanHashes() {
          return [...store.moderationPhoneBans.keys()]
        }
      }
    },
    postgres: (pool: Pool) => ({
      auth: createPostgresAuthRepository(pool),
      async setModeration(account, status) {
        await pool.query(
          `UPDATE blumi_accounts
              SET moderation_status = $2, moderation_updated_at = now(),
                  suspended_until = CASE WHEN $2 = 'suspended' THEN now() + interval '1 day' ELSE NULL END
            WHERE account_id = $1`,
          [account.accountId, status]
        )
      },
      async storedBanHashes() {
        return (await pool.query("SELECT phone_hash FROM blumi_moderation_phone_bans")).rows
          .map((row) => String(row.phone_hash))
      }
    })
  },
  cases: {
    "deleting a banned account keeps a hashed ban and the number signs up again banned": async ({ repository }) => {
      const phone = uniquePhone()
      const original = await signUp(repository.auth, phone)
      await repository.setModeration(original, "banned")
      await deleteAccount(repository.auth, original)
      assert.equal(await repository.auth.findAccountById(original.accountId), null)

      const hashes = await repository.storedBanHashes()
      assert.ok(hashes.includes(phoneBanHash(phone)))
      assert.ok(hashes.every((hash) => /^[0-9a-f]{64}$/.test(hash) && !hash.includes(phone.slice(1))),
        "only the keyed hash is stored, never the number")

      const again = await signUp(repository.auth, phone)
      assert.notEqual(again.accountId, original.accountId)
      assert.equal(moderationOf(again), "banned")
      assert.equal(moderationOf((await repository.auth.findAccountById(again.accountId))!), "banned")

      // Deleting the re-created account keeps the single original record.
      await deleteAccount(repository.auth, again)
      assert.equal((await repository.storedBanHashes()).filter((hash) => hash === phoneBanHash(phone)).length, 1)
      assert.equal(moderationOf(await signUp(repository.auth, phone)), "banned")
    },

    "deleting an active or suspended account records nothing": async ({ repository }) => {
      for (const status of ["active", "warned", "suspended"] as const) {
        const phone = uniquePhone()
        const account = await signUp(repository.auth, phone)
        await repository.setModeration(account, status)
        await deleteAccount(repository.auth, account)
        assert.equal((await repository.storedBanHashes()).includes(phoneBanHash(phone)), false, status)
        assert.equal(moderationOf(await signUp(repository.auth, phone)), "active", status)
      }
    },

    "a banned account moving to a new number leaves a ban on the old one": async ({ repository }) => {
      const oldPhone = uniquePhone()
      const nextPhone = uniquePhone()
      const banned = await signUp(repository.auth, oldPhone)
      await repository.setModeration(banned, "banned")
      const changed = await changePhone(repository.auth, banned, nextPhone)
      assert.equal(changed.kind, "updated")
      assert.equal(changed.kind === "updated" ? moderationOf(changed.account) : null, "banned")
      assert.ok((await repository.storedBanHashes()).includes(phoneBanHash(oldPhone)))
      assert.equal(moderationOf(await signUp(repository.auth, oldPhone)), "banned")
    },

    "an active account changing its number frees the old one without a ban": async ({ repository }) => {
      const oldPhone = uniquePhone()
      const member = await signUp(repository.auth, oldPhone)
      assert.equal((await changePhone(repository.auth, member, uniquePhone())).kind, "updated")
      assert.equal((await repository.storedBanHashes()).includes(phoneBanHash(oldPhone)), false)
      assert.equal(moderationOf(await signUp(repository.auth, oldPhone)), "active")
    },

    "a ban record never changes an existing account on sign-in": async ({ repository }) => {
      const phone = uniquePhone()
      const banned = await signUp(repository.auth, phone)
      await repository.setModeration(banned, "banned")
      await deleteAccount(repository.auth, banned)
      const recreated = await signUp(repository.auth, phone)
      assert.equal(moderationOf(recreated), "banned")
      // An administrator lifts the new account's ban; signing in again keeps it lifted.
      await repository.setModeration(recreated, "active")
      const signedIn = await signUp(repository.auth, phone)
      assert.equal(signedIn.accountId, recreated.accountId)
      assert.equal(moderationOf(signedIn), "active")
    }
  }
})
