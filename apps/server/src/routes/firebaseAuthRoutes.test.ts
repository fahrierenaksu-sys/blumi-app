import assert from "node:assert/strict"
import test from "node:test"
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
  const app = createServer({
    authService: createAuthService(),
    firebaseAuthVerifier: { async verifyIdToken() {
      return { uid: "firebase-user-1", phoneNumber: PHONE, authTime: Math.floor(Date.now() / 1000) }
    } }
  })
  try {
    for (const [url, payload] of [
      ["/v1/auth/send-code", { phoneNumber: PHONE }],
      ["/v1/auth/verify", { phoneNumber: PHONE, verificationCode: "123456" }],
      ["/v1/accounts/register", { phoneNumber: PHONE, verificationCode: "123456", termsAcceptance: { version: "test-terms-v1", locale: "tr" } }]
    ] as const) {
      const response = await app.inject({ method: "POST", url, payload })
      assert.equal(response.statusCode, 410, url)
      assert.equal(response.json().code, "FIREBASE_PHONE_AUTH_REQUIRED")
    }
  } finally { await app.close() }
})
