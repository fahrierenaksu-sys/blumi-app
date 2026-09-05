import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"
import { createInMemoryNotificationRepository } from "./notificationRepository"

test("queued push does not invoke provider and chat content is not persisted", async () => {
  let calls = 0
  const service = createNotificationService({ pushProvider: { async sendPush() { calls++ } } })
  await service.registerDevice("a", { platform: "ios", pushToken: "shared" })
  await service.sendPushToUser("a", { title: "Private sender", body: "Private content", data: { type: "chat.message", messageId: "m", text: "secret" } })
  assert.equal(calls, 0)
  const [queued] = await service.repository.listPendingDeliveries()
  assert.equal(queued.notification.title, "Blumi")
  assert.equal(queued.notification.body, "You have a new message.")
  assert.equal(queued.notification.data?.text, undefined)
})

for (const change of ["transfer", "remove", "removeAll", "reregister"] as const) {
  test(`pending retries cannot cross device registration ${change}`, async () => {
    let calls = 0
    const now = new Date("2026-09-05T10:00:00Z")
    const service = createNotificationService({ now: () => now, pushProvider: { async sendPush() { calls++; throw new Error("unavailable") } } })
    await service.registerDevice("a", { platform: "ios", pushToken: "shared" }, now)
    await service.sendPushToUser("a", { title: "Blumi", body: "Old account" })
    await service.dispatchDue(now)
    assert.equal(calls, 1)
    if (change === "transfer") await service.registerDevice("b", { platform: "ios", pushToken: "shared" }, now)
    if (change === "reregister") {
      await service.removeDevice("a", "shared")
      await service.registerDevice("a", { platform: "ios", pushToken: "shared" }, now)
    }
    if (change === "remove") await service.removeDevice("a", "shared")
    if (change === "removeAll") await service.repository.removeAllDevices("a")
    await service.dispatchDue(new Date(now.getTime() + 2000))
    assert.equal(calls, 1)
    assert.equal((await service.repository.listPendingDeliveries()).length, 0)
  })
}

test("provider timeout aborts a stalled request and schedules durable retry", async () => {
  let signal: AbortSignal | undefined
  const service = createNotificationService({
    providerTimeoutMs: 10,
    pushProvider: { async sendPush(_token, _notification, options) {
      signal = options?.signal
      await new Promise(() => {})
    } }
  })
  await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("a", { title: "Blumi", body: "Update" })
  await service.dispatchDue()
  assert.equal(signal?.aborted, true)
  assert.equal((await service.repository.listPendingDeliveries())[0]?.attemptCount, 1)
})

test("legacy delivery without registration identity fails closed", async () => {
  let calls = 0
  const service = createNotificationService({ pushProvider: { async sendPush() { calls++ } } })
  await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.repository.enqueueDelivery({ deliveryId: "legacy_delivery", userId: "a", pushToken: "token",
    notification: { title: "Old", body: "private" }, attemptCount: 0,
    availableAt: new Date(0).toISOString(), createdAt: new Date(0).toISOString() })
  await service.dispatchDue()
  assert.equal(calls, 0)
  assert.equal((await service.repository.listDeliveryAudits())[0]?.errorCode, "registration_changed")
})

test("a claimed delivery is rechecked after ownership changes", async () => {
  const repository = createInMemoryNotificationRepository()
  const claim = repository.claimDueDeliveries.bind(repository)
  let calls = 0
  const service = createNotificationService({
    repository: { ...repository, async claimDueDeliveries(input) {
      const claimed = await claim(input)
      await repository.saveDevice({ userId: "b", platform: "ios", pushToken: "token", registeredAt: input.now.toISOString() })
      return claimed
    } },
    pushProvider: { async sendPush() { calls++ } }
  })
  await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("a", { title: "Blumi", body: "Private" })
  await service.dispatchDue()
  assert.equal(calls, 0)
})

test("same-owner registration refresh preserves queued work and generation", async () => {
  const service = createNotificationService()
  const first = await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("a", { title: "Blumi", body: "Update" })
  const second = await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  assert.equal(first.registrationId, second.registrationId)
  assert.equal((await service.repository.listPendingDeliveries()).length, 1)
})
