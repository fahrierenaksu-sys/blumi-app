import assert from "node:assert/strict"
import test from "node:test"
import type { SessionActor } from "../session/sessionModel"
import type { NotificationPreferences } from "../notifications/notificationApi"
import type { useNotificationSettings as UseNotificationSettings } from "./useNotificationSettings"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import { createPushSettleGate } from "../../navigation/useAfterPushTransition"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

const actor = (owner = "fixture-owner", sessionToken = "fixture-session", mode = "production") => ({
  profile: { userId: owner }, session: { sessionToken, mode }
}) as unknown as SessionActor
const preferences = (enabled = true): NotificationPreferences => ({
  likesEnabled: enabled, messagesEnabled: true, matchesEnabled: true,
  discoveryWatchEnabled: true, quietHours: null, quietHoursUtcOffsetMinutes: 0, maxPushesPerHour: 3
})
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

function mount(whenSettled?: (task: () => void) => () => void) {
  const runtime = createFakeReactRuntime()
  const loads: { request: ReturnType<typeof deferred<NotificationPreferences>>; signal: AbortSignal }[] = []
  const saves: { request: ReturnType<typeof deferred<NotificationPreferences>>; signal: AbortSignal }[] = []
  const toasts: unknown[] = []
  const permissions = deferred<void>()
  let permissionRequests = 0
  let settingsOpens = 0
  const { useNotificationSettings } = loadSourceWithFakeReact<{ useNotificationSettings: typeof UseNotificationSettings }>(
    "features/settings/useNotificationSettings.ts", runtime, {
      modules: {
        "react-native": { Linking: { openSettings: async () => { settingsOpens += 1 } } },
        "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
        "../../ui/toast": { showToast: (toast: unknown) => { toasts.push(toast) } },
        "../notifications/notificationPreferencesModel": {
          updateNotificationPreferenceToggle: (current: NotificationPreferences, key: string, enabled: boolean) => ({ ...current, [key]: enabled })
        },
        "../notifications/notificationApi": {
          getNotificationPreferences: (_base: string, _token: string, _fetcher: unknown, signal: AbortSignal) => {
            const request = deferred<NotificationPreferences>()
            loads.push({ request, signal })
            return request.promise
          },
          updateNotificationPreferences: (_base: string, _token: string, _input: unknown, _fetcher: unknown, signal: AbortSignal) => {
            const request = deferred<NotificationPreferences>()
            saves.push({ request, signal })
            return request.promise
          }
        }
      }
    }
  )
  let sessionActor = actor()
  let pushPermissionStatus = "granted" as "granted" | "denied"
  const onRequestPushPermission = () => { permissionRequests += 1; return permissions.promise }
  const render = (next = sessionActor, permission = pushPermissionStatus) => {
    sessionActor = next
    pushPermissionStatus = permission
    return runtime.render(() => useNotificationSettings({ sessionActor, pushPermissionStatus, onRequestPushPermission, whenSettled }))
  }
  return { render, loads, saves, toasts, permissions, unmount: () => runtime.unmount(),
    value: () => runtime.output as ReturnType<typeof UseNotificationSettings>,
    renderCount: () => runtime.renderCount,
    permissionRequests: () => permissionRequests, settingsOpens: () => settingsOpens }
}

test("profile replacement keeps preferences; session identity changes discard and reload them", async () => {
  const f = mount()
  f.render()
  f.loads[0].request.resolve(preferences())
  await flush()
  f.render(actor())
  assert.equal(f.value().notificationPreferencesStatus, "ready")
  assert.equal(f.loads.length, 1)
  for (const next of [actor("fixture-owner", "fixture-refreshed"), actor("fixture-other", "fixture-refreshed")]) {
    f.render(next)
    assert.equal(f.value().notificationPreferences, null)
    assert.equal(f.value().notificationPreferencesStatus, "loading")
    f.loads.at(-1)!.request.resolve(preferences(false))
    await flush()
  }
  f.render(actor("fixture-other", "fixture-refreshed", "demo"))
  assert.equal(f.value().notificationPreferences, null)
  assert.equal(f.value().notificationPreferencesStatus, "idle")
})

test("push gating cancels abandoned entry; old HTTP success and failure cannot repaint a newer session", async () => {
  const gate = createPushSettleGate()
  const abandoned = mount(gate.whenSettled)
  abandoned.render()
  assert.equal(abandoned.loads.length, 0)
  abandoned.unmount()
  gate.settle()
  assert.equal(abandoned.loads.length, 0)
  const f = mount()
  f.render()
  f.render(actor("fixture-other"))
  assert.equal(f.loads[0].signal.aborted, true)
  f.loads[0].request.resolve(preferences())
  await flush()
  assert.equal(f.value().notificationPreferences, null)
  f.loads[1].request.resolve(preferences(false))
  await flush()
  const oldRefresh = f.value().loadNotificationPreferences()
  f.render(actor("fixture-third"))
  f.loads[2].request.reject(new Error("offline"))
  await oldRefresh
  assert.equal(f.value().notificationPreferencesStatus, "loading")
  assert.equal(f.value().notificationPreferences, null)
})

test("failed refresh can retry and a late pre-toggle GET cannot overwrite an optimistic save", async () => {
  const f = mount()
  f.render()
  f.loads[0].request.reject(new Error("offline"))
  await flush()
  assert.equal(f.value().notificationPreferencesStatus, "error")
  const retry = f.value().loadNotificationPreferences()
  f.loads[1].request.resolve(preferences())
  await retry
  assert.equal(f.value().notificationPreferencesStatus, "ready")
  const refresh = f.value().loadNotificationPreferences()
  f.value().handleNotificationToggle("likesEnabled", false)
  f.value().handleNotificationToggle("likesEnabled", true)
  assert.equal(f.saves.length, 1)
  assert.equal(f.loads[2].signal.aborted, true)
  assert.equal(f.value().notificationPreferences?.likesEnabled, false)
  f.loads[2].request.resolve(preferences())
  await refresh
  assert.equal(f.value().notificationPreferences?.likesEnabled, false)
  f.saves[0].request.reject(new Error("offline"))
  await flush()
  assert.equal(f.value().notificationPreferences?.likesEnabled, true)
  assert.equal(f.value().isSavingNotificationPreferences, false)
  assert.equal(f.toasts.length, 1)
  f.value().handleNotificationToggle("likesEnabled", false)
  f.saves[1].request.resolve(preferences(false))
  await flush()
  assert.equal(f.value().notificationPreferences?.likesEnabled, false)
})

test("abandoned mutations cannot change another session or emit stale warnings", async () => {
  const f = mount()
  f.render()
  f.loads[0].request.resolve(preferences())
  await flush()
  f.value().handleNotificationToggle("likesEnabled", false)
  f.render(actor("fixture-other"))
  assert.equal(f.saves[0].signal.aborted, true)
  f.saves[0].request.reject(new Error("offline"))
  await flush()
  assert.equal(f.value().notificationPreferences, null)
  assert.equal(f.value().isSavingNotificationPreferences, false)
  assert.equal(f.toasts.length, 0)
  const before = f.renderCount()
  f.unmount()
  f.loads[1].request.resolve(preferences())
  await flush()
  assert.equal(f.renderCount(), before)
})

test("permission actions preserve denied settings routing and suppress abandoned completion", async () => {
  const f = mount()
  f.render(actor(), "denied")
  f.value().handleRequestPushPermission()
  assert.equal(f.settingsOpens(), 1)
  assert.equal(f.permissionRequests(), 0)
  f.render(actor(), "granted")
  f.value().handleRequestPushPermission()
  assert.equal(f.permissionRequests(), 1)
  f.unmount()
  f.permissions.resolve()
  await flush()
  assert.equal(f.toasts.length, 0)
})

test("a current permission completion still reports its result", async () => {
  const f = mount()
  f.render()
  f.value().handleRequestPushPermission()
  f.permissions.resolve()
  await flush()
  assert.equal(f.toasts.length, 1)
})
