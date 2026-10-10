import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createServer } from "../server"

test("private API successes, failures and authentication proofs forbid HTTP storage", async () => {
  const auth = createAuthService()
  const uid = randomUUID()
  const phoneNumber = "+15555550125"
  const signedIn = await auth.signInWithVerifiedPhone(phoneNumber, {
    firebaseUid: uid, acceptedTerms: { version: "test-terms-v1", locale: "tr" }
  })
  const app = createServer({ authService: auth, firebaseAuthVerifier: {
    async verifyIdToken() { return { uid, phoneNumber, authTime: Math.ceil(Date.now() / 1000) } }
  } })
  try {
    const headers = { authorization: `Bearer ${signedIn.sessionToken}` }
    for (const request of [
      { method: "GET" as const, url: "/v1/users/me", headers, status: 200 },
      { method: "GET" as const, url: "/v1/users/me", status: 401 },
      { method: "POST" as const, url: "/v1/auth/refresh", headers, status: 200 },
      { method: "POST" as const, url: "/v1/auth/firebase/complete", payload: { idToken: "test-proof", authIntent: "sign-in" }, status: 200 },
      { method: "POST" as const, url: "/v1/auth/firebase/complete", payload: {}, status: 400 }
    ]) {
      const { status, ...input } = request
      const response = await app.inject(input)
      assert.equal(response.statusCode, status)
      assert.equal(response.headers["cache-control"], "no-store")
    }
  } finally { await app.close() }
})

test("API no-store policy preserves explicit caching on public association documents", async () => {
  const app = createServer({ appLinks: {
    appleAppId: "TEST.com.example.test", androidPackageName: "com.example.test", androidSha256CertFingerprints: ["AA:BB"]
  } })
  try {
    const response = await app.inject({ method: "GET", url: "/.well-known/apple-app-site-association" })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers["cache-control"], "public, max-age=3600")
    const missing = await app.inject({ method: "GET", url: `/missing/${randomUUID()}?private=should-not-echo` })
    assert.equal(missing.statusCode, 404)
    assert.deepEqual(missing.json(), { error: "Not found.", statusCode: 404 })
    assert.doesNotMatch(missing.body, /should-not-echo|missing\//)
  } finally { await app.close() }
})
