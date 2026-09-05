import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"
import { PushProviderRejection } from "./pushProvider"

test("ticket is polled after15 minutes, receipt handoff is recorded without resending", async () => {
  const now = new Date("2026-09-05T10:00:00Z")
  let sends = 0
  let polls = 0
  const service = createNotificationService({ now: () => now, pushProvider: {
    async sendPush() { sends++; return { ticketId: "ticket" } },
    async getReceipt() { polls++; return { status: "ok" as const } }
  } })
  await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("a", { title: "Blumi", body: "Update" })
  await service.dispatchDue(now)
  assert.equal(polls, 0)
  await service.dispatchDue(new Date(now.getTime() + 15 * 60_000))
  assert.equal(polls, 1)
  assert.equal(sends, 1)
  assert.equal((await service.repository.listReceiptResults())[0]?.outcome, "provider_handoff")
})

test("DeviceNotRegistered receipt disables only the original registration", async () => {
  const now = new Date("2026-09-05T10:00:00Z")
  const service = createNotificationService({ now: () => now, pushProvider: {
    async sendPush() { return { ticketId: "ticket" } },
    async getReceipt() { return { status: "error" as const, errorCode: "DeviceNotRegistered" } }
  } })
  await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("a", { title: "Blumi", body: "Update" })
  await service.dispatchDue(now)
  await service.registerDevice("b", { platform: "ios", pushToken: "token" })
  await service.dispatchDue(new Date(now.getTime() + 15 * 60_000))
  assert.equal((await service.repository.listDevices("b")).length, 1)
  assert.equal((await service.repository.listReceiptResults())[0]?.outcome, "rejected")
})

test("missing receipts retry and expire after24h without sending again", async () => {
  const now = new Date("2026-09-05T10:00:00Z")
  let sends = 0
  const service = createNotificationService({ now: () => now, pushProvider: {
    async sendPush() { sends++; return { ticketId: "missing" } }, async getReceipt() { return null }
  } })
  await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("a", { title: "Blumi", body: "Update" })
  await service.dispatchDue(now)
  await service.dispatchDue(new Date(now.getTime() + 15 * 60_000))
  assert.equal((await service.repository.listReceiptResults()).length, 0)
  await service.dispatchDue(new Date(now.getTime() + 24 * 60 * 60_000))
  assert.equal((await service.repository.listReceiptResults())[0]?.outcome, "receipt_unavailable")
  assert.equal(sends, 1)
})

test("current unregistered device is disabled by receipt", async () => {
  const now = new Date("2026-09-05T10:00:00Z")
  const service = createNotificationService({ now: () => now, pushProvider: {
    async sendPush() { return { ticketId: "unregistered" } },
    async getReceipt() { return { status: "error" as const, errorCode: "DeviceNotRegistered" } }
  } })
  await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("a", { title: "Blumi", body: "Update" })
  await service.dispatchDue(now)
  await service.dispatchDue(new Date(now.getTime() + 15 * 60_000))
  assert.deepEqual(await service.repository.listDevices("a"), [])
})

test("ticket rejection is audited and cannot retry an unregistered device", async () => {
  const service = createNotificationService({ pushProvider: {
    async sendPush() { throw new PushProviderRejection("DeviceNotRegistered") }
  } })
  await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("a", { title: "Blumi", body: "Update" })
  await service.dispatchDue()
  assert.equal((await service.repository.listDeliveryAudits())[0]?.errorCode, "DeviceNotRegistered")
  assert.deepEqual(await service.repository.listDevices("a"), [])
  assert.deepEqual(await service.repository.listPendingDeliveries(), [])
})

test("stalled receipt request aborts without resending the notification", async () => {
  const now = new Date("2026-09-05T10:00:00Z")
  let signal: AbortSignal | undefined
  let sends = 0
  const service = createNotificationService({ now: () => now, providerTimeoutMs: 10, pushProvider: {
    async sendPush() { sends++; return { ticketId: "stalled" } },
    async getReceipt(_ticket, options) { signal = options?.signal; return new Promise(() => {}) }
  } })
  await service.registerDevice("a", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("a", { title: "Blumi", body: "Update" })
  await service.dispatchDue(now)
  await service.dispatchDue(new Date(now.getTime() + 15 * 60_000))
  assert.equal(signal?.aborted, true)
  assert.equal(sends, 1)
  assert.deepEqual(await service.repository.listReceiptResults(), [])
})
