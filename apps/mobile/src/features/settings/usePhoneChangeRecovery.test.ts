import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import * as apiRequestError from "../network/apiRequestError"

// Drives the real usePhoneChange hook through its own API. Only the Firebase
// and Blumi API boundaries are fakes. Phone numbers are obviously fake.
const OLD_PHONE = "+900000000001"
const NEW_PHONE_LOCAL = "5550000002"
const actor = {
  session: { mode: "production", userId: "user-fake-1", sessionToken: "fake-token" },
  profile: { userId: "user-fake-1" }
}
const copy = new Proxy({}, { get: (_target, key) => String(key) })
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

const serverError = (status: number, code: apiRequestError.ApiRequestErrorCode) =>
  new apiRequestError.ApiRequestError({ status, code, message: `fake ${status}` })
const timeoutError = () => Object.assign(new Error("timed out"), { name: "TimeoutError" })

function mountPhoneChange(confirmOutcomes: Array<Error | "ok">) {
  const runtime = createFakeReactRuntime()
  let alertButtons: Array<{ onPress?: () => void }> = []
  const calls = {
    confirm: 0,
    firebaseConfirms: 0,
    resets: 0,
    codeRequests: [] as string[],
    toasts: [] as string[],
    proofsSent: [] as string[]
  }
  let firebasePhone = OLD_PHONE
  let verifyCount = 0
  const mod = loadSourceWithFakeReact<{ usePhoneChange: (input: unknown) => any }>(
    "features/settings/usePhoneChange.ts", runtime, {
      real: ["./settingsPhoneChangeModel", "../session/registerFlowModel"],
      modules: {
        "react-native": { Alert: { alert: (_t: string, _b: string, buttons: typeof alertButtons) => { alertButtons = buttons } } },
        "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
        "../../ui/toast": { showToast: (toast: { type: string; body?: string }) => calls.toasts.push(`${toast.type}:${toast.body}`) },
        "../network/apiRequestError": apiRequestError,
        "../session/firebasePhoneAuth": {
          confirmFirebasePhoneCode: async (confirmation: { phone: string }) => {
            calls.firebaseConfirms += 1
            firebasePhone = confirmation.phone // Firebase signs in as the confirmed phone.
            return "fake-id-token"
          },
          getFirebaseCurrentPhoneNumber: () => firebasePhone,
          requestFirebasePhoneCode: async (phone: string) => {
            calls.codeRequests.push(phone)
            return { phone }
          }
        },
        "../session/sessionApi": {
          requestFirebaseAccountActionChallenge: async () => ({ challengeId: "fake-challenge" }),
          verifyFirebaseAccountAction: async () => {
            verifyCount += 1
            return { confirmationToken: `fake-proof-${verifyCount}`, expiresAt: new Date(Date.now() + 600_000).toISOString() }
          },
          confirmPhoneChange: async (_url: string, _token: string, _current: string, next: string) => {
            calls.confirm += 1
            calls.proofsSent.push(next)
            const outcome = confirmOutcomes.shift() ?? "ok"
            if (outcome !== "ok") throw outcome
          }
        },
        "../session/settingsActionErrorCopy": {
          getSettingsActionErrorMessageForDisplay: (_key: string, error: Error) => error.message,
          getSettingsVerificationErrorToastForDisplay: (_key: string, error: Error) => ({ title: "verify", body: error.message })
        }
      }
    })
  let api: any
  runtime.render(() => (api = mod.usePhoneChange({
    sessionActor: actor,
    copy,
    locale: "en",
    onResetSession: async () => { calls.resets += 1 }
  })))
  const hook = () => api
  async function startFlow() {
    hook().handlePhoneChangePrompt()
    alertButtons[1].onPress?.()
    await tick()
    hook().changePhoneChangeCode("111111")
    await hook().verifyCurrentPhoneChangeCode()
    hook().changeNewPhoneNumber(NEW_PHONE_LOCAL)
    await hook().requestPhoneChangeNewCode()
    hook().changePhoneChangeCode("222222")
  }
  async function restartFlow() {
    hook().resetPhoneChangeFlow()
    hook().handlePhoneChangePrompt()
    alertButtons[1].onPress?.()
    await tick()
  }
  return { calls, hook, startFlow, restartFlow, firebasePhone: () => firebasePhone }
}

test("a transient failure while finishing keeps the new-phone proof and the retry reaches the API", async () => {
  const f = mountPhoneChange([serverError(503, "server_unavailable"), "ok"])
  await f.startFlow()

  await f.hook().verifyNewPhoneChangeCode()
  await f.hook().verifyNewPhoneChangeCode()

  assert.equal(f.calls.confirm, 2)
  assert.deepEqual(f.calls.proofsSent, ["fake-proof-2", "fake-proof-2"])
  assert.equal(f.calls.firebaseConfirms, 2, "the new-phone code is confirmed once, not again on retry")
  assert.equal(f.calls.resets, 1)
})

test("a lost success response is recovered when the retry finds the old session already ended", async () => {
  const f = mountPhoneChange([timeoutError(), serverError(401, "session_invalid")])
  await f.startFlow()

  await f.hook().verifyNewPhoneChangeCode()
  await f.hook().verifyNewPhoneChangeCode()

  assert.equal(f.calls.confirm, 2)
  assert.equal(f.calls.resets, 1, "the finished change signs out like a normal success")
  assert.ok(f.calls.toasts.at(-1)?.startsWith("success:"))
})

test("a phone conflict ends the attempt and a restart still verifies the original phone", async () => {
  const f = mountPhoneChange([serverError(409, "conflict")])
  await f.startFlow()

  await f.hook().verifyNewPhoneChangeCode()
  const stepAfterConflict = f.hook().phoneChangeStep
  await f.restartFlow()

  assert.equal(f.calls.resets, 0)
  assert.equal(stepAfterConflict, "new_number")
  assert.notEqual(f.firebasePhone(), OLD_PHONE, "Firebase is on the new phone after its code was confirmed")
  assert.equal(f.calls.codeRequests.at(-1), OLD_PHONE)
})

test("an expired re-authentication drops the proof instead of retrying it", async () => {
  const f = mountPhoneChange([serverError(403, "request_rejected"), "ok"])
  await f.startFlow()

  await f.hook().verifyNewPhoneChangeCode()
  await f.hook().verifyNewPhoneChangeCode()

  assert.equal(f.calls.confirm, 1)
  assert.equal(f.calls.resets, 0)
  assert.equal(f.hook().phoneChangeVisible, false)
  await f.restartFlow()
  assert.equal(f.calls.codeRequests.at(-1), OLD_PHONE)
})
