import assert from "node:assert/strict"
import test from "node:test"
import {
  syncPushRegistration,
  shouldRemovePushRegistration,
  type PushRegistrationDependencies
} from "./pushRegistrationCoordinator"

test("token rotation preserves registration while logout/account switch removes it", () => {
  assert.equal(shouldRemovePushRegistration("a", "a"), false)
  assert.equal(shouldRemovePushRegistration("a", "b"), true)
  assert.equal(shouldRemovePushRegistration("a", undefined), true)
})

function createDependencies(
  overrides: Partial<PushRegistrationDependencies> = {}
): PushRegistrationDependencies & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    isPhysicalDevice: true,
    platform: "ios",
    createAndroidChannel: async () => {
      calls.push("channel")
    },
    getPermissionStatus: async () => {
      calls.push("get-permission")
      return "undetermined"
    },
    requestPermission: async () => {
      calls.push("request-permission")
      return "granted"
    },
    getExpoPushToken: async () => {
      calls.push("get-token")
      return "ExponentPushToken[test]"
    },
    registerDevice: async (input) => {
      calls.push(`register:${input.platform}:${input.pushToken}`)
    },
    ...overrides
  }
}

test("production registration requests permission and persists the Expo push token", async () => {
  const dependencies = createDependencies()

  const result = await syncPushRegistration({
    mode: "production",
    allowPermissionPrompt: true,
    dependencies
  })

  assert.deepEqual(result, {
    status: "registered",
    pushToken: "ExponentPushToken[test]"
  })
  assert.deepEqual(dependencies.calls, [
    "get-permission",
    "request-permission",
    "get-token",
    "register:ios:ExponentPushToken[test]"
  ])
})

test("Android creates its notification channel before requesting permission", async () => {
  const dependencies = createDependencies({ platform: "android" })

  await syncPushRegistration({
    mode: "production",
    allowPermissionPrompt: true,
    dependencies
  })

  assert.equal(dependencies.calls[0], "channel")
  assert.equal(dependencies.calls.at(-1), "register:android:ExponentPushToken[test]")
})

test("demo sessions, simulators, and denied permission never register a device", async () => {
  const demo = createDependencies()
  assert.deepEqual(
    await syncPushRegistration({
      mode: "demo",
      allowPermissionPrompt: true,
      dependencies: demo
    }),
    { status: "skipped", reason: "non-production-session" }
  )
  assert.deepEqual(demo.calls, [])

  const simulator = createDependencies({ isPhysicalDevice: false })
  assert.deepEqual(
    await syncPushRegistration({
      mode: "production",
      allowPermissionPrompt: true,
      dependencies: simulator
    }),
    { status: "skipped", reason: "physical-device-required" }
  )
  assert.deepEqual(simulator.calls, [])

  const denied = createDependencies({
    getPermissionStatus: async () => "denied"
  })
  assert.deepEqual(
    await syncPushRegistration({
      mode: "production",
      allowPermissionPrompt: true,
      dependencies: denied
    }),
    { status: "skipped", reason: "permission-denied" }
  )
  assert.deepEqual(denied.calls, [])
})

test("an already granted permission does not trigger another system prompt", async () => {
  const dependencies = createDependencies({
    getPermissionStatus: async () => {
      dependencies.calls.push("get-permission")
      return "granted"
    }
  })

  await syncPushRegistration({
    mode: "production",
    allowPermissionPrompt: false,
    dependencies
  })

  assert.equal(dependencies.calls.includes("request-permission"), false)
  assert.equal(dependencies.calls.includes("get-token"), true)
})

test("an undetermined permission waits for a contextual user action", async () => {
  const dependencies = createDependencies()

  const result = await syncPushRegistration({
    mode: "production",
    allowPermissionPrompt: false,
    dependencies
  })

  assert.deepEqual(result, {
    status: "skipped",
    reason: "permission-not-requested"
  })
  assert.deepEqual(dependencies.calls, ["get-permission"])
})
