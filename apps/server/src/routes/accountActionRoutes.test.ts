import assert from "node:assert/strict"
import test from "node:test"
import { createAdminTokenService, mintAdminToken } from "../admin/adminTokenService"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createServer } from "../server"

const PHONE = "+905551112233"
const NEXT_PHONE = "+905559998877"
const CODE = "482931"

async function signedInApp() {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => CODE })
  const app = createServer({ authService })
  await authService.sendCode(PHONE)
  const signedIn = await app.inject({ method: "POST", url: "/v1/accounts/register", payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" }, phoneNumber: PHONE, verificationCode: CODE } })
  return { app, headers: { authorization: `Bearer ${signedIn.json().session.sessionToken}` } }
}

test("account export is reauthenticated, no-store, and confirmation tokens cannot replay", async () => {
  const { app, headers } = await signedInApp()
  try {
    assert.equal((await app.inject({ method: "POST", url: "/v1/account/export/challenge" })).statusCode, 401)
    assert.equal((await app.inject({ method: "POST", url: "/v1/account/export/challenge", headers })).statusCode, 202)
    const confirmed = await app.inject({ method: "POST", url: "/v1/account/export/confirm", headers, payload: { verificationCode: CODE } })
    assert.equal(confirmed.statusCode, 200)
    const exported = await app.inject({ method: "POST", url: "/v1/account/export", headers, payload: { confirmationToken: confirmed.json().confirmationToken } })
    assert.equal(exported.statusCode, 200)
    assert.equal(exported.headers["cache-control"], "no-store")
    assert.match(exported.headers["content-disposition"] ?? "", /attachment/)
    assert.equal(exported.json().account.phoneNumber, PHONE)
    assert.equal((await app.inject({ method: "POST", url: "/v1/account/export", headers, payload: { confirmationToken: confirmed.json().confirmationToken } })).statusCode, 403)
  } finally { await app.close() }
})

test("phone change requires both proofs and invalidates the bearer session", async () => {
  const { app, headers } = await signedInApp()
  try {
    assert.equal((await app.inject({ method: "POST", url: "/v1/account/phone-change/current/challenge", headers })).statusCode, 202)
    const current = await app.inject({ method: "POST", url: "/v1/account/phone-change/current/confirm", headers, payload: { verificationCode: CODE } })
    assert.equal(current.statusCode, 200)
    assert.equal((await app.inject({ method: "POST", url: "/v1/account/phone-change/new/challenge", headers, payload: { phoneNumber: NEXT_PHONE, currentPhoneConfirmationToken: current.json().confirmationToken } })).statusCode, 202)
    const next = await app.inject({ method: "POST", url: "/v1/account/phone-change/new/confirm", headers, payload: { verificationCode: CODE } })
    assert.equal(next.statusCode, 200)
    const completed = await app.inject({ method: "POST", url: "/v1/account/phone-change/confirm", headers, payload: { currentPhoneConfirmationToken: current.json().confirmationToken, newPhoneConfirmationToken: next.json().confirmationToken } })
    assert.equal(completed.statusCode, 204)
    assert.equal((await app.inject({ method: "GET", url: "/v1/users/me", headers })).statusCode, 401)
  } finally { await app.close() }
})

test("lost-phone recovery response does not disclose whether the old number has an account", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => CODE })
  const app = createServer({ authService })
  try {
    await authService.sendCode(PHONE)
    await authService.verifyCode(PHONE, CODE)

    const knownChallenge = await app.inject({
      method: "POST",
      url: "/v1/account/recovery/challenge",
      payload: { phoneNumber: NEXT_PHONE }
    })
    assert.equal(knownChallenge.statusCode, 202)
    const known = await app.inject({
      method: "POST",
      url: "/v1/account/recovery/requests",
      payload: { oldPhoneNumber: PHONE, newPhoneNumber: NEXT_PHONE, verificationCode: CODE }
    })

    const unknownPhone = "+905551110000"
    const secondNewPhone = "+905559990000"
    assert.equal((await app.inject({
      method: "POST",
      url: "/v1/account/recovery/challenge",
      payload: { phoneNumber: secondNewPhone }
    })).statusCode, 202)
    const unknown = await app.inject({
      method: "POST",
      url: "/v1/account/recovery/requests",
      payload: { oldPhoneNumber: unknownPhone, newPhoneNumber: secondNewPhone, verificationCode: CODE }
    })

    assert.equal(known.statusCode, 202)
    assert.deepEqual(known.json(), { ok: true })
    assert.equal(unknown.statusCode, 202)
    assert.deepEqual(unknown.json(), { ok: true })
  } finally { await app.close() }
})

test("account route schemas preserve auth precedence and recovery privacy", async () => {
  const { app, headers } = await signedInApp()
  try {
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/v1/account/deletion/confirm",
      payload: {}
    })
    assert.equal(unauthenticated.statusCode, 401)

    const invalidDeletionCode = await app.inject({
      method: "POST",
      url: "/v1/account/deletion/confirm",
      headers,
      payload: { verificationCode: "48293" }
    })
    assert.equal(invalidDeletionCode.statusCode, 400)

    const invalidPhoneChange = await app.inject({
      method: "POST",
      url: "/v1/account/phone-change/new/challenge",
      headers,
      payload: { phoneNumber: NEXT_PHONE }
    })
    assert.equal(invalidPhoneChange.statusCode, 400)

    const malformedRecovery = await app.inject({
      method: "POST",
      url: "/v1/account/recovery/requests",
      payload: { oldPhoneNumber: PHONE }
    })
    assert.equal(malformedRecovery.statusCode, 202)
    assert.deepEqual(malformedRecovery.json(), { ok: true })
  } finally {
    await app.close()
  }
})

test("account recovery admin flow preserves old-phone evidence and audited resolution identity", async () => {
  const signingKey = { keyId: "kid_recovery", secret: Buffer.alloc(32, 9) }
  const adminTokenService = createAdminTokenService({ keys: [signingKey] })
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => CODE })
  const app = createServer({ authService, adminTokenService })
  try {
    await authService.sendCode(PHONE)
    await authService.verifyCode(PHONE, CODE)
    await app.inject({
      method: "POST",
      url: "/v1/account/recovery/challenge",
      payload: { phoneNumber: NEXT_PHONE }
    })
    await app.inject({
      method: "POST",
      url: "/v1/account/recovery/requests",
      payload: { oldPhoneNumber: PHONE, newPhoneNumber: NEXT_PHONE, verificationCode: CODE }
    })
    const adminToken = mintAdminToken({
      key: signingKey,
      operatorId: "ops-recovery",
      tokenId: "token-recovery",
      scopes: ["account-recovery:read", "account-recovery:resolve"],
      ttlSeconds: 60
    })
    const listed = await app.inject({
      method: "GET",
      url: "/v1/admin/account-recovery",
      headers: { authorization: `Bearer ${adminToken}` }
    })
    assert.equal(listed.statusCode, 200)
    assert.equal(listed.json().requests[0].claimedOldPhoneNumber, PHONE)
    const resolved = await app.inject({
      method: "POST",
      url: `/v1/admin/account-recovery/${listed.json().requests[0].requestId}/resolve`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: "manual_review_required" }
    })
    assert.equal(resolved.statusCode, 200)
    assert.equal(resolved.json().request.resolvedByOperatorId, "ops-recovery")
    assert.equal(resolved.json().request.resolvedByTokenId, "token-recovery")
  } finally { await app.close() }
})
