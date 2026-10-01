import assert from "node:assert/strict"
import test from "node:test"
import {
  forgetRegisteredPushDevice,
  rememberRegisteredPushDevice,
  removeRegisteredPushDevice
} from "./pushDeviceRegistry"

test("sign-out and the registration cleanup share one removal of the account's device", async () => {
  rememberRegisteredPushDevice("user_a", "ExponentPushToken[a]")
  const removed: string[] = []
  let release!: () => void
  const remove = (token: string) => {
    removed.push(token)
    return new Promise<void>((resolve) => { release = resolve })
  }
  const fromCleanup = removeRegisteredPushDevice("user_a", remove)
  const fromSignOut = removeRegisteredPushDevice("user_a", remove)
  let signOutSettled = false
  void fromSignOut.then(() => { signOutSettled = true })
  await Promise.resolve()
  assert.deepEqual(removed, ["ExponentPushToken[a]"])
  assert.equal(signOutSettled, false, "the session is revoked only after the device is removed")
  release()
  await Promise.all([fromCleanup, fromSignOut])
  await removeRegisteredPushDevice("user_a", remove)
  assert.deepEqual(removed, ["ExponentPushToken[a]"])
})

test("another account's sign-out never removes the current registration", async () => {
  rememberRegisteredPushDevice("user_b", "ExponentPushToken[shared]")
  const removed: string[] = []
  await removeRegisteredPushDevice("user_a", async (token) => { removed.push(token) })
  assert.equal(removed.length, 0)
  await removeRegisteredPushDevice("user_b", async (token) => { removed.push(token) })
  assert.deepEqual(removed, ["ExponentPushToken[shared]"])
})

test("a failed removal is reported to every caller and can be retried", async () => {
  rememberRegisteredPushDevice("user_c", "ExponentPushToken[c]")
  await assert.rejects(removeRegisteredPushDevice("user_c", async () => { throw new Error("offline") }), /offline/)
  const removed: string[] = []
  await removeRegisteredPushDevice("user_c", async (token) => { removed.push(token) })
  assert.deepEqual(removed, ["ExponentPushToken[c]"])
})

test("a new registration during a pending removal is kept", async () => {
  rememberRegisteredPushDevice("user_d", "ExponentPushToken[d]")
  let release!: () => void
  const removal = removeRegisteredPushDevice("user_d", () => new Promise<void>((resolve) => { release = resolve }))
  rememberRegisteredPushDevice("user_e", "ExponentPushToken[d]")
  release()
  await removal
  const removed: string[] = []
  await removeRegisteredPushDevice("user_e", async (token) => { removed.push(token) })
  assert.deepEqual(removed, ["ExponentPushToken[d]"])
  forgetRegisteredPushDevice()
})
