import assert from "node:assert/strict"
import test from "node:test"
import type { AppLocale } from "../session/appLocale"
import type { SessionActor } from "../session/sessionModel"
import type { SettingsCopy } from "./settingsCopy"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type { useHiddenPeople as UseHiddenPeople } from "./useHiddenPeople"

function deferred() {
  let reject!: (error: Error) => void
  const promise = new Promise<void>((_resolve, fail) => { reject = fail })
  return { promise, reject }
}

const actor = (userId: string) => ({
  session: { mode: "production", sessionToken: `${userId}-token` },
  profile: { userId }
}) as unknown as SessionActor

function mount() {
  const runtime = createFakeReactRuntime()
  const hydrations: { userId: string; request: ReturnType<typeof deferred> }[] = []
  const toasts: { body?: string }[] = []
  const { useHiddenPeople } = loadSourceWithFakeReact<{ useHiddenPeople: typeof UseHiddenPeople }>(
    "features/settings/useHiddenPeople.ts",
    runtime,
    {
      modules: {
        "react-native": { Alert: { alert: () => undefined } },
        "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
        "../../ui/toast": { showToast: (toast: { body?: string }) => { toasts.push(toast) } },
        "../safety/blockStore": {
          hydrateBlockedUsersFromServer: (userId: string) => {
            const request = deferred()
            hydrations.push({ userId, request })
            return request.promise
          }
        },
        "../safety/safetyApi": { unblockSafetyUser: async () => undefined },
        "../session/settingsActionErrorCopy": {
          getSettingsActionErrorMessageForDisplay: (_kind: string, _error: unknown, locale: AppLocale) => `failed:${locale}`
        }
      }
    }
  )
  let props = { sessionActor: actor("owner-a"), locale: "en" as AppLocale }
  const copy = {} as SettingsCopy
  const unblockUser = () => undefined
  const render = (next: Partial<typeof props> = {}) => {
    props = { ...props, ...next }
    return runtime.render(() => useHiddenPeople({ ...props, copy, unblockUser }))
  }
  return { render, hydrations, toasts }
}

test("hidden people refresh once per session actor; a locale change does not refetch", () => {
  const f = mount()
  f.render()
  f.render({ locale: "tr" })
  f.render()
  assert.deepEqual(f.hydrations.map(({ userId }) => userId), ["owner-a"])
  f.render({ sessionActor: actor("owner-b") })
  assert.deepEqual(f.hydrations.map(({ userId }) => userId), ["owner-a", "owner-b"])
})

test("a refresh failure is reported in the locale shown when it fails", async () => {
  const f = mount()
  f.render({ locale: "en" })
  f.render({ locale: "tr" })
  f.hydrations[0].request.reject(new Error("offline"))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(f.toasts.map(({ body }) => body), ["failed:tr"])
})
