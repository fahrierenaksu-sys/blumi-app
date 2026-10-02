import assert from "node:assert/strict"
import test from "node:test"
import { startSocialLoop } from "../e2e/socialLoopHarness"
import { USER_RATE_BUDGET_LIMITS } from "../operations/sharedRateBudget"
import { createNotificationService } from "./notificationService"
import { createInMemoryNotificationRepository, type NotificationRepository } from "./notificationRepository"

function countingRepository(): { repository: NotificationRepository; calls: Record<string, number> } {
  const base = createInMemoryNotificationRepository()
  const calls: Record<string, number> = { saveDevice: 0, listDevices: 0 }
  return {
    calls,
    repository: {
      ...base,
      async saveDevice(device) { calls.saveDevice += 1; return base.saveDevice(device) },
      async listDevices(userId) { calls.listDevices += 1; return base.listDevices(userId) }
    }
  }
}

test("an unchanged device registration is answered from memory without database work", async () => {
  const { repository, calls } = countingRepository()
  const service = createNotificationService({ repository })
  const first = await service.ensureDeviceRegistered("user_a", { platform: "ios", pushToken: "token_a" })
  assert.equal(first.changed, true)
  const afterFirst = { ...calls }

  for (let index = 0; index < 50; index += 1) {
    const repeat = await service.ensureDeviceRegistered("user_a", { platform: "ios", pushToken: " token_a " })
    assert.equal(repeat.changed, false)
    assert.equal(repeat.device.registrationId, first.device.registrationId)
  }
  assert.deepEqual(calls, afterFirst, "repeats neither write nor read")
})

test("a removed, moved or re-platformed token is registered again, never answered from a stale cache", async () => {
  const { repository, calls } = countingRepository()
  const service = createNotificationService({ repository })
  await service.ensureDeviceRegistered("user_a", { platform: "ios", pushToken: "token_a" })

  await service.removeDevice("user_a", "token_a")
  const afterRemoval = await service.ensureDeviceRegistered("user_a", { platform: "ios", pushToken: "token_a" })
  assert.equal(afterRemoval.changed, true)
  assert.equal((await service.repository.listDevices("user_a")).length, 1)

  // The phone changed hands: the token now belongs to user_b only.
  const moved = await service.ensureDeviceRegistered("user_b", { platform: "ios", pushToken: "token_a" })
  assert.equal(moved.changed, true)
  assert.equal((await service.repository.listDevices("user_a")).length, 0)
  const back = await service.ensureDeviceRegistered("user_a", { platform: "ios", pushToken: "token_a" })
  assert.equal(back.changed, true, "user_a's old cache entry did not survive the move")
  assert.equal((await service.repository.listDevices("user_b")).length, 0)

  const platform = await service.ensureDeviceRegistered("user_a", { platform: "android", pushToken: "token_a" })
  assert.equal(platform.changed, true)
  assert.equal((await service.repository.listDevices("user_a"))[0]?.platform, "android")

  // Account cleanup and provider DeviceNotRegistered go through the repository.
  await service.repository.removeAllDevices("user_a")
  const savesBefore = calls.saveDevice
  assert.equal((await service.ensureDeviceRegistered("user_a", { platform: "android", pushToken: "token_a" })).changed, true)
  assert.equal(calls.saveDevice, savesBefore + 1)
  const [current] = await service.repository.listDevices("user_a")
  await service.repository.removeDeviceRegistration({ userId: "user_a", pushToken: "token_a", registrationId: current!.registrationId! })
  assert.equal((await service.ensureDeviceRegistered("user_a", { platform: "android", pushToken: "token_a" })).changed, true)
})

test("a looping device registration never 429s the same person's chat reads", async () => {
  const harness = await startSocialLoop()
  try {
    const ada = await harness.signUp("Ada")
    const bora = await harness.signUp("Bora", { gender: "man" })
    const { threadId } = await harness.matchPair(ada, bora)
    const pushToken = `ExponentPushToken[loop-${ada.userId.slice(-8)}]`

    const statuses: number[] = []
    for (let index = 0; index < 200; index += 1) {
      statuses.push((await ada.http("POST", "/v1/devices", { platform: "ios", pushToken })).status)
    }
    assert.equal(statuses[0], 201)
    const limit = USER_RATE_BUDGET_LIMITS.deviceRegistration
    assert.ok(statuses.slice(1, limit).every((status) => status === 200), "unchanged repeats answer 200")
    assert.ok(statuses.slice(limit).every((status) => status === 429), "the loop only exhausts its own budget")
    assert.equal((await harness.services.notificationService.repository.listDevices(ada.userId)).length, 1)

    const messages = await ada.http("GET", `/v1/threads/${threadId}/messages`)
    assert.equal(messages.status, 200, JSON.stringify(messages.body))
    const threads = await ada.http("GET", "/v1/threads")
    assert.equal(threads.status, 200)

    // Signing out still unregisters the token while the loop holds its budget.
    const removed = await ada.http("DELETE", "/v1/devices", { pushToken })
    assert.equal(removed.status, 204, JSON.stringify(removed.body))
    assert.equal((await harness.services.notificationService.repository.listDevices(ada.userId)).length, 0)
  } finally {
    await harness.close()
  }
})
