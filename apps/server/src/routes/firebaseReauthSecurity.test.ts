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

async function signedInChallengeApp(options: { logLines?: string[] } = {}) {
  const auth = createAuthService()
  const signedIn = await auth.signInWithVerifiedPhone(PHONE, {
    firebaseUid: randomUUID(), acceptedTerms: { version: "test-terms-v1", locale: "tr" }
  })
  const app = createServer({
    authService: auth,
    firebaseAuthVerifier: {
      async verifyIdToken() { return { uid: randomUUID(), phoneNumber: PHONE, authTime: Math.ceil(Date.now() / 1000) + 1 } }
    },
    ...(options.logLines
      ? { logger: true, logDestination: { write: (line: string) => { options.logLines?.push(line) } } }
      : {})
  })
  const headers = { authorization: `Bearer ${signedIn.sessionToken}` }
  const challenge = (payload: Record<string, unknown>, requestHeaders: Record<string, string> = headers) =>
    app.inject({ method: "POST", url: "/v1/account/firebase/challenge", headers: requestHeaders, payload })
  return { app, challenge }
}

const REAUTH_PURPOSES = ["account_deletion", "account_data_export", "phone_change_current"] as const

test("a session token alone never learns the account's phone from a re-authentication challenge", async () => {
  // One app per purpose: the route allows 5 challenges per 5 minutes.
  for (const purpose of REAUTH_PURPOSES) {
    const logLines: string[] = []
    const { app, challenge } = await signedInChallengeApp({ logLines })
    try {
      for (const payload of [{ purpose }, { purpose, targetPhoneNumber: NEW_PHONE }]) {
        const answer = await challenge(payload)
        assert.equal(answer.statusCode, 200, "the challenge itself is never refused")
        assert.equal(typeof answer.json().challengeId, "string")
        assert.equal(answer.json().targetPhoneNumberWithheld, true)
        assert.equal("targetPhoneNumber" in answer.json(), false)
        assert.doesNotMatch(answer.body, /5555550123/)
      }
      assert.doesNotMatch(logLines.join("\n"), /5555550123/, "the account phone is never logged")
    } finally { await app.close() }
  }
})

test("a challenge confirms the account's phone only to a client that already holds it", async () => {
  for (const purpose of REAUTH_PURPOSES) {
    const { app, challenge } = await signedInChallengeApp()
    try {
      for (const knownPhone of [PHONE, "+1 (555) 555-0123"]) {
        const answer = await challenge({ purpose, targetPhoneNumber: knownPhone })
        assert.equal(answer.statusCode, 200)
        assert.equal(answer.json().targetPhoneNumber, PHONE)
        assert.equal("targetPhoneNumberWithheld" in answer.json(), false)
      }
    } finally { await app.close() }
  }
})

test("a new-phone challenge and a signed-out request never name a phone", async () => {
  const { app, challenge } = await signedInChallengeApp()
  try {
    const next = await challenge({ purpose: "phone_change_new", targetPhoneNumber: NEW_PHONE })
    assert.equal(next.statusCode, 200)
    assert.equal("targetPhoneNumber" in next.json(), false)
    assert.equal("targetPhoneNumberWithheld" in next.json(), false)
    const signedOut = await challenge({ purpose: "account_deletion", targetPhoneNumber: PHONE },
      { authorization: "Bearer fake-ended-session" })
    assert.equal(signedOut.statusCode, 401)
    assert.doesNotMatch(signedOut.body, /5555550123/)
  } finally { await app.close() }
})

test("phone guesses stay rate limited at 5 challenges per 5 minutes", async () => {
  const { app, challenge } = await signedInChallengeApp()
  try {
    for (let guess = 0; guess < 5; guess += 1) {
      assert.equal((await challenge({ purpose: "account_deletion", targetPhoneNumber: `+1555555000${guess}` })).statusCode, 200)
    }
    const limited = await challenge({ purpose: "account_deletion", targetPhoneNumber: PHONE })
    assert.equal(limited.statusCode, 429)
    assert.doesNotMatch(limited.body, /5555550123/)
  } finally { await app.close() }
})
