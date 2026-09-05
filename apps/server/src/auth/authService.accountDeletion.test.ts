import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryAuthRepository } from "./authRepository"
import { createAuthService } from "./authService"
import { createBlumiBackendStore } from "./authStore"

const PHONE = "+905551112233"
const CODE = "482931"

test("invalid deletion confirmation never runs account cleanup handlers", async () => {
  const store = createBlumiBackendStore()
  let cleanups = 0
  const service = createAuthService({ store, codeFactory: () => CODE,
    accountDeletionHandlers: [async () => { cleanups += 1 }] })
  const now = new Date("2026-07-21T09:00:00.000Z")
  await service.sendCode(PHONE, now)
  const signedIn = await service.verifyCode(PHONE, CODE, now)
  assert.equal(await service.deleteAccount(signedIn.sessionToken, "invalid", now), "reauth_required")
  assert.equal(cleanups, 0)
  assert.ok(await service.getSession(signedIn.sessionToken, now))
  await service.requestAccountDeletionChallenge(signedIn.sessionToken, now)
  const confirmation = await service.verifyAccountDeletionChallenge(signedIn.sessionToken, CODE, now)
  assert.ok(confirmation)
  const expiredAt = new Date(confirmation.expiresAt)
  assert.equal(await service.deleteAccount(signedIn.sessionToken, confirmation.confirmationToken, expiredAt), "reauth_required")
  assert.equal(cleanups, 0)
  assert.ok(await service.getSession(signedIn.sessionToken, expiredAt))
})

async function signedInService() {
  const store = createBlumiBackendStore()
  const service = createAuthService({ store, codeFactory: () => CODE })
  const signedAt = new Date("2026-07-21T09:00:00.000Z")
  await service.sendCode(PHONE, signedAt)
  const signedIn = await service.verifyCode(PHONE, CODE, signedAt)
  return { service, store, token: signedIn.sessionToken, signedAt }
}

test("account deletion OTP is purpose-isolated, HMAC-only, and one use", async () => {
  const { service, store, token, signedAt } = await signedInService()

  const now = new Date(signedAt.getTime() + 31_000)
  await service.sendCode(PHONE, now)
  assert.equal(store.pendingOtps.size, 1)
  await assert.rejects(
    () => service.verifyAccountDeletionChallenge(token, CODE, now),
    /invalid or expired/i
  )
  const challenge = await service.requestAccountDeletionChallenge(token, now)
  assert.ok(challenge)
  assert.ok(store.pendingAccountDeletionOtps.size === 1)
  assert.equal(JSON.stringify([...store.pendingAccountDeletionOtps.values()]).includes(CODE), false)
  assert.equal(store.pendingOtps.size, 1)

  const verified = await service.verifyAccountDeletionChallenge(token, CODE, now)
  assert.ok(verified)
  assert.equal(store.pendingAccountDeletionOtps.size, 0)
  assert.equal(JSON.stringify([...store.accountDeletionConfirmations.values()]).includes(verified.confirmationToken), false)
  assert.equal(await service.deleteAccount(token, verified.confirmationToken, now), "deleted")
  assert.equal(store.pendingOtps.size, 0)
  assert.equal(await service.deleteAccount(token, verified.confirmationToken), "missing_session")
})

test("account deletion OTP expires and blocks after five failed attempts", async () => {
  const { service, token } = await signedInService()
  const sentAt = new Date("2026-07-21T10:00:00.000Z")
  await service.requestAccountDeletionChallenge(token, sentAt)
  await assert.rejects(
    () => service.verifyAccountDeletionChallenge(token, CODE, new Date(sentAt.getTime() + 300_001)),
    /invalid or expired/i
  )
  await service.requestAccountDeletionChallenge(token, new Date(sentAt.getTime() + 300_002))
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      () => service.verifyAccountDeletionChallenge(token, String(attempt).padStart(6, "0"), new Date(sentAt.getTime() + 300_003 + attempt)),
      /invalid|too many/i
    )
  }
  await assert.rejects(
    () => service.verifyAccountDeletionChallenge(token, CODE, new Date(sentAt.getTime() + 300_010)),
    /fresh deletion code/i
  )
})

test("a transient deletion failure keeps the verified deletion retryable", async () => {
  const store = createBlumiBackendStore()
  const baseRepository = createInMemoryAuthRepository(store)
  let failNextDeletion = true
  const repository = {
    ...baseRepository,
    async deleteAccountData(
      ...args: Parameters<typeof baseRepository.deleteAccountData>
    ): ReturnType<typeof baseRepository.deleteAccountData> {
      if (failNextDeletion) {
        failNextDeletion = false
        throw new Error("temporary deletion failure")
      }
      return baseRepository.deleteAccountData(...args)
    }
  }
  const service = createAuthService({
    store,
    repository,
    codeFactory: () => CODE
  })
  const signedAt = new Date("2026-07-21T11:00:00.000Z")
  await service.sendCode(PHONE, signedAt)
  const signedIn = await service.verifyCode(PHONE, CODE, signedAt)
  const now = new Date(signedAt.getTime() + 31_000)
  await service.requestAccountDeletionChallenge(signedIn.sessionToken, now)
  const verified = await service.verifyAccountDeletionChallenge(
    signedIn.sessionToken,
    CODE,
    now
  )
  assert.ok(verified)

  await assert.rejects(
    service.deleteAccount(
      signedIn.sessionToken,
      verified.confirmationToken,
      now
    ),
    /temporary deletion failure/
  )
  assert.equal(
    await service.deleteAccount(
      signedIn.sessionToken,
      verified.confirmationToken,
      now
    ),
    "deleted"
  )
})
