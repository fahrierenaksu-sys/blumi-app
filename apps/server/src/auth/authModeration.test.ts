import assert from "node:assert/strict"
import test from "node:test"
import {
  createAccountRecord,
  createBlumiBackendStore,
  createSessionRecord,
  createSessionToken
} from "./authStore"
import { createAuthService } from "./authService"
import { createInMemoryAuthRepository } from "./authRepository"

test("public existing-account verification requires acceptance before creating an account", async () => {
  const store = createBlumiBackendStore()
  const auth = createAuthService({ store, codeFactory: () => "123456" })
  const now = new Date("2026-07-21T10:00:00.000Z")
  await auth.sendCode("+905550000000", now)
  await assert.rejects(auth.verifyExistingAccount("+905550000000", "000000", now), /invalid or expired/)
  await assert.rejects(auth.verifyExistingAccount("+905550000000", "123456", now), /Terms acceptance/)
  assert.equal(store.accountsByPhone.size, 0)
  assert.equal(store.sessionsByTokenHash.size, 0)
  const registered = await auth.registerAccount("+905550000000", "123456", { version: "2026-09", locale: "tr" }, now)
  assert.equal(registered.account.acceptedTerms?.acceptedAt, now.toISOString())
  const later = new Date(now.getTime() + 61_000)
  await auth.sendCode("+905550000000", later)
  assert.ok(await auth.verifyExistingAccount("+905550000000", "123456", later))
})

test("realtime session authorization follows family rotation and revocation", async () => {
  const store = createBlumiBackendStore()
  const repository = createInMemoryAuthRepository(store)
  const auth = createAuthService({ repository, otpHmacSecret: "test-secret" })
  const now = new Date("2026-07-21T10:00:00.000Z")
  const account = createAccountRecord("+905550000000", now)
  await repository.saveAccount(account)
  const session = createSessionRecord(account, createSessionToken(), now)
  await repository.saveSession(session)
  const identity = { userId: account.userId, sessionFamilyId: session.sessionId }
  assert.equal(await auth.isRealtimeSessionAllowed(identity, now), true)
  assert.equal(await auth.isRealtimeSessionAllowed({ ...identity, userId: "other" }, now), false)
  assert.equal(await auth.isRealtimeSessionAllowed(identity, new Date(session.expiresAt)), false)
  const next = { ...session, sessionTokenHash: "rotated" }
  await repository.rotateSession({ currentSessionTokenHash: session.sessionTokenHash, nextSession: next, now })
  assert.equal(await auth.isRealtimeSessionAllowed(identity, now), true)
  await repository.deleteSession(next.sessionTokenHash)
  assert.equal(await auth.isRealtimeSessionAllowed(identity, now), false)
})

test("warning acknowledgement is one-time and expired suspensions lazily return active", async () => {
  const store = createBlumiBackendStore()
  const repository = createInMemoryAuthRepository(store)
  const auth = createAuthService({ repository, otpHmacSecret: "test-secret" })
  const now = new Date("2026-07-21T10:00:00.000Z")
  const account = createAccountRecord("+905550000000", now)
  await repository.saveAccount({
    ...account,
    moderation: { status: "warned", updatedAt: now.toISOString() }
  })
  const token = createSessionToken()
  await repository.saveSession(createSessionRecord(account, token, now))

  const acknowledged = await auth.acknowledgeModeration(token, now)
  assert.deepEqual(acknowledged, { status: "active", updatedAt: now.toISOString() })
  assert.deepEqual(await auth.acknowledgeModeration(token, now), acknowledged)

  await repository.saveAccount({
    ...account,
    moderation: {
      status: "suspended",
      updatedAt: now.toISOString(),
      suspendedUntil: new Date(now.getTime() - 1).toISOString()
    }
  })
  assert.equal((await auth.getSession(token, now))?.account.moderation?.status, "active")
})
