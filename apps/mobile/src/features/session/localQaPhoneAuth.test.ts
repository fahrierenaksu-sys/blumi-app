import assert from "node:assert/strict"
import test from "node:test"
import {
  completeLocalQaPhoneSignIn,
  isLocalQaPhoneAuthAllowed,
  parseLocalQaSignInSlot,
  requestLocalQaPhoneCode,
  resolveLocalQaCredentials
} from "./localQaPhoneAuth"

const LOCAL_API = "http://127.0.0.1:4001"
// Fictional 555 number used only by the in-memory QA API.
const QA_PHONE = "+12025550101"
const TERMS = { version: "test-terms-v1", locale: "en" } as const

test("local QA sign-in needs a dev build, the explicit flag and a loopback API", () => {
  assert.equal(isLocalQaPhoneAuthAllowed({ isDevBuild: true, flag: "1", apiBaseUrl: LOCAL_API }), true)
  assert.equal(isLocalQaPhoneAuthAllowed({ isDevBuild: true, flag: "1", apiBaseUrl: "http://localhost:4000" }), true)
  assert.equal(isLocalQaPhoneAuthAllowed({ isDevBuild: false, flag: "1", apiBaseUrl: LOCAL_API }), false)
  assert.equal(isLocalQaPhoneAuthAllowed({ isDevBuild: true, flag: undefined, apiBaseUrl: LOCAL_API }), false)
  assert.equal(isLocalQaPhoneAuthAllowed({ isDevBuild: true, flag: "0", apiBaseUrl: LOCAL_API }), false)
  for (const apiBaseUrl of ["https://blumi-app-production.up.railway.app", "http://192.168.1.5:4000", "not a url"]) {
    assert.equal(isLocalQaPhoneAuthAllowed({ isDevBuild: true, flag: "1", apiBaseUrl }), false, apiBaseUrl)
  }
})

function recordingFetcher(status: number, body: unknown) {
  const calls: { url: string; body: unknown }[] = []
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "null")) })
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  return { calls, fetcher }
}

test("creating an account sends terms to register; signing in verifies without them", async () => {
  const create = recordingFetcher(401, { error: "That code is invalid or expired." })
  await assert.rejects(
    completeLocalQaPhoneSignIn(LOCAL_API, { phoneNumber: QA_PHONE, verificationCode: "135790", authIntent: "create", termsAcceptance: TERMS }, create.fetcher),
    /invalid or expired/
  )
  assert.equal(create.calls[0]?.url, `${LOCAL_API}/v1/accounts/register`)
  assert.deepEqual(create.calls[0]?.body, { phoneNumber: QA_PHONE, verificationCode: "135790", termsAcceptance: TERMS })

  const signIn = recordingFetcher(401, {})
  await assert.rejects(
    completeLocalQaPhoneSignIn(LOCAL_API, { phoneNumber: QA_PHONE, verificationCode: "135790", authIntent: "sign-in", termsAcceptance: TERMS }, signIn.fetcher),
    /Local QA sign-in failed/
  )
  assert.equal(signIn.calls[0]?.url, `${LOCAL_API}/v1/auth/verify`)
  assert.deepEqual(signIn.calls[0]?.body, { phoneNumber: QA_PHONE, verificationCode: "135790" })
})

test("a refused code request surfaces the server message", async () => {
  const retired = recordingFetcher(410, { error: "Update Blumi to verify your phone with Firebase." })
  await assert.rejects(requestLocalQaPhoneCode(LOCAL_API, QA_PHONE, retired.fetcher), /verify your phone with Firebase/)
  assert.equal(retired.calls[0]?.url, `${LOCAL_API}/v1/auth/send-code`)
})

test("the QA deep link picks a configured test user by slot and nothing else", () => {
  assert.equal(parseLocalQaSignInSlot("blumi://qa-sign-in?slot=2"), 2)
  for (const url of ["blumi://qa-sign-in", "blumi://qa-sign-in?slot=0", "blumi://room", "https://x/qa-sign-in?slot=1"]) {
    assert.equal(parseLocalQaSignInSlot(url), null, url)
  }
  const phones = `${QA_PHONE}, +12025550102`
  assert.deepEqual(resolveLocalQaCredentials(2, phones, "135790"), { phoneNumber: "+12025550102", verificationCode: "135790" })
  assert.equal(resolveLocalQaCredentials(3, phones, "135790"), null)
  assert.equal(resolveLocalQaCredentials(1, phones, "12345"), null)
  assert.equal(resolveLocalQaCredentials(1, "2025550101", "135790"), null)
  assert.equal(resolveLocalQaCredentials(1, undefined, "135790"), null)
})
