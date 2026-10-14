import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"

type ExportApi = {
  exportCodeVisible: boolean
  isExportingAccountData: boolean
  changeExportCode: (value: string) => void
  closeExportCode: () => void
  verifyExportCode: () => Promise<void>
  handleDataExportPrompt: () => void
}
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

const copy = new Proxy({}, { get: (_target, key) => String(key) })
const tick = () => new Promise((resolveTick) => setTimeout(resolveTick, 5))

function actorFor(userId: string) {
  return { session: { mode: "production", userId, sessionToken: `session-${userId}` }, profile: { userId } }
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

/** Mounts the real hook with fake network/share boundaries that ignore abort (a late response). */
function mountExport(options: { holdCode?: boolean } = {}) {
  const runtime = createFakeReactRuntime()
  const events: string[] = []
  const signals: AbortSignal[] = []
  const downloads: Deferred<{ dispose: () => Promise<void> }>[] = []
  const codes: Deferred<string>[] = []
  let buttons: { onPress?: () => void }[] = []
  const hook = loadSourceWithFakeReact<{ useAccountDataExport: (input: unknown) => ExportApi }>(
    "features/settings/useAccountDataExport.ts", runtime, {
      modules: {
        "react-native": { Alert: { alert: (_title: string, _body: string, next: typeof buttons) => { buttons = next } } },
        "../../config/env": { MOBILE_HTTP_BASE_URL: "https://api.invalid" },
        "../../ui/toast": { showToast: () => { events.push("toast") } },
        "../session/accountDataExport": { shareAccountDataExportFile: async () => { events.push("share") } },
        "../session/firebasePhoneAuth": {
          confirmFirebasePhoneCode: async () => {
            if (!options.holdCode) return "firebase-id"
            const code = deferred<string>()
            codes.push(code)
            return code.promise
          },
          getFirebaseCurrentPhoneNumber: () => "phone-present",
          requestFirebasePhoneCode: async () => ({})
        },
        "../session/sessionApi": {
          requestFirebaseAccountActionChallenge: async () => ({ challengeId: "challenge" }),
          verifyFirebaseAccountAction: async (...args: unknown[]) => {
            events.push("verify")
            signals.push(args[4] as AbortSignal)
            return { confirmationToken: "confirmation" }
          },
          downloadAccountDataExport: async (...args: unknown[]) => {
            events.push("download")
            signals.push(args[4] as AbortSignal)
            const download = deferred<{ dispose: () => Promise<void> }>()
            downloads.push(download)
            return download.promise
          }
        },
        "../session/settingsActionErrorCopy": { getSettingsActionErrorMessageForDisplay: () => "error" },
        "./settingsPresentationModel": { sanitizeVerificationCode: (value: string) => value }
      }
    })
  let api!: ExportApi
  const render = (userId: string) => runtime.render(() => (api = hook.useAccountDataExport({ sessionActor: actorFor(userId), copy, locale: "en" })))
  render("owner-a")
  const startVerify = async () => {
    api.handleDataExportPrompt()
    buttons[1]?.onPress?.()
    await tick()
    assert.equal(api.exportCodeVisible, true)
    api.changeExportCode("123456")
    void api.verifyExportCode()
    await tick()
  }
  const lateDownload = async () => {
    downloads.at(-1)?.resolve({ dispose: async () => { events.push("dispose") } })
    await tick()
  }
  return { runtime, events, signals, codes, render, startVerify, lateDownload, api: () => api }
}

test("cancel during download aborts, cleans the temp file and never opens the share sheet", async () => {
  const subject = mountExport()
  await subject.startVerify()
  assert.ok(subject.events.includes("download"))
  subject.api().closeExportCode()
  assert.equal(subject.api().exportCodeVisible, false)
  assert.ok(subject.signals.every((signal) => signal.aborted), "Cancel must abort the export requests")
  await subject.lateDownload()
  assert.equal(subject.events.includes("share"), false)
  assert.equal(subject.events.includes("dispose"), true)
  assert.equal(subject.events.includes("toast"), false)
  assert.equal(subject.api().isExportingAccountData, false)
})

test("cancel while the code is being confirmed never reaches the server", async () => {
  const subject = mountExport({ holdCode: true })
  await subject.startVerify()
  subject.api().closeExportCode()
  subject.codes.at(-1)?.resolve("firebase-id")
  await tick()
  assert.equal(subject.events.includes("verify"), false)
  assert.equal(subject.events.includes("share"), false)
})

test("unmount during download never opens the share sheet", async () => {
  const subject = mountExport()
  await subject.startVerify()
  subject.runtime.unmount()
  await subject.lateDownload()
  assert.equal(subject.events.includes("share"), false)
  assert.equal(subject.events.includes("dispose"), true)
})

test("an account change during download never opens the share sheet", async () => {
  const subject = mountExport()
  await subject.startVerify()
  subject.render("owner-b")
  await subject.lateDownload()
  assert.equal(subject.events.includes("share"), false)
  assert.equal(subject.events.includes("dispose"), true)
})

test("after a cancel, a new export still completes and shares once", async () => {
  const subject = mountExport()
  await subject.startVerify()
  subject.api().closeExportCode()
  await subject.lateDownload()
  await subject.startVerify()
  await subject.lateDownload()
  assert.equal(subject.events.filter((event) => event === "share").length, 1)
})
