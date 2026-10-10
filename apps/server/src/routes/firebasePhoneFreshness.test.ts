import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { FIREBASE_PHONE_PROOF_MAX_AGE_MS, isRecentFirebasePhoneProof } from "../auth/firebaseAuth"
import { createServer } from "../server"

test("phone proof age uses authentication time rather than a refreshed token timestamp", () => {
  const now = 1_700_000_000_000
  const identity = { uid: "fixture", phoneNumber: "+15550000001", authTime: now / 1000 }
  assert.equal(isRecentFirebasePhoneProof(identity, now), true)
  assert.equal(isRecentFirebasePhoneProof(identity, now + FIREBASE_PHONE_PROOF_MAX_AGE_MS), true)
  assert.equal(isRecentFirebasePhoneProof(identity, now + FIREBASE_PHONE_PROOF_MAX_AGE_MS + 1), false)
  assert.equal(isRecentFirebasePhoneProof({ ...identity, authTime: (now + 31_000) / 1000 }, now), false)
  for (const authTime of [0, -1, NaN, Infinity, 1.5]) {
    assert.equal(isRecentFirebasePhoneProof({ ...identity, authTime }, now), false)
  }
})

test("a cached phone token cannot create, sign in or enqueue recovery using a fresh iat", async () => {
  const authService = createAuthService()
  let recoveryCalls = 0
  const identity = { uid: "fixture", phoneNumber: "+15550000001",
    authTime: Math.floor((Date.now() - FIREBASE_PHONE_PROOF_MAX_AGE_MS - 60_000) / 1000) }
  const app = createServer({ authService,
    firebaseAuthVerifier: { async verifyIdToken() { return { ...identity } } },
    accountRecoveryService: {
      async requestWithVerifiedPhone() { recoveryCalls++ }
    } as never })
  try {
    for (const authIntent of ["create", "sign-in"]) {
      const response = await app.inject({ method: "POST", url: "/v1/auth/firebase/complete",
        payload: { idToken: "fixture-refreshed-token", authIntent,
          termsAcceptance: { version: "fixture-terms", locale: "tr" } } })
      assert.equal(response.statusCode, 401)
      assert.equal(response.json().session, undefined)
    }
    assert.equal(await authService.repository.getAccountByPhone(identity.phoneNumber), null)
    const response = await app.inject({ method: "POST", url: "/v1/account/recovery/requests",
      payload: { oldPhoneNumber: "+15550000002", newPhoneNumber: identity.phoneNumber,
        idToken: "fixture-refreshed-token" } })
    assert.equal(response.statusCode, 202)
    assert.equal(recoveryCalls, 0)
  } finally { await app.close() }
})
