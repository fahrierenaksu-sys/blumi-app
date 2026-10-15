import assert from "node:assert/strict"
import test from "node:test"
import Fastify from "fastify"
import { createAuthService } from "../auth/authService"
import { createNotificationService } from "../notifications/notificationService"
import { MAX_DEVICES_PER_ACCOUNT } from "../notifications/notificationRepository"
import { registerNotificationRoutes } from "./notificationRoutes"

async function harness() {
  const app = Fastify({ logger: false })
  const authService = createAuthService()
  const notificationService = createNotificationService()
  const signed = await authService.signInWithVerifiedPhone("+15570001010", {
    acceptedTerms: { version: "test-terms-v1", locale: "en" }, firebaseUid: "synthetic-notification-route"
  })
  await authService.updateProfile(signed.sessionToken, {
    displayName: "Synthetic", age: 25, gender: "woman", avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await authService.completeOnboardingStep(signed.sessionToken, step)
  }
  await registerNotificationRoutes(app, { authService, notificationService })
  const headers = { authorization: `Bearer ${signed.sessionToken}` }
  return { app, notificationService, userId: signed.account.userId, headers }
}

test("device API rejects malformed tokens without writes and accepts both Expo prefixes and legacy UUIDs", async () => {
  const { app, notificationService, userId, headers } = await harness()
  try {
    for (const pushToken of ["arbitrary", "ExpoPushToken[]", "ExpoPushToken[a]extra", "ExpoPushToken[a b]",
      "ExponentPushToken[nested[value]]", "ExpoPushToken[a\u0000b]", "ExpoPushToken[" + "x".repeat(4096) + "]"]) {
      const result = await app.inject({ method: "POST", url: "/v1/devices", headers, payload: { platform: "ios", pushToken } })
      assert.equal(result.statusCode, 400)
    }
    assert.deepEqual(await notificationService.repository.listDevices(userId), [])
    for (const pushToken of ["ExpoPushToken[synthetic_1]", "ExponentPushToken[synthetic-2]", "00000000-0000-0000-0000-000000000003"]) {
      const result = await app.inject({ method: "POST", url: "/v1/devices", headers, payload: { platform: "ios", pushToken } })
      assert.equal(result.statusCode, 201)
    }
    assert.equal((await notificationService.repository.listDevices(userId)).length, 3)
  } finally { await app.close() }
})

test("device API keeps parallel registrations at the cap, refuses another account's token with a safe 429 and preserves repeats", async () => {
  const { app, notificationService, userId, headers } = await harness()
  try {
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => app.inject({
      method: "POST", url: "/v1/devices", headers,
      payload: { platform: "ios", pushToken: `ExpoPushToken[parallel-${index}]` }
    })))
    // A full account replaces its oldest registrations, so rotated tokens register.
    for (const result of results) assert.equal(result.statusCode, 201)
    assert.equal((await notificationService.repository.listDevices(userId)).length, MAX_DEVICES_PER_ACCOUNT)
    await notificationService.repository.saveDevice({ userId: "synthetic-other-account", platform: "ios",
      pushToken: "ExpoPushToken[other-owner]", registeredAt: new Date().toISOString() })
    const foreign = await app.inject({ method: "POST", url: "/v1/devices", headers,
      payload: { platform: "ios", pushToken: "ExpoPushToken[other-owner]" } })
    assert.equal(foreign.statusCode, 429)
    assert.equal(foreign.json().code, "DEVICE_REGISTRATION_LIMIT")
    assert.equal(foreign.body.includes(userId), false)
    assert.equal(foreign.body.includes("other-owner"), false)
    const [existing] = await notificationService.repository.listDevices(userId)
    const repeat = await app.inject({ method: "POST", url: "/v1/devices", headers,
      payload: { platform: "ios", pushToken: existing!.pushToken } })
    assert.equal(repeat.statusCode, 200)
    const platform = await app.inject({ method: "POST", url: "/v1/devices", headers,
      payload: { platform: "android", pushToken: existing!.pushToken } })
    assert.equal(platform.statusCode, 201)
    assert.equal((await notificationService.repository.listDevices(userId)).length, MAX_DEVICES_PER_ACCOUNT)
  } finally { await app.close() }
})

test("device removal remains available for a historical token that is no longer accepted for registration", async () => {
  const { app, notificationService, userId, headers } = await harness()
  try {
    await notificationService.repository.saveDevice({ userId, platform: "ios", pushToken: "legacy-opaque-token",
      registeredAt: new Date().toISOString() })
    const removed = await app.inject({ method: "DELETE", url: "/v1/devices", headers,
      payload: { pushToken: "legacy-opaque-token" } })
    assert.equal(removed.statusCode, 204)
    assert.deepEqual(await notificationService.repository.listDevices(userId), [])
  } finally { await app.close() }
})
