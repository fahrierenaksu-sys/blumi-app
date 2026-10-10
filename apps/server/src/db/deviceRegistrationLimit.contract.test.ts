import assert from "node:assert/strict"
import {
  createInMemoryNotificationRepository,
  MAX_DEVICES_PER_ACCOUNT,
  type DeviceRegistration,
  type NotificationRepository
} from "../notifications/notificationRepository"
import { createPostgresNotificationRepository } from "./postgresNotificationRepository"
import { runRepositoryContract } from "./repositoryContract"

const registeredAt = "2026-10-10T10:00:00.000Z"
const device = (userId: string, pushToken: string): DeviceRegistration => ({
  userId, pushToken, platform: "ios", registeredAt
})

runRepositoryContract<NotificationRepository>({
  name: "device registration limit",
  databaseUrl: process.env.DATABASE_URL,
  factories: { inMemory: createInMemoryNotificationRepository, postgres: createPostgresNotificationRepository },
  cases: {
    "parallel distinct registrations admit exactly ten and refusal does not write": async (backend) => {
      const userId = backend.id("recipient")
      await backend.ensureUsers(userId)
      const outcomes = await Promise.all(Array.from({ length: 40 }, (_, index) =>
        backend.repository.saveDeviceBounded(device(userId, backend.id(`token-${index}`)))))
      assert.equal(outcomes.filter((result) => result === "saved").length, MAX_DEVICES_PER_ACCOUNT)
      assert.equal(outcomes.filter((result) => result === "limit").length, 40 - MAX_DEVICES_PER_ACCOUNT)
      const before = await backend.repository.listDevices(userId)
      assert.equal(before.length, MAX_DEVICES_PER_ACCOUNT)
      assert.equal(await backend.repository.saveDeviceBounded(device(userId, backend.id("extra"))), "limit")
      assert.deepEqual(await backend.repository.listDevices(userId), before)
    },
    "legacy accounts above the cap keep every device and may renew or update its platform": async (backend) => {
      const userId = backend.id("legacy")
      await backend.ensureUsers(userId)
      // Model existing historical rows without changing or deleting any of them.
      for (let index = 0; index < MAX_DEVICES_PER_ACCOUNT + 2; index++) {
        await backend.repository.saveDevice(device(userId, backend.id(`legacy-${index}`)))
      }
      const before = await backend.repository.listDevices(userId)
      const existing = before[0]!
      assert.equal(await backend.repository.saveDeviceBounded({ ...existing, platform: "android" }), "saved")
      const after = await backend.repository.listDevices(userId)
      assert.equal(after.length, before.length)
      assert.equal(after.find((entry) => entry.pushToken === existing.pushToken)?.registrationId, existing.registrationId)
      assert.equal(after.find((entry) => entry.pushToken === existing.pushToken)?.platform, "android")
      assert.equal(await backend.repository.saveDeviceBounded(device(userId, backend.id("new-token"))), "limit")
      assert.deepEqual(await backend.repository.listDevices(userId), after)
    },
    "a refused transfer keeps the old owner and its pending delivery; freeing a slot admits it": async (backend) => {
      const [owner, destination] = [backend.id("owner"), backend.id("destination")]
      await backend.ensureUsers(owner, destination)
      const token = backend.id("shared-token")
      assert.equal(await backend.repository.saveDeviceBounded(device(owner, token)), "saved")
      const [original] = await backend.repository.listDevices(owner)
      const deliveryId = backend.id("delivery")
      await backend.repository.enqueueDelivery({ deliveryId, userId: owner, pushToken: token,
        registrationId: original!.registrationId, notification: { title: "Blumi", body: "Update" },
        attemptCount: 0, availableAt: registeredAt, createdAt: registeredAt })
      for (let index = 0; index < MAX_DEVICES_PER_ACCOUNT; index++) {
        assert.equal(await backend.repository.saveDeviceBounded(device(destination, backend.id(`full-${index}`))), "saved")
      }
      const before = await backend.repository.listDevices(owner)
      assert.equal(await backend.repository.saveDeviceBounded(device(destination, token)), "limit")
      assert.deepEqual(await backend.repository.listDevices(owner), before)
      assert.ok((await backend.repository.listPendingDeliveries()).some((entry) => entry.deliveryId === deliveryId))
      await backend.repository.removeDevice(destination, backend.id("full-0"))
      assert.equal(await backend.repository.saveDeviceBounded(device(destination, token)), "saved")
      assert.deepEqual(await backend.repository.listDevices(owner), [])
      const transferred = (await backend.repository.listDevices(destination)).find((entry) => entry.pushToken === token)
      assert.ok(transferred)
      assert.notEqual(transferred.registrationId, original!.registrationId)
      assert.equal((await backend.repository.listPendingDeliveries()).some((entry) => entry.deliveryId === deliveryId), false)
    }
  }
})
