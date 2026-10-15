import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import * as apiRequestError from "../network/apiRequestError"
import * as sensitiveReauthGate from "../session/sensitiveReauthGate"
import { createPendingPhoneChangeSessionWatcher, createPendingPhoneChangeStore } from "./pendingPhoneChangeStore"

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

const mountedHolders: Array<{ release: (() => void) | null }> = []

// ─── Boundaries shared by every re-authenticating hook ──────

/** Firebase: a confirmed code signs Firebase in as that phone. */
function fakeFirebase(world: FakeWorld, calls: { firebaseConfirms: number; codeRequests: string[] }) {
  return {
    confirmFirebasePhoneCode: async (confirmation: { phone: string }) => {
      calls.firebaseConfirms += 1
      world.firebasePhone = confirmation.phone
      return "fake-id-token"
    },
    getFirebaseCurrentPhoneNumber: () => world.firebasePhone,
    getFirebaseCurrentIdToken: async () => "fake-current-id-token",
    requestFirebasePhoneCode: async (phone: string) => {
      calls.codeRequests.push(phone)
      return { phone }
    }
  }
}

function fakePendingPhoneChange(world: FakeWorld) {
  return { pendingPhoneChange: createPendingPhoneChangeStore(fakeSecureStore(world)) }
}

function fakeSecureStore(world: FakeWorld) {
  return {
    getItem: async (key: string) => world.storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { world.storage.set(key, value) },
    removeItem: async (key: string) => { world.storage.delete(key) }
  }
}

/**
 * The server's challenge. Like the server, it names the account's phone only
 * back to a client that sent it (it never reveals it to a token alone); an
 * older server names nothing.
 */
function fakeChallenge(world: FakeWorld) {
  return async (_url: string, _token: string, input: { purpose: string; targetPhoneNumber?: string }) => {
    const challenge = { challengeId: "fake-challenge", expiresAt: new Date(Date.now() + 600_000).toISOString() }
    if (world.server === "older" || input.purpose === "phone_change_new") return challenge
    return input.targetPhoneNumber === world.accountPhone
      ? { ...challenge, targetPhoneNumber: world.accountPhone }
      : { ...challenge, targetPhoneNumberWithheld: true }
  }
}

/** The saved original outlives its 24 h TTL (the record stays on the device). */
function expireSavedOriginal(world: FakeWorld): void {
  const [key, raw] = [...world.storage.entries()][0]
  world.storage.set(key, JSON.stringify({ ...JSON.parse(raw), expiresAtMs: Date.now() - 1 }))
}

/** Like the server: a re-authentication proof must come from the account's own phone. */
function verifyAccountPhone(world: FakeWorld, purpose: string): void {
  if (purpose !== "phone_change_new" && world.firebasePhone !== world.accountPhone) {
    throw new Error("fake verified phone does not match")
  }
}

/**
 * What outlives one mount of the hook: Firebase's signed-in phone, the
 * server's account phone and session, and the device's secure storage. A new
 * mount over the same world is an app restart.
 */
interface FakeWorld {
  firebasePhone: string
  accountPhone: string
  sessionValid: boolean
  storage: Map<string, string>
  proofTtlMs: number
  revokes: number
  /** "confirms": names the account's phone to a client that sent it; "older": names none. */
  server: "confirms" | "older"
}

function createWorld(): FakeWorld {
  return { firebasePhone: OLD_PHONE, accountPhone: OLD_PHONE, sessionValid: true, storage: new Map(), proofTtlMs: 600_000, revokes: 0, server: "confirms" }
}

/** The change reached the server, but the client sees `error` instead of the answer. */
type ConfirmOutcome = Error | "ok" | { landedThen: Error }

function mountPhoneChange(confirmOutcomes: ConfirmOutcome[], world: FakeWorld = createWorld()) {
  // Each test starts with no re-auth hold left open by an earlier test.
  for (const holder of mountedHolders.splice(0)) holder.release?.()
  const runtime = createFakeReactRuntime()
  let alertButtons: Array<{ onPress?: () => void }> = []
  const calls = {
    confirm: 0,
    firebaseConfirms: 0,
    resets: 0,
    codeRequests: [] as string[],
    toasts: [] as string[],
    proofsSent: [] as string[],
    events: [] as string[]
  }
  const reauthHolder: { release: (() => void) | null } = { release: null }
  mountedHolders.push(reauthHolder)
  let verifyCount = 0
  const mod = loadSourceWithFakeReact<{ usePhoneChange: (input: unknown) => any }>(
    "features/settings/usePhoneChange.ts", runtime, {
      real: ["./settingsPhoneChangeModel", "../session/registerFlowModel", "./accountReauthPhone"],
      modules: {
        "react-native": { Alert: { alert: (_t: string, _b: string, buttons: typeof alertButtons) => { alertButtons = buttons } } },
        "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
        "../../ui/toast": { showToast: (toast: { type: string; body?: string }) => calls.toasts.push(`${toast.type}:${toast.body}`) },
        "../network/apiRequestError": apiRequestError,
        // The real gate behind a hook-free stand-in for the React hook.
        "./useSensitiveReauthHold": {
          useSensitiveReauthHold: () => {
            const holder = reauthHolder
            return {
              hold: () => { holder.release?.(); holder.release = sensitiveReauthGate.holdSensitiveReauth() },
              release: () => { holder.release?.(); holder.release = null }
            }
          }
        },
        "../session/firebasePhoneAuth": fakeFirebase(world, calls),
        "./pendingPhoneChange": fakePendingPhoneChange(world),
        "../session/sessionApi": {
          fetchProductionAccountSnapshot: async () => {
            if (!world.sessionValid) throw serverError(401, "session_invalid")
            return {}
          },
          // Sign-in only: the server finds the account that owns Firebase's phone.
          completeFirebaseAccount: async (_url: string, input: { authIntent: string }) => {
            assert.equal(input.authIntent, "sign-in", "the probe must never create an account")
            if (world.firebasePhone !== world.accountPhone) throw new Error("fake no account")
            return { session: { userId: actor.session.userId, sessionToken: "fake-probe-token" } }
          },
          revokeProductionSession: async () => { world.revokes += 1 },
          requestFirebaseAccountActionChallenge: fakeChallenge(world),
          verifyFirebaseAccountAction: async (_url: string, _token: string, input: { purpose: string }) => {
            verifyAccountPhone(world, input.purpose)
            verifyCount += 1
            return { confirmationToken: `fake-proof-${verifyCount}`, expiresAt: new Date(Date.now() + world.proofTtlMs).toISOString() }
          },
          confirmPhoneChange: async (_url: string, _token: string, _current: string, next: string) => {
            calls.confirm += 1
            calls.events.push("confirm")
            calls.proofsSent.push(next)
            const outcome = confirmOutcomes.shift() ?? "ok"
            if (outcome instanceof Error) throw outcome
            // Landed: the account takes the new phone and every session ends.
            world.accountPhone = world.firebasePhone
            world.sessionValid = false
            if (outcome !== "ok") throw outcome.landedThen
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
    bindSessionReset: () => {
      calls.events.push("bind")
      return async () => { calls.resets += 1 }
    }
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
  return { calls, hook, startFlow, restartFlow, world, firebasePhone: () => world.firebasePhone }
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
  assert.deepEqual(f.calls.events, ["bind", "confirm", "bind", "confirm"], "each final request binds the reset to its session first")
})

test("a lost success response is recovered when the retry finds the old session already ended", async () => {
  const f = mountPhoneChange([{ landedThen: timeoutError() }, serverError(401, "session_invalid")])
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

test("token refresh is held from the first SMS challenge until the new phone is verified", async () => {
  const f = mountPhoneChange([serverError(503, "server_unavailable"), "ok"])
  assert.equal(sensitiveReauthGate.isSensitiveReauthOpen(), false)

  await f.startFlow()
  const openWhileCodePending = sensitiveReauthGate.isSensitiveReauthOpen()
  await f.hook().verifyNewPhoneChangeCode()
  const openAfterVerified = sensitiveReauthGate.isSensitiveReauthOpen()
  await f.hook().verifyNewPhoneChangeCode()

  assert.equal(openWhileCodePending, true)
  assert.equal(openAfterVerified, false, "the proof is no longer bound to the token")
  assert.equal(sensitiveReauthGate.isSensitiveReauthOpen(), false)
})

test("a restart after the app was closed mid-change texts the account's original phone, not Firebase's", async () => {
  const world = createWorld()
  const firstLaunch = mountPhoneChange([serverError(503, "server_unavailable")], world)
  await firstLaunch.startFlow()
  await firstLaunch.hook().verifyNewPhoneChangeCode()
  assert.notEqual(world.firebasePhone, OLD_PHONE, "Firebase is on the new phone while Blumi kept the old one")

  const nextLaunch = mountPhoneChange([], world)
  await nextLaunch.restartFlow()

  assert.deepEqual(nextLaunch.calls.codeRequests, [OLD_PHONE])
})

test("a finished change forgets the pending original phone", async () => {
  const world = createWorld()
  const f = mountPhoneChange(["ok"], world)
  await f.startFlow()

  await f.hook().verifyNewPhoneChangeCode()

  assert.equal(f.calls.resets, 1)
  assert.equal(world.storage.size, 0)
})

test("a 401 from a session revoked for another reason is not reported as a phone change", async () => {
  const world = createWorld()
  const f = mountPhoneChange([serverError(503, "server_unavailable"), serverError(401, "session_invalid")], world)
  await f.startFlow()
  await f.hook().verifyNewPhoneChangeCode()
  world.sessionValid = false // signed out elsewhere; the change never landed

  await f.hook().verifyNewPhoneChangeCode()

  assert.equal(world.accountPhone, OLD_PHONE)
  assert.equal(f.calls.toasts.some((toast) => toast.startsWith("success:")), false)
  assert.equal(f.calls.toasts.at(-1), "warning:phoneChangeUnconfirmed")
  assert.equal(f.calls.resets, 1, "the ended session still signs out")
})

test("an expired proof with an open outcome restarts the flow instead of dead-ending", async () => {
  const world = createWorld()
  world.proofTtlMs = 1
  const f = mountPhoneChange([serverError(503, "server_unavailable")], world)
  await f.startFlow()
  await f.hook().verifyNewPhoneChangeCode()
  await tick()

  await f.hook().verifyNewPhoneChangeCode()

  assert.equal(f.calls.confirm, 1, "an expired proof is never sent")
  assert.equal(f.calls.toasts.at(-1), "warning:phoneChangeExpired")
  assert.equal(f.hook().phoneChangeVisible, false)
  assert.equal(f.calls.resets, 0)
  await f.restartFlow()
  assert.equal(f.calls.codeRequests.at(-1), OLD_PHONE)
})

test("an expired proof whose lost request had landed finishes as a success", async () => {
  const world = createWorld()
  world.proofTtlMs = 1
  const f = mountPhoneChange([{ landedThen: timeoutError() }], world)
  await f.startFlow()
  await f.hook().verifyNewPhoneChangeCode()
  await tick()

  await f.hook().verifyNewPhoneChangeCode()

  assert.equal(f.calls.confirm, 1)
  assert.equal(f.calls.resets, 1)
  assert.ok(f.calls.toasts.at(-1)?.startsWith("success:"))
  assert.equal(world.revokes, 1, "the probe's sign-in session is revoked")
  assert.equal(world.storage.size, 0)
})

// ─── The server's account phone decides every re-authentication ──────

const NEW_PHONE = "+905550000002"

/** Mounts the real deletion or export hook over the same fake world. */
function mountAccountAction(world: FakeWorld) {
  const runtime = createFakeReactRuntime()
  const calls = { firebaseConfirms: 0, codeRequests: [] as string[], toasts: [] as string[], deleted: 0, exported: 0, resets: 0 }
  let alertButtons: { onPress?: () => void }[] = []
  const modules = {
    "react-native": { Alert: { alert: (_t: string, _b: string, buttons: typeof alertButtons) => { alertButtons = buttons } } },
    "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
    "../../ui/toast": { showToast: (toast: { type: string; body?: string }) => calls.toasts.push(`${toast.type}:${toast.body}`) },
    "./useSensitiveReauthHold": { useSensitiveReauthHold: () => ({ hold: () => undefined, release: () => undefined }) },
    "../session/firebasePhoneAuth": fakeFirebase(world, calls),
    "./pendingPhoneChange": fakePendingPhoneChange(world),
    "../session/accountDataExport": { shareAccountDataExportFile: async () => { calls.exported += 1 } },
    "../session/sessionApi": {
      requestFirebaseAccountActionChallenge: fakeChallenge(world),
      verifyFirebaseAccountAction: async (_url: string, _token: string, input: { purpose: string }) => {
        verifyAccountPhone(world, input.purpose)
        return { confirmationToken: "fake-action-proof", expiresAt: new Date(Date.now() + 600_000).toISOString() }
      },
      deleteProductionAccount: async () => { calls.deleted += 1; return "deleted" },
      downloadAccountDataExport: async () => ({ dispose: async () => undefined })
    },
    "../session/settingsActionErrorCopy": {
      getSettingsActionErrorMessageForDisplay: (_key: string, error: Error) => error.message,
      getSettingsVerificationErrorToastForDisplay: (_key: string, error: Error) => ({ title: "verify", body: error.message })
    }
  }
  const options = { real: ["./settingsPresentationModel", "./accountReauthPhone"], modules }
  const deletionModule = loadSourceWithFakeReact<{ useAccountDeletion: (input: unknown) => any }>(
    "features/settings/useAccountDeletion.ts", runtime, options)
  const exportModule = loadSourceWithFakeReact<{ useAccountDataExport: (input: unknown) => any }>(
    "features/settings/useAccountDataExport.ts", runtime, options)
  let deletion: any
  let dataExport: any
  runtime.render(() => {
    deletion = deletionModule.useAccountDeletion({
      sessionActor: actor, copy, locale: "en", bindSessionReset: () => async () => { calls.resets += 1 }
    })
    dataExport = exportModule.useAccountDataExport({ sessionActor: actor, copy, locale: "en" })
  })
  return {
    calls,
    async deleteAccount() {
      deletion.handleDeleteAccountPrompt()
      alertButtons[1].onPress?.()
      await tick()
      deletion.changeDeletionCode("333333")
      await deletion.verifyDeletionCode()
      alertButtons[1]?.onPress?.() // "Delete permanently"
      await tick()
    },
    async exportData() {
      dataExport.handleDataExportPrompt()
      alertButtons[1].onPress?.()
      await tick()
      dataExport.changeExportCode("444444")
      await dataExport.verifyExportCode()
    }
  }
}

/** The first launch: the change lands on the server, but its answer is lost. */
async function landWithLostAnswer(world: FakeWorld) {
  const firstLaunch = mountPhoneChange([{ landedThen: timeoutError() }], world)
  await firstLaunch.startFlow()
  await firstLaunch.hook().verifyNewPhoneChangeCode()
  assert.equal(world.accountPhone, world.firebasePhone, "the change landed")
  assert.equal(world.storage.size, 1, "the saved original phone is now stale")
}

test("after a landed change whose answer was lost, the next change texts the new phone, not the old one", async () => {
  const world = createWorld()
  await landWithLostAnswer(world)
  world.sessionValid = true // signed in again with the new phone (same account)

  const nextLaunch = mountPhoneChange([], world)
  await nextLaunch.restartFlow()

  assert.deepEqual(nextLaunch.calls.codeRequests, [world.accountPhone])
  assert.notEqual(world.accountPhone, OLD_PHONE)
  assert.equal(world.storage.size, 0, "the stale original is dropped")
})

test("after the saved original expires, a restart still texts the account's phone, never a dead end", async () => {
  const world = createWorld()
  const firstLaunch = mountPhoneChange([serverError(503, "server_unavailable")], world)
  await firstLaunch.startFlow()
  await firstLaunch.hook().verifyNewPhoneChangeCode()
  expireSavedOriginal(world)
  assert.notEqual(world.firebasePhone, world.accountPhone)

  const nextLaunch = mountPhoneChange([], world)
  await nextLaunch.restartFlow()
  nextLaunch.hook().changePhoneChangeCode("111111")
  await nextLaunch.hook().verifyCurrentPhoneChangeCode()

  assert.deepEqual(nextLaunch.calls.codeRequests, [OLD_PHONE])
  assert.equal(world.firebasePhone, OLD_PHONE, "Firebase is back on the account's phone")
  assert.equal(nextLaunch.hook().phoneChangeStep, "new_number", "the flow moves on")
})

test("an older server that names no phone still restarts from the saved original", async () => {
  const world = createWorld()
  world.server = "older"
  const firstLaunch = mountPhoneChange([serverError(503, "server_unavailable")], world)
  await firstLaunch.startFlow()
  await firstLaunch.hook().verifyNewPhoneChangeCode()

  const nextLaunch = mountPhoneChange([], world)
  await nextLaunch.restartFlow()

  assert.deepEqual(nextLaunch.calls.codeRequests, [OLD_PHONE])
})

test("account deletion and data export text the account's phone while Firebase holds an unconfirmed new one", async () => {
  const world = createWorld()
  const phoneChange = mountPhoneChange([serverError(503, "server_unavailable")], world)
  await phoneChange.startFlow()
  await phoneChange.hook().verifyNewPhoneChangeCode()
  expireSavedOriginal(world) // even after the saved original expired
  assert.notEqual(world.firebasePhone, world.accountPhone)

  const exportFlow = mountAccountAction(world)
  await exportFlow.exportData()
  world.firebasePhone = NEW_PHONE // split again before deleting
  const deletionFlow = mountAccountAction(world)
  await deletionFlow.deleteAccount()

  assert.deepEqual(exportFlow.calls.codeRequests, [OLD_PHONE])
  assert.equal(exportFlow.calls.exported, 1)
  assert.deepEqual(deletionFlow.calls.codeRequests, [OLD_PHONE])
  assert.equal(deletionFlow.calls.deleted, 1, "deletion is never blocked")
  assert.equal(deletionFlow.calls.resets, 1)
})

test("with no phone on the device that the server confirms, nothing is texted and signing in again unblocks deletion", async () => {
  const world = createWorld()
  const phoneChange = mountPhoneChange([serverError(503, "server_unavailable")], world)
  await phoneChange.startFlow()
  await phoneChange.hook().verifyNewPhoneChangeCode()
  world.storage.clear() // the saved original is gone (secure storage failed)
  assert.notEqual(world.firebasePhone, world.accountPhone)

  const stale = mountAccountAction(world)
  await stale.deleteAccount()
  assert.deepEqual(stale.calls.codeRequests, [], "no code goes to a phone the server did not confirm")
  assert.equal(stale.calls.deleted, 0)
  assert.ok(stale.calls.toasts.includes("warning:Sign in again to verify your phone."))

  world.firebasePhone = world.accountPhone // signed in again with the account's phone
  const signedInAgain = mountAccountAction(world)
  await signedInAgain.deleteAccount()
  assert.deepEqual(signedInAgain.calls.codeRequests, [OLD_PHONE])
  assert.equal(signedInAgain.calls.deleted, 1, "deletion is never blocked")
})

test("end to end: change lands but its answer is lost, app killed, restart, the user deletes the account", async () => {
  const world = createWorld()
  await landWithLostAnswer(world)

  // App killed. On restart the stored session is refused (the change ended
  // every session) and the user signs in again with the new phone.
  const sessionWatcher = createPendingPhoneChangeSessionWatcher(createPendingPhoneChangeStore(fakeSecureStore(world)).clear)
  sessionWatcher.observe(null, false)
  sessionWatcher.observe(null, true)
  world.sessionValid = true
  sessionWatcher.observe(actor.session.userId, true)
  await tick()
  assert.equal(world.storage.size, 0, "a new sign-in drops the saved original")

  // The user first opens "Change phone", then leaves it and deletes instead.
  const restartedChange = mountPhoneChange([], world)
  await restartedChange.restartFlow()
  restartedChange.hook().resetPhoneChangeFlow()
  const restarted = mountAccountAction(world)
  await restarted.deleteAccount()

  assert.deepEqual(restartedChange.calls.codeRequests, [world.accountPhone], "never the old phone")
  assert.deepEqual(restarted.calls.codeRequests, [world.accountPhone])
  assert.equal(restarted.calls.deleted, 1)
  assert.equal(restarted.calls.resets, 1)
  assert.equal(restarted.calls.toasts.some((toast) => toast.startsWith("warning:")), false)
})
