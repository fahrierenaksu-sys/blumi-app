import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService, DeviceRegistrationLimitError } from "./notificationService"
import { createInMemoryNotificationRepository, MAX_DEVICES_PER_ACCOUNT } from "./notificationRepository"

test("concurrent new device registrations keep the account at the cap and notification fanout stays bounded", async () => {
  // A full account replaces its oldest registrations instead of refusing a rotated
  // token (see deviceTokenRotation.test.ts), so the cap is on stored devices.
  const service = createNotificationService({ pushProvider: { async sendPush() {} } })
  const results = await Promise.allSettled(Array.from({ length: 40 }, (_, index) =>
    service.registerDevice("synthetic-recipient", { platform: "ios", pushToken: `token-${index}` })))
  for (const result of results) {
    if (result.status === "rejected") assert.ok(result.reason instanceof DeviceRegistrationLimitError)
  }
  assert.equal((await service.repository.listDevices("synthetic-recipient")).length, MAX_DEVICES_PER_ACCOUNT)
  await service.registerDevice("synthetic-recipient", { platform: "ios", pushToken: "one-more" })
  const after = await service.repository.listDevices("synthetic-recipient")
  assert.equal(after.length, MAX_DEVICES_PER_ACCOUNT)
  assert.ok(after.some((device) => device.pushToken === "one-more"))
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

test("a failing last-seen refresh never fails or changes an existing device registration", async () => {
  const repository = createInMemoryNotificationRepository()
  const failures: unknown[] = []
  const service = createNotificationService({
    repository: { ...repository, async markDeviceSeen() { throw new Error("lock timeout for user synthetic-seen token seen-token") } },
    deviceRegistrationCacheTtlMs: 0,
    reportPushFailure: (failure) => { failures.push(failure) }
  })
  const first = await service.ensureDeviceRegistered("synthetic-seen", { platform: "ios", pushToken: "seen-token" },
    new Date("2026-10-01T10:00:00.000Z"))
  const later = await service.ensureDeviceRegistered("synthetic-seen", { platform: "ios", pushToken: "seen-token" },
    new Date("2026-10-05T10:00:00.000Z"))

  assert.equal(later.changed, false)
  assert.equal(later.device.registrationId, first.device.registrationId)
  assert.deepEqual(failures, [{ stage: "device_seen", errorCode: "device_seen_refresh_failed",
    notificationType: "unknown", attempt: 1, count: 1 }], "one redacted counter, no ids")
})
