import assert from "node:assert/strict"
import test from "node:test"
import { createAccountRecoveryService, createInMemoryAccountRecoveryRepository } from "../account/accountRecoveryService"
import { createAuthService } from "../auth/authService"
import { createFirebaseAuthVerifier, FirebaseVerifierUnavailableError } from "../auth/firebaseAuth"
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

test("a Firebase provider or credential failure answers 503 and never counts as a failed sign-in", async () => {
  let failure: unknown = new FirebaseVerifierUnavailableError()
  const app = createServer({
    authService: createAuthService(),
    firebaseAuthVerifier: { async verifyIdToken() { throw failure } }
  })
  try {
    const complete = () => app.inject({
      method: "POST", url: "/v1/auth/firebase/complete", remoteAddress: "203.0.113.77",
      payload: { idToken: "firebase-id-token", authIntent: "sign-in" }
    })
    for (const error of [
      new FirebaseVerifierUnavailableError(),
      Object.assign(new Error("credential"), { code: "app/invalid-credential" }),
      Object.assign(new Error("internal"), { code: "auth/internal-error" }),
      new Error("socket hang up")
    ]) {
      failure = error
      const response = await complete()
      assert.equal(response.statusCode, 503)
      assert.equal(response.headers["retry-after"], "5")
    }
    // The failed-auth limiter counts 401 answers only, so none of these did.
    failure = Object.assign(new Error("expired"), { code: "auth/id-token-expired" })
    assert.equal((await complete()).statusCode, 401, "a rejected token is still the caller's failure")
  } finally { await app.close() }
})

test("a malformed or, in production, missing Firebase credential fails at startup", () => {
  assert.throws(() => createFirebaseAuthVerifier({ serviceAccountJson: "{not json" }), /valid JSON/)
  assert.throws(() => createFirebaseAuthVerifier({ serviceAccountJson: JSON.stringify({ project_id: "p" }) }), /missing required fields/)
  assert.throws(() => createFirebaseAuthVerifier({ requireCredential: true }), /required in production/)
  assert.doesNotThrow(() => createFirebaseAuthVerifier({ requireCredential: true, applicationDefaultCredentialsPath: "/secrets/gcp.json" }))
  assert.doesNotThrow(() => createFirebaseAuthVerifier({}))
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
