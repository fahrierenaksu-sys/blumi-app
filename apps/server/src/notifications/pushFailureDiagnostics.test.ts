import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"
import { PushProviderRejection } from "./pushProvider"

test("ticket and receipt failures emit only allowlisted codes, types and counters", async () => {
  for (const stage of ["ticket", "receipt"] as const) {
    const diagnostics: unknown[] = []
    const now = new Date("2026-10-01T10:00:00Z")
    const service = createNotificationService({ now: () => now,
      reportPushFailure: (failure) => { diagnostics.push(failure) },
      pushProvider: {
        async sendPush() {
          if (stage === "ticket") throw new PushProviderRejection("InvalidCredentials")
          return { ticketId: "private-ticket" }
        },
        async getReceipt() { return { status: "error", errorCode: "MismatchSenderId" } }
      }
    })
    await service.registerDevice("private-user", { platform: "ios", pushToken: "private-token" })
    await service.sendPushToUser("private-user", { title: "Blumi", body: "private message",
      data: { type: "chat.message", messageId: "private-id", threadId: "private-thread" } })
    await service.dispatchDue(now)
    if (stage === "receipt") await service.dispatchDue(new Date(now.getTime() + 15 * 60_000))
    assert.deepEqual(diagnostics, [{ stage, errorCode: stage === "ticket" ? "InvalidCredentials" : "MismatchSenderId",
      notificationType: stage === "ticket" ? "chat.message" : "unknown", attempt: 1, count: 1 }])
    assert.equal(JSON.stringify(diagnostics).includes("private"), false)
  }
})

test("unknown provider codes and notification types cannot leak into diagnostics", async () => {
  const diagnostics: unknown[] = []
  const service = createNotificationService({ reportPushFailure: (failure) => { diagnostics.push(failure) },
    pushProvider: { async sendPush() { throw new PushProviderRejection("private-token") } } })
  await service.registerDevice("private-user", { platform: "ios", pushToken: "private-token" })
  await service.sendPushToUser("private-user", { title: "Private", body: "Private", data: { type: "private-type" } })
  await service.dispatchDue()
  assert.deepEqual(diagnostics, [{ stage: "ticket", errorCode: "provider_receipt_error", notificationType: "unknown", attempt: 1, count: 1 }])
})
