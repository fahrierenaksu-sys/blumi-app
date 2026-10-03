import assert from "node:assert/strict"
import test from "node:test"
import type { AppLocale } from "../session/appLocale"
import type { SessionActor } from "../session/sessionModel"
import type { SettingsCopy } from "./settingsCopy"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type { useHiddenPeople as UseHiddenPeople } from "./useHiddenPeople"

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

const actor = (userId: string) => ({
  session: { mode: "production", sessionToken: `${userId}-token` },
  profile: { userId }
}) as unknown as SessionActor

function mount(options: { whenSettled?: (task: () => void) => () => void } = {}) {
  const runtime = createFakeReactRuntime()
  const hydrations: { userId: string; request: ReturnType<typeof deferred> }[] = []
  const toasts: { body?: string }[] = []
  const confirmations: (() => void)[] = []
  const unblocks: ReturnType<typeof deferred>[] = []
  let localUnblocks = 0
  const { useHiddenPeople } = loadSourceWithFakeReact<{ useHiddenPeople: typeof UseHiddenPeople }>(
    "features/settings/useHiddenPeople.ts",
    runtime,
    {
      modules: {
        "react-native": { Alert: { alert: (_title: string, _body: string, buttons: { onPress?: () => void }[]) => {
          confirmations.push(buttons.at(-1)!.onPress!)
        } } },
        "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
        "../../ui/toast": { showToast: (toast: { body?: string }) => { toasts.push(toast) } },
        "../safety/blockStore": {
          hydrateBlockedUsersFromServer: (userId: string) => {
            const request = deferred()
            hydrations.push({ userId, request })
            return request.promise
          }
        },
        "../safety/safetyApi": { unblockSafetyUser: () => {
          const request = deferred()
          unblocks.push(request)
          return request.promise
        } },
        "../session/settingsActionErrorCopy": {
          getSettingsActionErrorMessageForDisplay: (_kind: string, _error: unknown, locale: AppLocale) => `failed:${locale}`
        }
      }
    }
  )
  let props = { sessionActor: actor("owner-a"), locale: "en" as AppLocale }
  const copy = {} as SettingsCopy
  const unblockUser = () => { localUnblocks += 1 }
  const render = (next: Partial<typeof props> = {}) => {
    props = { ...props, ...next }
    return runtime.render(() => useHiddenPeople({ ...props, copy, unblockUser, whenSettled: options.whenSettled }))
  }
  return { render, hydrations, toasts, confirmations, unblocks, localUnblocks: () => localUnblocks, unmount: () => runtime.unmount() }
}

test("hidden people refresh once per session identity; a profile replacement or locale change does not refetch", () => {
  const f = mount()
  f.render()
  f.render({ locale: "tr" })
  f.render({ sessionActor: actor("owner-a") })
  f.render()
  assert.deepEqual(f.hydrations.map(({ userId }) => userId), ["owner-a"])
  f.render({ sessionActor: actor("owner-b") })
  assert.deepEqual(f.hydrations.map(({ userId }) => userId), ["owner-a", "owner-b"])
})

test("token and mode changes invalidate hidden-people refreshes", () => {
  const f = mount()
  f.render()
  const next = actor("owner-a")
  next.session.sessionToken = "fixture-refreshed"
  f.render({ sessionActor: next })
  assert.equal(f.hydrations.length, 2)
  f.render({ sessionActor: { ...next, session: { ...next.session, mode: "demo" } } })
  assert.equal(f.hydrations.length, 2)
})

test("abandoned hidden-list failures do not show a toast in another session or after exit", async () => {
  const f = mount()
  f.render()
  f.render({ sessionActor: actor("owner-b") })
  f.hydrations[0].request.reject(new Error("offline"))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(f.toasts.length, 0)
  f.unmount()
  f.hydrations[1].request.reject(new Error("offline"))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(f.toasts.length, 0)
})

test("an old confirmation or unblock response cannot mutate another session", async () => {
  const f = mount()
  const handle = f.render()
  handle("fixture-hidden")
  f.render({ sessionActor: actor("owner-b") })
  f.confirmations[0]()
  assert.equal(f.unblocks.length, 0)
  const nextHandle = f.render()
  nextHandle("fixture-hidden")
  f.confirmations[1]()
  assert.equal(f.unblocks.length, 1)
  f.render({ sessionActor: actor("owner-c") })
  f.unblocks[0].resolve()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(f.localUnblocks(), 0)
  assert.equal(f.toasts.length, 0)
  assert.equal(f.hydrations.length, 3)
})

test("a current unblock confirms locally only after the server succeeds; failure keeps the list", async () => {
  const f = mount()
  const handle = f.render()
  handle("fixture-hidden")
  f.confirmations[0]()
  assert.equal(f.localUnblocks(), 0)
  f.unblocks[0].resolve()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(f.localUnblocks(), 1)
  assert.equal(f.hydrations.length, 2)
  assert.equal(f.toasts.length, 1)
  handle("fixture-hidden")
  f.confirmations[1]()
  f.unblocks[1].reject(new Error("offline"))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(f.localUnblocks(), 1)
  assert.equal(f.toasts.length, 2)
})

test("a refresh failure is reported in the locale shown when it fails", async () => {
  const f = mount()
  f.render({ locale: "en" })
  f.render({ locale: "tr" })
  f.hydrations[0].request.reject(new Error("offline"))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(f.toasts.map(({ body }) => body), ["failed:tr"])
})

// Settings opens by a push: its server refresh waits for the push to settle,
// so the page never re-renders mid-slide.
function createGate() {
  let settled = false
  const queue = new Set<() => void>()
  return {
    whenSettled: (task: () => void) => {
      if (settled) {
        task()
        return () => undefined
      }
      queue.add(task)
      return () => { queue.delete(task) }
    },
    settle: () => {
      settled = true
      for (const task of [...queue]) task()
      queue.clear()
    }
  }
}

test("the hidden-people refresh starts only after the push settles", () => {
  const gate = createGate()
  const f = mount({ whenSettled: gate.whenSettled })
  f.render()
  assert.equal(f.hydrations.length, 0)
  gate.settle()
  assert.deepEqual(f.hydrations.map(({ userId }) => userId), ["owner-a"])
})

test("leaving Settings before the push settles never starts the refresh", () => {
  const gate = createGate()
  const f = mount({ whenSettled: gate.whenSettled })
  f.render()
  f.unmount()
  gate.settle()
  assert.equal(f.hydrations.length, 0)
})
