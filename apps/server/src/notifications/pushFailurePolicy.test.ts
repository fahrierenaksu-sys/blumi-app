import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"
import { logPushFailure, resolveTicketFailure } from "./pushFailurePolicy"
import { PushProviderHttpError, PushProviderRejection } from "./pushProvider"

const NOW = new Date("2026-10-01T10:00:00.000Z")

async function sendOnce(error: Error) {
  const service = createNotificationService({
    now: () => NOW,
    reportPushFailure: () => {},
    pushProvider: { async sendPush() { throw error } }
  })
  await service.registerDevice("recipient", { platform: "ios", pushToken: "token" })
  await service.sendPushToUser("recipient", {
    title: "Blumi", body: "You have a new message.",
    data: { type: "chat.message", threadId: "thread", messageId: "message" }
  })
  await service.dispatchDue(NOW)
  return {
    audits: await service.repository.listDeliveryAudits(),
    pending: await service.repository.listPendingDeliveries(),
    devices: await service.repository.listDevices("recipient")
  }
}

test("credential and payload rejections fail at once instead of resending the same push", async () => {
  for (const code of ["InvalidCredentials", "MismatchSenderId", "MessageTooBig"]) {
    const { audits, pending, devices } = await sendOnce(new PushProviderRejection(code))
    assert.deepEqual(audits.map((audit) => [audit.outcome, audit.errorCode]), [["failed_permanently", code]])
    assert.deepEqual(pending, [])
    assert.equal(devices.length, 1, `${code} says nothing about the device`)
  }
})

test("a rate-limited device or project is retried slowly while the outbox still holds the push", async () => {
  for (const error of [new PushProviderRejection("MessageRateExceeded"), new PushProviderHttpError(429)]) {
    const { audits, pending } = await sendOnce(error)
    assert.equal(audits[0]?.outcome, "retry_scheduled")
    assert.equal(pending.length, 1)
    assert.equal(Date.parse(pending[0]!.availableAt) - NOW.getTime(), 30_000)
  }
})

test("other provider failures keep the short exponential retry", async () => {
  const { audits, pending } = await sendOnce(new PushProviderHttpError(503))
  assert.deepEqual(audits.map((audit) => [audit.outcome, audit.errorCode]), [["retry_scheduled", "provider_unavailable"]])
  assert.equal(Date.parse(pending[0]!.availableAt) - NOW.getTime(), 1_000)
})

test("rate-limit backoff doubles, is capped, and stops at the attempt limit", () => {
  assert.deepEqual(resolveTicketFailure("MessageRateExceeded", 1, 5), { action: "retry", delayMs: 30_000 })
  assert.deepEqual(resolveTicketFailure("MessageRateExceeded", 2, 5), { action: "retry", delayMs: 60_000 })
  assert.deepEqual(resolveTicketFailure("MessageRateExceeded", 4, 5), { action: "retry", delayMs: 240_000 })
  assert.deepEqual(resolveTicketFailure("MessageRateExceeded", 5, 5), { action: "fail" })
  assert.deepEqual(resolveTicketFailure("DeviceNotRegistered", 1, 5), { action: "unregister" })
  assert.deepEqual(resolveTicketFailure("provider_receipt_error", 1, 5), { action: "default" })
})

test("configuration rejections are logged as operational errors with allowlisted fields only", () => {
  const lines: Array<[string, string, unknown]> = []
  const logger = {
    warn: (message: string, details: unknown) => { lines.push(["warn", message, details]) },
    error: (message: string, details: unknown) => { lines.push(["error", message, details]) }
  }
  const failure = (errorCode: string) => ({ stage: "receipt", errorCode, notificationType: "unknown", attempt: 1, count: 1 })
  logPushFailure(failure("InvalidCredentials"), logger)
  logPushFailure(failure("MessageTooBig"), logger)
  logPushFailure(failure("DeviceNotRegistered"), logger)
  logPushFailure(failure("MessageRateExceeded"), logger)
  assert.deepEqual(lines.map(([level, , details]) => [level, (details as { errorCode: string }).errorCode]), [
    ["error", "InvalidCredentials"], ["error", "MessageTooBig"], ["warn", "DeviceNotRegistered"], ["warn", "MessageRateExceeded"]
  ])
  assert.deepEqual(Object.keys(lines[0]![2] as object).sort(), ["attempt", "count", "errorCode", "notificationType", "stage"])
})
