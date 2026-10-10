import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService, DeviceRegistrationLimitError } from "./notificationService"
import { MAX_DEVICES_PER_ACCOUNT } from "./notificationRepository"

test("concurrent new device registrations stop at the account cap and notification fanout stays bounded", async () => {
  const service = createNotificationService({ pushProvider: { async sendPush() {} } })
  const results = await Promise.allSettled(Array.from({ length: 40 }, (_, index) =>
    service.registerDevice("synthetic-recipient", { platform: "ios", pushToken: `token-${index}` })))
  assert.equal(results.filter((result) => result.status === "fulfilled").length, MAX_DEVICES_PER_ACCOUNT)
  for (const result of results) {
    if (result.status === "rejected") assert.ok(result.reason instanceof DeviceRegistrationLimitError)
  }
  const before = await service.repository.listDevices("synthetic-recipient")
  assert.equal(before.length, MAX_DEVICES_PER_ACCOUNT)
  await assert.rejects(service.registerDevice("synthetic-recipient", { platform: "ios", pushToken: "one-more" }),
    { code: "DEVICE_REGISTRATION_LIMIT", statusCode: 429 })
  assert.deepEqual(await service.repository.listDevices("synthetic-recipient"), before)
  const queued = await service.sendPushToUser("synthetic-recipient", { title: "Blumi", body: "Update" })
  assert.equal(queued.deliveryCount, MAX_DEVICES_PER_ACCOUNT)
})

test("a refused device transfer leaves owner, queued work and cached registration intact", async () => {
  const service = createNotificationService()
  const original = await service.ensureDeviceRegistered("synthetic-owner", { platform: "ios", pushToken: "owned-token" })
  await service.sendPushToUser("synthetic-owner", { title: "Blumi", body: "Update" })
  for (let index = 0; index < MAX_DEVICES_PER_ACCOUNT; index++) {
    await service.registerDevice("synthetic-full", { platform: "ios", pushToken: `full-${index}` })
  }
  const before = await service.repository.listPendingDeliveries()
  await assert.rejects(service.registerDevice("synthetic-full", { platform: "android", pushToken: "owned-token" }),
    DeviceRegistrationLimitError)
  const repeat = await service.ensureDeviceRegistered("synthetic-owner", { platform: "ios", pushToken: "owned-token" })
  assert.equal(repeat.changed, false)
  assert.equal(repeat.device.registrationId, original.device.registrationId)
  assert.deepEqual(await service.repository.listPendingDeliveries(), before)
})

test("legacy accounts with twelve or one hundred devices retain their records and queue only the latest ten", async () => {
  for (const total of [12, 100]) {
    const service = createNotificationService()
    for (let index = 0; index < total; index++) {
      await service.repository.saveDevice({ userId: "synthetic-legacy", platform: "ios",
        pushToken: `legacy-${String(index).padStart(3, "0")}`,
        registeredAt: new Date(Date.UTC(2026, 9, 10, 10, 0, index)).toISOString() })
    }
    const before = await service.repository.listDevices("synthetic-legacy")
    const result = await service.sendPushToUser("synthetic-legacy", { title: "Blumi", body: "Update" })
    assert.equal(result.deliveryCount, MAX_DEVICES_PER_ACCOUNT)
    assert.deepEqual(await service.repository.listDevices("synthetic-legacy"), before)
    assert.deepEqual((await service.repository.listPendingDeliveries()).map((entry) => entry.pushToken).sort(),
      Array.from({ length: MAX_DEVICES_PER_ACCOUNT }, (_, index) => `legacy-${String(total - MAX_DEVICES_PER_ACCOUNT + index).padStart(3, "0")}`))
  }
})

test("delivery selection breaks equal registration timestamps consistently across repository orderings", async () => {
  const service = createNotificationService()
  for (let index = 11; index >= 0; index--) {
    await service.repository.saveDevice({ userId: "synthetic-ties", platform: "ios",
      pushToken: `tie-${String(index).padStart(2, "0")}`, registeredAt: "2026-10-10T10:00:00.000Z" })
  }
  assert.equal((await service.sendPushToUser("synthetic-ties", { title: "Blumi", body: "Update" })).deliveryCount, 10)
  assert.deepEqual((await service.repository.listPendingDeliveries()).map((entry) => entry.pushToken),
    Array.from({ length: 10 }, (_, index) => `tie-${String(index).padStart(2, "0")}`))
})
