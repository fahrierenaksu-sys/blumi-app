import assert from "node:assert/strict"
import test from "node:test"
import { createAccountRecoveryService, createInMemoryAccountRecoveryRepository } from "../account/accountRecoveryService"
import { createAuthService } from "../auth/authService"
import { createServer } from "../server"

const PHONE = "+905551112233"

test("Firebase phone identity creates a Blumi account and signs the same account in", async () => {
  const app = createServer({
    authService: createAuthService(),
    firebaseAuthVerifier: {
      async verifyIdToken(idToken) {
        assert.equal(idToken, "firebase-id-token")
        return { uid: "firebase-user-1", phoneNumber: PHONE, authTime: Math.floor(Date.now() / 1000) }
      }
    }
  })

  try {
    const created = await app.inject({
      method: "POST",
      url: "/v1/auth/firebase/complete",
      payload: {
        idToken: "firebase-id-token",
        authIntent: "create",
        termsAcceptance: { version: "test-terms-v1", locale: "tr" }
      }
    })
    assert.equal(created.statusCode, 200)
    assert.equal(created.json().profile.userId, created.json().session.userId)

    const signedIn = await app.inject({
      method: "POST",
      url: "/v1/auth/firebase/complete",
      payload: { idToken: "firebase-id-token", authIntent: "sign-in" }
    })
    assert.equal(signedIn.statusCode, 200)
    assert.equal(signedIn.json().profile.userId, created.json().profile.userId)
    assert.notEqual(signedIn.json().session.sessionToken, created.json().session.sessionToken)
  } finally {
    await app.close()
  }
})

test("Firebase phone completion fails closed when the verifier is not configured", async () => {
  const app = createServer({ authService: createAuthService() })
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/firebase/complete",
      payload: { idToken: "firebase-id-token", authIntent: "sign-in" }
    })
    assert.equal(response.statusCode, 503)
  } finally {
    await app.close()
  }
})

test("Firebase-backed servers retire legacy SMS endpoints instead of claiming a code was sent", async () => {
  const authService = createAuthService()
  let recoveryChallenges = 0
  const requestRecovery = authService.requestRecoveryPhoneVerification.bind(authService)
  authService.requestRecoveryPhoneVerification = async (phone) => {
    recoveryChallenges += 1
    return requestRecovery(phone)
  }
  const app = createServer({
    authService,
    firebaseAuthVerifier: { async verifyIdToken() {
      return { uid: "firebase-user-1", phoneNumber: PHONE, authTime: Math.floor(Date.now() / 1000) }
    } }
  })
  try {
    for (const [url, payload] of [
      ["/v1/auth/send-code", { phoneNumber: PHONE }],
      ["/v1/auth/verify", { phoneNumber: PHONE, verificationCode: "123456" }],
      ["/v1/accounts/register", { phoneNumber: PHONE, verificationCode: "123456", termsAcceptance: { version: "test-terms-v1", locale: "tr" } }],
      ["/v1/account/recovery/challenge", { phoneNumber: PHONE }]
    ] as const) {
      const response = await app.inject({ method: "POST", url, payload })
      assert.equal(response.statusCode, 410, url)
      assert.equal(response.json().code, "FIREBASE_PHONE_AUTH_REQUIRED")
    }
    // No challenge row is written for a number nobody proved.
    assert.equal(recoveryChallenges, 0)
  } finally { await app.close() }
})

test("a different Firebase uid for a bound phone is routed to manual account recovery", async () => {
  const authService = createAuthService()
  const recoveryRepository = createInMemoryAccountRecoveryRepository()
  let uid = "firebase-user-1"
  const app = createServer({
    authService,
    accountRecoveryService: createAccountRecoveryService({ authService, repository: recoveryRepository }),
    firebaseAuthVerifier: { async verifyIdToken() {
      return { uid, phoneNumber: PHONE, authTime: Math.floor(Date.now() / 1000) }
    } }
  })
  try {
    const created = await app.inject({
      method: "POST",
      url: "/v1/auth/firebase/complete",
      payload: { idToken: "t", authIntent: "create", termsAcceptance: { version: "test-terms-v1", locale: "tr" } }
    })
    assert.equal(created.statusCode, 200)

    uid = "firebase-user-2"
    const recycled = await app.inject({
      method: "POST",
      url: "/v1/auth/firebase/complete",
      payload: { idToken: "t", authIntent: "sign-in" }
    })
    assert.equal(recycled.statusCode, 409)
    assert.equal(recycled.json().code, "ACCOUNT_RECOVERY_REQUIRED")
    assert.equal(recycled.json().session, undefined)
    const requests = await recoveryRepository.list(10)
    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.accountId, created.json().session.accountId)
    assert.equal(requests[0]?.status, "pending")

    uid = "firebase-user-1"
    const owner = await app.inject({
      method: "POST",
      url: "/v1/auth/firebase/complete",
      payload: { idToken: "t", authIntent: "sign-in" }
    })
    assert.equal(owner.statusCode, 200)
    assert.equal(owner.json().session.accountId, created.json().session.accountId)
  } finally {
    await app.close()
  }
})
