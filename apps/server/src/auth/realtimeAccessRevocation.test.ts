import assert from "node:assert/strict"
import test from "node:test"
import { REPORT_REASONS } from "@blumi/contracts"
import { createSafetyService } from "../safety/safetyService"
import { createInMemoryAuthRepository } from "./authRepository"
import { createAuthService } from "./authService"
import { createBlumiBackendStore } from "./authStore"
import type { RealtimeAccessRevocation } from "./realtimeAccessRevocation"

const PHONE = "+905551112233"
const NEXT_PHONE = "+905559998877"
const CODE = "482931"

async function signedInService(options: Parameters<typeof createAuthService>[0] = {}) {
  const store = options.store ?? createBlumiBackendStore()
  const service = createAuthService({ store, codeFactory: () => CODE, ...options })
  const signedAt = new Date("2026-07-21T09:00:00.000Z")
  await service.sendCode(PHONE, signedAt)
  const signedIn = await service.verifyCode(PHONE, CODE, signedAt)
  const revocations: RealtimeAccessRevocation[] = []
  service.subscribeRealtimeAccessRevocations((revocation) => { revocations.push(revocation) })
  return { service, store, signedIn, token: signedIn.sessionToken, signedAt, revocations }
}

test("sign-out publishes a revocation for the session owner after the family is deleted", async () => {
  const { service, signedIn, token, signedAt, revocations } = await signedInService()
  assert.ok(await service.getSession(token, signedAt))
  // Listeners re-check authorization, so the deletion must be committed first.
  let sessionAtPublish: ReturnType<typeof service.getSession> | undefined
  service.subscribeRealtimeAccessRevocations(() => {
    sessionAtPublish = service.getSession(token, signedAt)
  })
  await service.revokeSession(token)
  assert.deepEqual(revocations, [{ kind: "user", userId: signedIn.account.userId }])
  assert.equal(await sessionAtPublish, null)
})

test("sign-out with an unknown token publishes nothing, and a failed lookup invalidates everything", async () => {
  const { service, revocations } = await signedInService()
  await service.revokeSession("not-a-session")
  assert.deepEqual(revocations, [])

  const store = createBlumiBackendStore()
  const base = createInMemoryAuthRepository(store)
  let lookupFails = false
  const failing = await signedInService({
    store,
    repository: {
      ...base,
      async getSessionByTokenHash(hash) {
        if (lookupFails) throw new Error("lookup unavailable")
        return base.getSessionByTokenHash(hash)
      }
    }
  })
  lookupFails = true
  await failing.service.revokeSession(failing.token)
  lookupFails = false
  assert.deepEqual(failing.revocations, [{ kind: "all" }])
  assert.equal(await failing.service.getSession(failing.token, failing.signedAt), null)
})

test("a throwing revocation listener cannot break sign-out", async () => {
  const { service, token, signedAt, revocations } = await signedInService()
  service.subscribeRealtimeAccessRevocations(() => { throw new Error("listener bug") })
  await service.revokeSession(token)
  assert.equal(revocations.length, 1)
  assert.equal(await service.getSession(token, signedAt), null)
})

test("unsubscribed listeners stop receiving revocations", async () => {
  const { service, token } = await signedInService()
  const received: RealtimeAccessRevocation[] = []
  const unsubscribe = service.subscribeRealtimeAccessRevocations((revocation) => { received.push(revocation) })
  unsubscribe()
  await service.revokeSession(token)
  assert.deepEqual(received, [])
})

test("token rotation keeps the session family and publishes no revocation", async () => {
  const { service, token, signedAt, revocations } = await signedInService()
  assert.ok(await service.refreshSession(token, signedAt))
  assert.deepEqual(revocations, [])
})

test("account deletion publishes a revocation only when data was deleted", async () => {
  const { service, signedIn, token, signedAt, revocations } = await signedInService()
  const now = new Date(signedAt.getTime() + 31_000)
  assert.equal(await service.deleteAccount(token, "invalid", now), "reauth_required")
  assert.deepEqual(revocations, [])
  await service.requestAccountDeletionChallenge(token, now)
  const verified = await service.verifyAccountDeletionChallenge(token, CODE, now)
  assert.ok(verified)
  assert.equal(await service.deleteAccount(token, verified.confirmationToken, now), "deleted")
  assert.deepEqual(revocations, [{ kind: "user", userId: signedIn.account.userId }])
})

test("a completed phone change publishes a revocation for every old session", async () => {
  const { service, signedIn, token, signedAt, revocations } = await signedInService()
  const now = new Date(signedAt.getTime() + 62_000)
  await service.requestPhoneChangeChallenge(token, now)
  const current = await service.verifyPhoneChangeChallenge(token, CODE, now)
  assert.ok(current)
  await service.requestPhoneChangeNewNumberChallenge(token, NEXT_PHONE, current.confirmationToken, now)
  const next = await service.verifyPhoneChangeNewNumberChallenge(token, CODE, now)
  assert.ok(next)
  assert.equal(await service.confirmPhoneChange(token, current.confirmationToken, "wrong", now), "reauth_required")
  assert.deepEqual(revocations, [])
  const changed = await service.confirmPhoneChange(token, current.confirmationToken, next.confirmationToken, now)
  assert.ok(changed && typeof changed !== "string")
  assert.deepEqual(revocations, [{ kind: "user", userId: signedIn.account.userId }])
})

test("a resolved moderation report publishes a revocation for the reported user", async () => {
  const safety = createSafetyService()
  const revocations: RealtimeAccessRevocation[] = []
  safety.subscribeRealtimeAccessRevocations((revocation) => { revocations.push(revocation) })
  const { report } = await safety.reportUser("user_reporter", {
    reportedUserId: "user_reported",
    reason: REPORT_REASONS[0]
  })
  assert.deepEqual(revocations, [])
  await safety.resolveReport(report.reportId, {
    action: "ban",
    admin: { operatorId: "operator_1", tokenId: "token_1" }
  })
  assert.deepEqual(revocations, [{ kind: "user", userId: "user_reported" }])
})
