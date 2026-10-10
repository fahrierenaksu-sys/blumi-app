import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createConfiguredCodeFactory, resolveServerConfig } from "../config"
import { createServer } from "../server"

// Fictional 555 numbers; they exist only inside the in-memory test server.
const QA_GIRL_PHONE = "+12025550101"
const QA_BOY_PHONE = "+12025550102"
const QA_CODE = "135790"
const TERMS = { version: "test-terms-v1", locale: "tr" } as const

const LOCAL_QA_ENV = {
  NODE_ENV: "development",
  HOST: "127.0.0.1",
  BLUMI_AUTH_REPOSITORY: "memory",
  BLUMI_QA_AUTH_ENABLED: "1",
  BLUMI_QA_PHONE_NUMBER: `${QA_GIRL_PHONE},${QA_BOY_PHONE}`,
  BLUMI_QA_OTP_CODE: QA_CODE
}

const rejectingFirebaseVerifier = {
  async verifyIdToken(): Promise<never> {
    throw new Error("Local QA sign-in must not reach Firebase")
  }
}

function createLocalQaApp(localQaOtpEnabled: boolean) {
  const config = resolveServerConfig(LOCAL_QA_ENV)
  const authService = createAuthService({
    codeFactory: createConfiguredCodeFactory(config),
    smsProvider: { sendVerificationCode() {} }
  })
  const app = createServer({
    nodeEnv: "development",
    authService,
    firebaseAuthVerifier: rejectingFirebaseVerifier,
    localQaOtpEnabled
  })
  return { app, authService }
}

test("a production server refuses local QA phone codes", () => {
  assert.throws(
    () => createServer({ nodeEnv: "production", localQaOtpEnabled: true }),
    /Local QA phone codes must never be enabled in production/
  )
})

test("production and staging configs refuse every local QA auth setting", () => {
  for (const deployEnv of [undefined, "staging", "production"]) {
    assert.throws(
      () => resolveServerConfig({
        ...LOCAL_QA_ENV,
        NODE_ENV: "production",
        BLUMI_DEPLOY_ENV: deployEnv,
        REVENUECAT_PURCHASE_ENVIRONMENT: deployEnv === "staging" ? "sandbox" : undefined
      }),
      /QA auth must never be configured in production/,
      String(deployEnv)
    )
  }
})

test("local QA auth accepts a short list of test numbers and nothing malformed", () => {
  assert.deepEqual(resolveServerConfig(LOCAL_QA_ENV).qaAuth?.phoneNumbers, [QA_GIRL_PHONE, QA_BOY_PHONE])
  for (const numbers of [`${QA_GIRL_PHONE},`, "12025550101", "+12025550101,+12025550102,+12025550103,+12025550104,+12025550105"]) {
    assert.throws(
      () => resolveServerConfig({ ...LOCAL_QA_ENV, BLUMI_QA_PHONE_NUMBER: numbers }),
      /QA auth/,
      numbers
    )
  }
})

test("without the local QA flag the server-sent code routes stay retired behind Firebase", async () => {
  const { app } = createLocalQaApp(false)
  try {
    const response = await app.inject({ method: "POST", url: "/v1/auth/send-code", payload: { phoneNumber: QA_GIRL_PHONE } })
    assert.equal(response.statusCode, 410)
    assert.equal(response.json().code, "FIREBASE_PHONE_AUTH_REQUIRED")
  } finally { await app.close() }
})

test("local QA lets two test users create accounts and sign in again with the fixed code", async () => {
  const { app, authService } = createLocalQaApp(true)
  try {
    const userIds = new Set<string>()
    for (const phoneNumber of [QA_GIRL_PHONE, QA_BOY_PHONE]) {
      const sent = await app.inject({ method: "POST", url: "/v1/auth/send-code", payload: { phoneNumber } })
      assert.equal(sent.statusCode, 202)
      const created = await app.inject({
        method: "POST",
        url: "/v1/accounts/register",
        payload: { phoneNumber, verificationCode: QA_CODE, termsAcceptance: TERMS }
      })
      assert.equal(created.statusCode, 200, created.body)
      userIds.add(created.json().profile.userId)

      // Sign in again once the 30 s resend cooldown has passed.
      const later = new Date(Date.now() + 31_000)
      await authService.sendCode(phoneNumber, later)
      const signedIn = await authService.verifyExistingAccount(phoneNumber, QA_CODE, later)
      assert.equal(signedIn.account.userId, created.json().profile.userId)
    }
    assert.equal(userIds.size, 2)
  } finally { await app.close() }
})
