import assert from "node:assert/strict"
import test from "node:test"
import {
  getNotificationPreferences,
  registerDevice,
  removeDevice,
  updateNotificationPreferences
} from "./notificationApi"
import { registerBoundedRequestTests } from "../network/boundedRequestContract"

registerBoundedRequestTests([
  {
    name: "device registration POST",
    run: (fetcher) => registerDevice("https://api.blumi.test", "token", {
      platform: "ios",
      pushToken: "push-token"
    }, fetcher)
  },
  {
    name: "device removal DELETE",
    run: (fetcher) => removeDevice("https://api.blumi.test", "token", "push-token", fetcher)
  },
  {
    name: "notification preferences GET",
    run: (fetcher) => getNotificationPreferences("https://api.blumi.test", "token", fetcher)
  },
  {
    name: "notification preferences PUT",
    run: (fetcher) => updateNotificationPreferences("https://api.blumi.test", "token", {
      likesEnabled: false
    }, fetcher)
  }
])

test("notification API keeps caller aborts recognisable as AbortError", async () => {
  const controller = new AbortController()
  let transportSignal: AbortSignal | null | undefined
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const request = removeDevice("https://api.blumi.test", "token", "push-token", async (_url, init) => {
    transportSignal = init?.signal
    entered()
    return new Promise<Response>(() => {})
  }, controller.signal)
  const rejected = assert.rejects(request, { name: "AbortError" })
  await started
  controller.abort()
  await rejected
  assert.equal(transportSignal?.aborted, true)
})

test("registerDevice posts the platform and push token with auth", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const device = await registerDevice(
    "https://api.blumi.test/",
    "session_token",
    {
      platform: "ios",
      pushToken: "ExponentPushToken[test]"
    },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return createJsonResponse(201, {
        device: {
          userId: "user_one",
          platform: "ios",
          pushToken: "ExponentPushToken[test]",
          registeredAt: "2026-06-28T00:00:00.000Z"
        }
      })
    }) as typeof fetch
  )

  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/devices")
  assert.equal(calls[0]?.init?.method, "POST")
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer session_token"
  )
  assert.equal(
    calls[0]?.init?.body,
    JSON.stringify({
      platform: "ios",
      pushToken: "ExponentPushToken[test]"
    })
  )
  assert.equal(device.userId, "user_one")
})

test("removeDevice keeps the push token out of the request URL", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  await removeDevice(
    "https://api.blumi.test",
    "session_token",
    "ExponentPushToken[test]",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return createJsonResponse(204, null)
    }) as typeof fetch
  )

  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/devices")
  assert.equal(calls[0]?.init?.method, "DELETE")
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer session_token"
  )
  assert.equal(
    calls[0]?.init?.body,
    JSON.stringify({ pushToken: "ExponentPushToken[test]" })
  )
})

test("notification API surfaces backend errors and malformed payloads", async () => {
  await assert.rejects(
    () =>
      registerDevice(
        "https://api.blumi.test",
        "session_token",
        { platform: "ios", pushToken: "" },
        (async () => createJsonResponse(400, { error: "Choose a valid push token." })) as typeof fetch
      ),
    /valid push token/
  )

  await assert.rejects(
    () =>
      registerDevice(
        "https://api.blumi.test",
        "session_token",
        { platform: "ios", pushToken: "token" },
        (async () => createJsonResponse(201, { device: { userId: "user_one" } })) as typeof fetch
      ),
    /device registration/
  )
})

test("notification preferences read and update through the authenticated account endpoint", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return createJsonResponse(200, {
      preferences: {
        likesEnabled: false,
        messagesEnabled: true,
        matchesEnabled: true,
        discoveryWatchEnabled: true,
        quietHours: { startMinute: 1320, endMinute: 420 },
        quietHoursUtcOffsetMinutes: 180,
        maxPushesPerHour: 3
      }
    })
  }) as typeof fetch
  const preferences = await getNotificationPreferences(
    "https://api.blumi.test/",
    "session_token",
    fetcher
  )
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/notification-preferences")
  assert.equal(calls[0]?.init?.method, "GET")
  assert.equal(preferences.likesEnabled, false)

  await updateNotificationPreferences(
    "https://api.blumi.test",
    "session_token",
    { likesEnabled: true, maxPushesPerHour: 6 },
    fetcher
  )
  assert.equal(calls[1]?.init?.method, "PUT")
  assert.equal(calls[1]?.init?.body, JSON.stringify({ likesEnabled: true, maxPushesPerHour: 6,
    quietHoursTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }))
})

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}
