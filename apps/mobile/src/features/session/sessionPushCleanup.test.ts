import assert from "node:assert/strict"
import test from "node:test"
import { rememberRegisteredPushDevice } from "../notifications/pushDeviceRegistry"
import { revokeProductionSessionAfterPushCleanup } from "./sessionPushCleanup"

const session = { userId: "user_a", sessionToken: "session_a" }

test("sign-out removes this device's push registration before the session is revoked", async () => {
  rememberRegisteredPushDevice("user_a", "ExponentPushToken[a]")
  const calls: string[] = []
  await revokeProductionSessionAfterPushCleanup("https://api.blumi.test", session, {
    removeDevice: async (_base, token, pushToken) => { calls.push(`remove:${token}:${pushToken}`) },
    revokeSession: async (_base, token) => { calls.push(`revoke:${token}`) }
  })
  assert.deepEqual(calls, ["remove:session_a:ExponentPushToken[a]", "revoke:session_a"])
})

test("an offline device removal never blocks revoking the session", async () => {
  rememberRegisteredPushDevice("user_a", "ExponentPushToken[a]")
  const calls: string[] = []
  await revokeProductionSessionAfterPushCleanup("https://api.blumi.test", session, {
    removeDevice: async () => { throw new Error("offline") },
    revokeSession: async (_base, token) => { calls.push(`revoke:${token}`) }
  })
  assert.deepEqual(calls, ["revoke:session_a"])
})

test("sign-out without a registered device only revokes the session", async () => {
  const calls: string[] = []
  await revokeProductionSessionAfterPushCleanup("https://api.blumi.test", { userId: "user_without_device", sessionToken: "s" }, {
    removeDevice: async () => { calls.push("remove") },
    revokeSession: async () => { calls.push("revoke") }
  })
  assert.deepEqual(calls, ["revoke"])
})
