import assert from "node:assert/strict"
import test from "node:test"
import type { SessionActor } from "../session/sessionModel"
import type { NotificationPreferences } from "../notifications/notificationApi"
import type { useNotificationSettings as UseNotificationSettings } from "./useNotificationSettings"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import { createPushSettleGate } from "../../navigation/useAfterPushTransition"
import * as settingsCache from "./settingsServerCache"
import type { useReadReceiptsSetting as UseReadReceiptsSetting } from "./useReadReceiptsSetting"

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

function mount(whenSettled?: (task: () => void) => () => void, keepCache = false) {
  if (!keepCache) settingsCache.resetSettingsServerCache()
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
        "./settingsServerCache": settingsCache,
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

test("profile replacement keeps preferences; a session refresh keeps the account's answer while it reloads; another account starts empty", async () => {
  const f = mount()
  f.render()
  f.loads[0].request.resolve(preferences())
  await flush()
  f.render(actor())
  assert.equal(f.value().notificationPreferencesStatus, "ready")
  assert.equal(f.loads.length, 1)
  f.render(actor("fixture-owner", "fixture-refreshed"))
  assert.equal(f.value().notificationPreferences?.likesEnabled, true)
  assert.equal(f.value().notificationPreferencesStatus, "ready")
  f.loads.at(-1)!.request.resolve(preferences(false))
  await flush()
  assert.equal(f.value().notificationPreferences?.likesEnabled, false)
  f.render(actor("fixture-other", "fixture-refreshed"))
  assert.equal(f.value().notificationPreferences, null)
  assert.equal(f.value().notificationPreferencesStatus, "loading")
  f.loads.at(-1)!.request.resolve(preferences(false))
  await flush()
  f.render(actor("fixture-other", "fixture-refreshed", "demo"))
  assert.equal(f.value().notificationPreferences, null)
  assert.equal(f.value().notificationPreferencesStatus, "idle")
})

test("a second visit shows the remembered preferences at once and revalidates in the background", async () => {
  const first = mount()
  first.render()
  first.loads[0].request.resolve(preferences(false))
  await flush()
  first.unmount()
  const second = mount(undefined, true)
  second.render()
  assert.equal(second.value().notificationPreferences?.likesEnabled, false)
  assert.equal(second.value().notificationPreferencesStatus, "ready")
  assert.equal(second.loads.length, 1)
  second.loads[0].request.resolve(preferences(true))
  await flush()
  assert.equal(second.value().notificationPreferences?.likesEnabled, true)
  assert.equal(second.value().notificationPreferencesStatus, "ready")
})

test("a failed background revalidation keeps the remembered preferences instead of an error row", async () => {
  settingsCache.cacheNotificationPreferences("fixture-owner", preferences())
  const f = mount(undefined, true)
  f.render()
  f.loads[0].request.reject(new Error("offline"))
  await flush()
  assert.equal(f.value().notificationPreferencesStatus, "ready")
  assert.notEqual(f.value().notificationPreferences, null)
})

test("another account never sees the remembered preferences, and a sign-out reset empties them", async () => {
  const f = mount()
  f.render()
  f.loads[0].request.resolve(preferences())
  await flush()
  f.unmount()
  const other = mount(undefined, true)
  other.render(actor("fixture-other"))
  assert.equal(other.value().notificationPreferences, null)
  other.loads[0].request.resolve(preferences())
  await flush()
  assert.equal(settingsCache.readCachedNotificationPreferences("fixture-owner"), null)
  other.unmount()
  settingsCache.resetSettingsServerCache()
  const after = mount(undefined, true)
  after.render(actor("fixture-other"))
  assert.equal(after.value().notificationPreferences, null)
})

function mountReadReceipts(keepCache = false) {
  if (!keepCache) settingsCache.resetSettingsServerCache()
  const runtime = createFakeReactRuntime()
  type Answer = { preferences: { readReceiptsEnabled: boolean }; available: boolean }
  const fetches: ReturnType<typeof deferred<Answer>>[] = []
  const { useReadReceiptsSetting } = loadSourceWithFakeReact<{ useReadReceiptsSetting: typeof UseReadReceiptsSetting }>(
    "features/settings/useReadReceiptsSetting.ts", runtime, {
      modules: {
        "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
        "../../ui/toast": { showToast: () => undefined },
        "./settingsServerCache": settingsCache,
        "./chatPreferencesApi": {
          fetchChatPreferences: () => {
            const request = deferred<Answer>()
            fetches.push(request)
            return request.promise
          },
          saveChatPreferences: async () => ({ readReceiptsEnabled: true })
        }
      }
    }
  )
  const render = (sessionActor = actor()) => runtime.render(() => useReadReceiptsSetting({
    sessionActor, capabilityEnabled: true, copy: {} as never
  }))
  return { render, fetches, unmount: () => runtime.unmount(),
    value: () => runtime.output as ReturnType<typeof UseReadReceiptsSetting> }
}

test("the read-receipts row is reserved before the server answers, then shows the answer", async () => {
  const f = mountReadReceipts()
  f.render()
  assert.equal(f.value().visible, true)
  assert.equal(f.value().isPlaceholder, true)
  f.fetches[0].resolve({ preferences: { readReceiptsEnabled: true }, available: true })
  await flush()
  assert.equal(f.value().visible, true)
  assert.equal(f.value().isPlaceholder, false)
  assert.equal(f.value().readReceiptsEnabled, true)
})

test("the read-receipts row disappears when the server says it is unavailable or cannot be reached", async () => {
  const unavailable = mountReadReceipts()
  unavailable.render()
  unavailable.fetches[0].resolve({ preferences: { readReceiptsEnabled: false }, available: false })
  await flush()
  assert.equal(unavailable.value().visible, false)
  const failed = mountReadReceipts()
  failed.render()
  failed.fetches[0].reject(new Error("offline"))
  await flush()
  assert.equal(failed.value().visible, false)
})

test("a second visit shows the remembered read-receipts value at once; another account does not see it", async () => {
  const first = mountReadReceipts()
  first.render()
  first.fetches[0].resolve({ preferences: { readReceiptsEnabled: true }, available: true })
  await flush()
  first.unmount()
  const second = mountReadReceipts(true)
  second.render()
  assert.equal(second.value().isPlaceholder, false)
  assert.equal(second.value().visible, true)
  assert.equal(second.value().readReceiptsEnabled, true)
  second.fetches[0].reject(new Error("offline"))
  await flush()
  assert.equal(second.value().visible, true)
  second.unmount()
  const other = mountReadReceipts(true)
  other.render(actor("fixture-other"))
  assert.equal(other.value().isPlaceholder, true)
  assert.equal(other.value().readReceiptsEnabled, false)
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
