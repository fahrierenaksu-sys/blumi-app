import assert from "node:assert/strict"
import test from "node:test"
import { createDebouncedRunner, createPushRegistrationGate } from "./pushRegistrationGate"
import { syncPushRegistration, type PushRegistrationDependencies } from "./pushRegistrationCoordinator"

test("a token event for a token this session already saw or registered starts nothing", () => {
  const gate = createPushRegistrationGate()
  gate.noteDeviceToken("device-a")
  assert.equal(gate.acceptTokenEvent("device-a"), false, "the echo of our own fetch")
  gate.noteRegistered({ platform: "ios", pushToken: "ExponentPushToken[a]" })
  assert.equal(gate.acceptTokenEvent("ExponentPushToken[a]"), false, "the last registered token")
  assert.equal(gate.acceptTokenEvent(undefined), false)
  assert.equal(gate.acceptTokenEvent("device-b"), true, "a rotated token is new")
  assert.equal(gate.acceptTokenEvent("device-b"), false, "and only once")
})

test("an unchanged registration is allowed once per foreground", () => {
  const gate = createPushRegistrationGate()
  const input = { platform: "ios" as const, pushToken: "ExponentPushToken[a]" }
  assert.equal(gate.shouldRegister(input), true)
  gate.noteRegistered(input)
  assert.equal(gate.shouldRegister(input), false)
  assert.equal(gate.shouldRegister({ ...input, pushToken: "ExponentPushToken[b]" }), true)
  gate.noteForeground()
  assert.equal(gate.shouldRegister(input), true)
})

test("an unchanged-token sync makes no registerDevice call", async () => {
  const gate = createPushRegistrationGate()
  const registered: string[] = []
  const dependencies: PushRegistrationDependencies = {
    isPhysicalDevice: true,
    platform: "ios",
    createAndroidChannel: async () => {},
    getPermissionStatus: async () => "granted",
    requestPermission: async () => "granted",
    getExpoPushToken: async () => "ExponentPushToken[a]",
    isAlreadyRegistered: (input) => !gate.shouldRegister(input),
    registerDevice: async (input) => { registered.push(input.pushToken); gate.noteRegistered(input) }
  }
  const first = await syncPushRegistration({ mode: "production", allowPermissionPrompt: false, dependencies })
  assert.deepEqual(first, { status: "registered", pushToken: "ExponentPushToken[a]" })
  for (let index = 0; index < 5; index += 1) {
    const repeat = await syncPushRegistration({ mode: "production", allowPermissionPrompt: false, dependencies })
    assert.deepEqual(repeat, { status: "registered", pushToken: "ExponentPushToken[a]", unchanged: true })
  }
  assert.deepEqual(registered, ["ExponentPushToken[a]"])
})

test("a burst of token events becomes one run after the last", () => {
  const pending = new Map<number, () => void>()
  let nextId = 0
  let runs = 0
  const runner = createDebouncedRunner(() => { runs += 1 }, 500, {
    set: ((callback: () => void) => { nextId += 1; pending.set(nextId, callback); return nextId }) as unknown as typeof setTimeout,
    clear: ((id: number) => { pending.delete(id) }) as unknown as typeof clearTimeout
  })
  runner.schedule()
  runner.schedule()
  runner.schedule()
  assert.equal(pending.size, 1)
  for (const callback of pending.values()) callback()
  pending.clear()
  assert.equal(runs, 1)
  runner.schedule()
  runner.cancel()
  assert.equal(pending.size, 0)
})
