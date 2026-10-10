import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService, type AuthService } from "../auth/authService"
import { createServer } from "../server"

const fixturePhone = `+1${5555550123}`
const fixtureCode = "482931"
const legacyServiceMethods = new Set<keyof AuthService>([
  "sendCode", "verifyExistingAccount", "registerAccount",
  "requestRecoveryPhoneVerification", "requestAccountDeletionChallenge",
  "verifyAccountDeletionChallenge", "requestAccountDataExportChallenge",
  "verifyAccountDataExportChallenge", "requestPhoneChangeChallenge",
  "verifyPhoneChangeChallenge", "requestPhoneChangeNewNumberChallenge",
  "verifyPhoneChangeNewNumberChallenge"
])

async function createFirebaseFixture() {
  let smsCalls = 0
  let verifierCalls = 0
  let legacyServiceCalls = 0
  const auth = createAuthService({
    smsProvider: { sendVerificationCode() { smsCalls += 1 } }
  })
  const signedIn = await auth.signInWithVerifiedPhone(fixturePhone, {
    acceptedTerms: { version: "test-terms-v1", locale: "tr" }
  })
  const guardedAuth = new Proxy(auth, {
    get(target, key, receiver) {
      const member = Reflect.get(target, key, receiver)
      if (!legacyServiceMethods.has(key as keyof AuthService)) return member
      return (...args: unknown[]) => {
        legacyServiceCalls += 1
        return Reflect.apply(member, target, args)
      }
    }
  })
  const app = createServer({
    authService: guardedAuth,
    firebaseAuthVerifier: { async verifyIdToken() {
      verifierCalls += 1
      throw new Error("Legacy OTP must not invoke the Firebase verifier")
    } }
  })
  return {
    app,
    headers: { authorization: `Bearer ${signedIn.sessionToken}` },
    assertNoSideEffects() {
      assert.equal(legacyServiceCalls, 0, "No OTP challenge, confirmation, registration or verification work")
      assert.equal(smsCalls, 0, "No SMS delivery")
      assert.equal(verifierCalls, 0, "No Firebase token verification")
    }
  }
}

test("public legacy OTP routes remain 410 compatibility answers without authentication or side effects", async () => {
  const fixture = await createFirebaseFixture()
  try {
    for (const [url, payload] of [
      ["/v1/auth/send-code", { phoneNumber: fixturePhone }],
      ["/v1/auth/verify", { phoneNumber: fixturePhone, verificationCode: fixtureCode }],
      ["/v1/accounts/register", { phoneNumber: fixturePhone, verificationCode: fixtureCode,
        termsAcceptance: { version: "test-terms-v1", locale: "tr" } }],
      ["/v1/account/recovery/challenge", { phoneNumber: fixturePhone }]
    ] as const) {
      const response = await fixture.app.inject({ method: "POST", url, payload })
      assert.equal(response.statusCode, 410, url)
      assert.equal(response.json().code, "FIREBASE_PHONE_AUTH_REQUIRED", url)
    }
    fixture.assertNoSideEffects()
  } finally { await fixture.app.close() }
})

test("protected legacy OTP routes retain the missing-session boundary before 410 and never issue confirmations", async () => {
  const fixture = await createFirebaseFixture()
  try {
    for (const [url, payload] of [
      ["/v1/account/deletion/challenge", {}],
      ["/v1/account/deletion/confirm", { verificationCode: fixtureCode }],
      ["/v1/account/export/challenge", {}],
      ["/v1/account/export/confirm", { verificationCode: fixtureCode }],
      ["/v1/account/phone-change/current/challenge", {}],
      ["/v1/account/phone-change/current/confirm", { verificationCode: fixtureCode }],
      ["/v1/account/phone-change/new/challenge", { phoneNumber: `+1${5555550124}`,
        currentPhoneConfirmationToken: "fixture-confirmation" }],
      ["/v1/account/phone-change/new/confirm", { verificationCode: fixtureCode }]
    ] as const) {
      const unauthenticated = await fixture.app.inject({ method: "POST", url, payload })
      assert.equal(unauthenticated.statusCode, 401, url)
      const retired = await fixture.app.inject({ method: "POST", url, payload, headers: fixture.headers })
      assert.equal(retired.statusCode, 410, url)
      assert.equal(retired.json().code, "FIREBASE_PHONE_AUTH_REQUIRED", url)
      assert.equal("confirmationToken" in retired.json(), false, url)
    }
    fixture.assertNoSideEffects()
  } finally { await fixture.app.close() }
})

test("legacy recovery keeps its input boundary before the Firebase compatibility answer", async () => {
  const fixture = await createFirebaseFixture()
  try {
    const invalid = await fixture.app.inject({ method: "POST", url: "/v1/account/recovery/challenge", payload: {} })
    assert.equal(invalid.statusCode, 400)
    fixture.assertNoSideEffects()
  } finally { await fixture.app.close() }
})
