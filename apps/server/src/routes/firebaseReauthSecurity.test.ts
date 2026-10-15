import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { DatabaseError } from "pg"
import { createAuthService } from "../auth/authService"
import { createInMemoryAuthRepository } from "../auth/authRepository"
import { createBlumiBackendStore } from "../auth/authStore"
import { FirebaseVerifierUnavailableError } from "../auth/firebaseAuth"
import { createServer } from "../server"

const PHONE = "+15555550123"
const NEW_PHONE = "+15555550124"

for (const purpose of ["account_deletion", "account_data_export", "phone_change_current"] as const) {
  test(`Firebase ${purpose} refuses a different identity before consuming the challenge`, async () => {
    const auth = createAuthService()
    const ownerUid = randomUUID()
    const foreignUid = randomUUID()
    const signedIn = await auth.signInWithVerifiedPhone(PHONE, {
      firebaseUid: ownerUid, acceptedTerms: { version: "test-terms-v1", locale: "tr" }
    })
    let uid = foreignUid
    const app = createServer({ authService: auth, firebaseAuthVerifier: {
      async verifyIdToken() { return { uid, phoneNumber: PHONE, authTime: Math.ceil(Date.now() / 1000) + 1 } }
    } })
    const headers = { authorization: `Bearer ${signedIn.sessionToken}` }
    try {
      const challenge = await app.inject({ method: "POST", url: "/v1/account/firebase/challenge", headers, payload: { purpose } })
      assert.equal(challenge.statusCode, 200)
      const proof = { idToken: "test-proof", purpose, challengeId: challenge.json().challengeId }
      const refused = await app.inject({ method: "POST", url: "/v1/account/firebase/reauth", headers, payload: proof })
      assert.equal(refused.statusCode, 401)
      assert.equal("confirmationToken" in refused.json(), false)
      assert.ok(await auth.getSession(signedIn.sessionToken))
      assert.equal(await auth.repository.hasPendingFirebaseUserDeletion(signedIn.account.accountId), false)
      uid = ownerUid
      assert.equal((await app.inject({ method: "POST", url: "/v1/account/firebase/reauth", headers, payload: proof })).statusCode, 200)
      assert.equal((await app.inject({ method: "POST", url: "/v1/account/firebase/reauth", headers, payload: proof })).statusCode, 401)
    } finally { await app.close() }
  })
}

test("Firebase new-phone proof may use a different identity after proving the current phone", async () => {
  const auth = createAuthService()
  const ownerUid = randomUUID()
  const newUid = randomUUID()
  const signedIn = await auth.signInWithVerifiedPhone(PHONE, {
    firebaseUid: ownerUid, acceptedTerms: { version: "test-terms-v1", locale: "tr" }
  })
  const app = createServer({ authService: auth, firebaseAuthVerifier: {
    async verifyIdToken(token) {
      return { uid: token === "new-proof" ? newUid : ownerUid,
        phoneNumber: token === "new-proof" ? NEW_PHONE : PHONE, authTime: Math.ceil(Date.now() / 1000) + 1 }
    }
  } })
  const headers = { authorization: `Bearer ${signedIn.sessionToken}` }
  try {
    const currentChallenge = await app.inject({ method: "POST", url: "/v1/account/firebase/challenge", headers,
      payload: { purpose: "phone_change_current" } })
    const current = await app.inject({ method: "POST", url: "/v1/account/firebase/reauth", headers,
      payload: { purpose: "phone_change_current", idToken: "current-proof", challengeId: currentChallenge.json().challengeId } })
    assert.equal(current.statusCode, 200)
    const nextChallenge = await app.inject({ method: "POST", url: "/v1/account/firebase/challenge", headers,
      payload: { purpose: "phone_change_new", targetPhoneNumber: NEW_PHONE } })
    const next = await app.inject({ method: "POST", url: "/v1/account/firebase/reauth", headers,
      payload: { purpose: "phone_change_new", idToken: "new-proof", challengeId: nextChallenge.json().challengeId,
        currentPhoneConfirmationToken: current.json().confirmationToken } })
    assert.equal(next.statusCode, 200)
  } finally { await app.close() }
})

test("Firebase provider outage is retryable and does not consume the action challenge", async () => {
  const auth = createAuthService()
  const uid = randomUUID()
  const signedIn = await auth.signInWithVerifiedPhone(PHONE, {
    firebaseUid: uid, acceptedTerms: { version: "test-terms-v1", locale: "tr" }
  })
  let unavailable = true
  const app = createServer({ authService: auth, firebaseAuthVerifier: {
    async verifyIdToken() {
      if (unavailable) throw new FirebaseVerifierUnavailableError()
      return { uid, phoneNumber: PHONE, authTime: Math.ceil(Date.now() / 1000) + 1 }
    }
  } })
  const headers = { authorization: `Bearer ${signedIn.sessionToken}` }
  try {
    const challenge = await app.inject({ method: "POST", url: "/v1/account/firebase/challenge", headers,
      payload: { purpose: "account_data_export" } })
    const proof = { purpose: "account_data_export", idToken: "test-proof", challengeId: challenge.json().challengeId }
    const outage = await app.inject({ method: "POST", url: "/v1/account/firebase/reauth", headers, payload: proof })
    assert.equal(outage.statusCode, 503)
    assert.ok(Number(outage.headers["retry-after"]) > 0)
    unavailable = false
    assert.equal((await app.inject({ method: "POST", url: "/v1/account/firebase/reauth", headers, payload: proof })).statusCode, 200)
  } finally { await app.close() }
})

test("Firebase token rejection stays 401 while database errors use the central safe boundary", async () => {
  const repository = createInMemoryAuthRepository(createBlumiBackendStore())
  const auth = createAuthService({ repository })
  const uid = randomUUID()
  const signedIn = await auth.signInWithVerifiedPhone(PHONE, {
    firebaseUid: uid, acceptedTerms: { version: "test-terms-v1", locale: "tr" }
  })
  let rejectToken = true
  const app = createServer({ authService: auth, firebaseAuthVerifier: {
    async verifyIdToken() {
      if (rejectToken) throw Object.assign(new Error("private-provider-detail"), { code: "auth/id-token-expired" })
      return { uid, phoneNumber: PHONE, authTime: Math.ceil(Date.now() / 1000) + 1 }
    }
  } })
  const headers = { authorization: `Bearer ${signedIn.sessionToken}` }
  try {
    const challenge = await app.inject({ method: "POST", url: "/v1/account/firebase/challenge", headers,
      payload: { purpose: "account_data_export" } })
    const proof = { purpose: "account_data_export", idToken: "test-proof", challengeId: challenge.json().challengeId }
    const rejected = await app.inject({ method: "POST", url: "/v1/account/firebase/reauth", headers, payload: proof })
    assert.equal(rejected.statusCode, 401)
    assert.doesNotMatch(rejected.body, /private-provider-detail/)
    rejectToken = false
    repository.consumeFirebaseActionChallenge = async () => {
      throw Object.assign(new DatabaseError("private-database-detail", 0, "error"), { code: "08006", severity: "ERROR" })
    }
    const dbFailure = await app.inject({ method: "POST", url: "/v1/account/firebase/reauth", headers, payload: proof })
    assert.equal(dbFailure.statusCode, 503)
    assert.doesNotMatch(dbFailure.body, /private-database-detail/)
  } finally { await app.close() }
})

test("a Firebase challenge names the account's phone for re-authentication, never for a new phone", async () => {
  const auth = createAuthService()
  const signedIn = await auth.signInWithVerifiedPhone(PHONE, {
    firebaseUid: randomUUID(), acceptedTerms: { version: "test-terms-v1", locale: "tr" }
  })
  const app = createServer({ authService: auth, firebaseAuthVerifier: {
    async verifyIdToken() { return { uid: randomUUID(), phoneNumber: PHONE, authTime: Math.ceil(Date.now() / 1000) + 1 } }
  } })
  const headers = { authorization: `Bearer ${signedIn.sessionToken}` }
  try {
    for (const purpose of ["account_deletion", "account_data_export", "phone_change_current"]) {
      const challenge = await app.inject({ method: "POST", url: "/v1/account/firebase/challenge", headers, payload: { purpose } })
      assert.equal(challenge.statusCode, 200)
      assert.equal(challenge.json().targetPhoneNumber, PHONE)
    }
    const next = await app.inject({ method: "POST", url: "/v1/account/firebase/challenge", headers,
      payload: { purpose: "phone_change_new", targetPhoneNumber: NEW_PHONE } })
    assert.equal(next.statusCode, 200)
    assert.equal("targetPhoneNumber" in next.json(), false)
    const signedOut = await app.inject({ method: "POST", url: "/v1/account/firebase/challenge",
      headers: { authorization: "Bearer fake-ended-session" }, payload: { purpose: "account_deletion" } })
    assert.equal(signedOut.statusCode, 401)
    assert.equal("targetPhoneNumber" in signedOut.json(), false)
  } finally { await app.close() }
})
