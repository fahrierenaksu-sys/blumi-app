import assert from "node:assert/strict"
import { randomBytes, randomInt } from "node:crypto"
import type { Pool } from "pg"
import { createInMemoryAuthRepository, type AuthRepository } from "../auth/authRepository"
import { createAuthService } from "../auth/authService"
import { createAccountRecord, createBlumiBackendStore, type AccountRecord, type SessionRecord } from "../auth/authStore"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { runRepositoryContract } from "./repositoryContract"

// Batched realtime authorization (2026-10-01): the sweep re-checks every live
// socket with `listActiveSessionFamilies` instead of one query per socket.

async function createAccount(auth: AuthRepository, id: (prefix: string) => string, name: string): Promise<AccountRecord> {
  const account = createAccountRecord(`+1557${String(randomInt(0, 10_000_000)).padStart(7, "0")}`)
  const userId = id(`${name}_user`)
  account.accountId = id(`${name}_account`)
  account.userId = userId
  account.profile = { ...account.profile, userId }
  await auth.saveAccount(account)
  return account
}

async function saveSession(
  auth: AuthRepository,
  account: AccountRecord,
  sessionFamilyId: string,
  expiresAt: Date
): Promise<void> {
  const session: SessionRecord = {
    accountId: account.accountId,
    userId: account.userId,
    sessionId: sessionFamilyId,
    sessionTokenHash: randomBytes(32).toString("hex"),
    expiresAt: expiresAt.toISOString()
  }
  await auth.saveSession(session)
}

/**
 * The PostgreSQL repository leaves moderation to the moderation service, so
 * `saveAccount` ignores it there; the test writes it to the same columns.
 */
function withModerationWrites(repository: AuthRepository, pool: Pool): AuthRepository {
  return {
    ...repository,
    async saveAccount(account) {
      await repository.saveAccount(account)
      if (!account.moderation) return
      await pool.query(
        `UPDATE blumi_accounts
            SET moderation_status = $2, moderation_updated_at = $3, suspended_until = $4
          WHERE user_id = $1`,
        [account.userId, account.moderation.status, account.moderation.updatedAt,
          account.moderation.suspendedUntil ?? null]
      )
    }
  }
}

runRepositoryContract<AuthRepository>({
  name: "realtime session families",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryAuthRepository(createBlumiBackendStore()),
    postgres: (pool) => withModerationWrites(createPostgresAuthRepository(pool), pool)
  },
  cases: {
    "returns exactly the requested families that still have an unexpired token": async ({ repository, id }) => {
      const now = new Date()
      const ada = await createAccount(repository, id, "ada")
      const bora = await createAccount(repository, id, "bora")
      const live = id("family_live")
      const rotated = id("family_rotated")
      const expired = id("family_expired")
      const other = id("family_other")
      await saveSession(repository, ada, live, new Date(now.getTime() + 60_000))
      // A family stays active while any of its tokens is unexpired.
      await saveSession(repository, ada, rotated, new Date(now.getTime() - 1_000))
      await saveSession(repository, ada, rotated, new Date(now.getTime() + 60_000))
      await saveSession(repository, ada, expired, new Date(now.getTime() - 1_000))
      await saveSession(repository, bora, other, new Date(now.getTime() + 60_000))

      const active = await repository.listActiveSessionFamilies({
        now,
        identities: [
          { userId: ada.userId, sessionFamilyId: live },
          { userId: ada.userId, sessionFamilyId: live },
          { userId: ada.userId, sessionFamilyId: rotated },
          { userId: ada.userId, sessionFamilyId: expired },
          // A family id presented with another user's id is never active.
          { userId: ada.userId, sessionFamilyId: other },
          { userId: bora.userId, sessionFamilyId: id("family_missing") }
        ]
      })
      const keys = active.map((family) => `${family.userId}/${family.sessionFamilyId}`).sort()
      assert.deepEqual(keys, [`${ada.userId}/${live}`, `${ada.userId}/${rotated}`].sort())
      // Each family reports its latest token expiry, which caps the cache.
      for (const family of active) {
        assert.equal(Math.abs(Date.parse(family.expiresAt) - (now.getTime() + 60_000)) < 1_000, true)
      }
    },
    "the joined session read answers exactly what the separate session and account reads answer": async ({ repository, id }) => {
      // Every authenticated request reads both; one join saves a round trip.
      const now = new Date()
      const account = await createAccount(repository, id, "joined")
      await repository.saveAccount({
        ...account,
        profile: { ...account.profile, displayName: "Joined", age: 27, bio: "hi", interests: ["coffee"] },
        moderation: { status: "suspended", updatedAt: now.toISOString(), suspendedUntil: new Date(now.getTime() + 60_000).toISOString() }
      })
      const session: SessionRecord = {
        accountId: account.accountId,
        userId: account.userId,
        sessionId: id("joined_family"),
        sessionTokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(now.getTime() + 60_000).toISOString()
      }
      await repository.saveSession(session)
      const joined = await repository.getSessionWithAccountByTokenHash(session.sessionTokenHash)
      assert.deepEqual(joined, {
        session: await repository.getSessionByTokenHash(session.sessionTokenHash),
        account: await repository.findAccountById(account.accountId)
      })
      assert.equal(joined?.account?.moderation?.status, "suspended")
      assert.equal(await repository.getSessionWithAccountByTokenHash(randomBytes(32).toString("hex")), null)
    },
    "an empty request answers without a query result": async ({ repository }) => {
      assert.deepEqual(await repository.listActiveSessionFamilies({ identities: [], now: new Date() }), [])
    },
    "the batched service check agrees with the single check for every state": async ({ repository, id }) => {
      const now = new Date()
      const auth = createAuthService({ repository })
      const accounts = {
        active: await createAccount(repository, id, "active"),
        banned: await createAccount(repository, id, "banned"),
        suspended: await createAccount(repository, id, "suspended"),
        released: await createAccount(repository, id, "released"),
        signedOut: await createAccount(repository, id, "signed_out")
      }
      const moderated: [AccountRecord, NonNullable<AccountRecord["moderation"]>][] = [
        [accounts.banned, { status: "banned", updatedAt: now.toISOString() }],
        [accounts.suspended, {
          status: "suspended", updatedAt: now.toISOString(),
          suspendedUntil: new Date(now.getTime() + 86_400_000).toISOString()
        }],
        [accounts.released, {
          status: "suspended", updatedAt: now.toISOString(),
          suspendedUntil: new Date(now.getTime() - 1_000).toISOString()
        }]
      ]
      for (const [account, moderation] of moderated) {
        await repository.saveAccount({ ...account, moderation })
      }
      const identities = Object.entries(accounts).map(([name, account]) => ({
        userId: account.userId,
        sessionFamilyId: id(`${name}_family`)
      }))
      for (const [index, account] of Object.values(accounts).entries()) {
        const expiresAt = account === accounts.signedOut
          ? new Date(now.getTime() - 1_000)
          : new Date(now.getTime() + 60_000)
        await saveSession(repository, account, identities[index]!.sessionFamilyId, expiresAt)
      }
      const single = []
      for (const identity of identities) single.push(await auth.isRealtimeSessionAllowed(identity, now))
      const batched = await auth.areRealtimeSessionsAllowed(identities, now)
      assert.deepEqual(batched.map((decision) => decision.allowed), single)
      assert.deepEqual(single, [true, false, false, true, false])
      for (const decision of batched) {
        assert.equal(decision.expiresAt !== undefined, decision.allowed)
        if (decision.expiresAt) assert.ok(Date.parse(decision.expiresAt) > now.getTime())
      }
    }
  }
})
