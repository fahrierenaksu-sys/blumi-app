import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService, DeviceRegistrationLimitError } from "./notificationService"
import { MAX_DEVICES_PER_ACCOUNT } from "./notificationRepository"

const registeredAt = (index: number) => new Date(Date.UTC(2026, 9, 10, 10, 0, index)).toISOString()

async function fullAccount(userId: string) {
  const service = createNotificationService({ pushProvider: { async sendPush() {} } })
  for (let index = 0; index < MAX_DEVICES_PER_ACCOUNT; index++) {
    await service.repository.saveDevice({ userId, platform: "ios", pushToken: `old-${index}`, registeredAt: registeredAt(index) })
  }
  return service
}
const tokensOf = async (service: Awaited<ReturnType<typeof fullAccount>>, userId: string) =>
  (await service.repository.listDevices(userId)).map((device) => device.pushToken).sort()

test("a rotated token registers at a full quota by replacing the oldest device of the same account", async () => {
  const service = await fullAccount("rotating-user")
  await service.sendPushToUser("rotating-user", { title: "Blumi", body: "Update" }) // queues for all ten

  const registered = await service.registerDevice("rotating-user", { platform: "ios", pushToken: "rotated-new" })

  const tokens = await tokensOf(service, "rotating-user")
  assert.equal(registered.pushToken, "rotated-new")
  assert.equal(tokens.length, MAX_DEVICES_PER_ACCOUNT)
  assert.ok(tokens.includes("rotated-new"))
  assert.ok(!tokens.includes("old-0"), "the oldest registration is the one replaced")
  const pending = (await service.repository.listPendingDeliveries()).map((delivery) => delivery.pushToken)
  assert.ok(!pending.includes("old-0"), "work queued for the replaced device is removed with it")
})

test("a replaced token is not answered from the registration cache when it registers again", async () => {
  const service = await fullAccount("cached-user")
  await service.ensureDeviceRegistered("cached-user", { platform: "ios", pushToken: "old-0" }) // cached as registered
  await service.registerDevice("cached-user", { platform: "ios", pushToken: "rotated-new" })

  const again = await service.ensureDeviceRegistered("cached-user", { platform: "ios", pushToken: "old-0" })

  assert.equal(again.changed, true)
  assert.ok((await tokensOf(service, "cached-user")).includes("old-0"))
})

test("a token owned by another account is never taken by replacing a device at a full quota", async () => {
  const service = await fullAccount("full-user")
  await service.registerDevice("other-user", { platform: "ios", pushToken: "other-token" })
  const before = await tokensOf(service, "full-user")

  await assert.rejects(service.registerDevice("full-user", { platform: "ios", pushToken: "other-token" }),
    DeviceRegistrationLimitError)

  assert.deepEqual(await tokensOf(service, "full-user"), before)
  assert.deepEqual(await tokensOf(service, "other-user"), ["other-token"])
})

test("concurrent registrations at a full quota keep the account at the cap and every request settles", async () => {
  const service = await fullAccount("busy-user")

  const results = await Promise.allSettled(Array.from({ length: 25 }, (_, index) =>
    service.registerDevice("busy-user", { platform: "ios", pushToken: `rotated-${index}` })))

  assert.equal((await service.repository.listDevices("busy-user")).length, MAX_DEVICES_PER_ACCOUNT)
  assert.ok(results.every((result) => result.status === "fulfilled"))
  const queued = await service.sendPushToUser("busy-user", { title: "Blumi", body: "Update" })
  assert.equal(queued.deliveryCount, MAX_DEVICES_PER_ACCOUNT)
})
