import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notificationRepository"
import type { PushNotification } from "./pushProvider"

const NOW = new Date("2026-09-30T10:00:00.000Z")

function createRecordingService(options: Parameters<typeof createNotificationService>[0] = {}) {
  const sent: Array<{ pushToken: string; notification: PushNotification }> = []
  const service = createNotificationService({
    now: () => NOW,
    pushProvider: {
      async sendPush(pushToken, notification) {
        sent.push({ pushToken, notification: structuredClone(notification) })
      }
    },
    ...options
  })
  return { service, sent }
}

test("room invites follow the message preference, dedupe per invite and skip the hourly budget", async () => {
  const { service, sent } = createRecordingService()
  await service.registerDevice("recipient", { platform: "ios", pushToken: "device" }, NOW)
  const invite = (inviteId: string) => ({
    title: "Blumi",
    body: "You have a new room invitation.",
    data: { type: "chat.room_invite", threadId: "thread_1", inviteId, expiresAt: "2026-09-30T10:10:00.000Z" }
  })

  await service.updatePreferences("recipient", { ...DEFAULT_NOTIFICATION_PREFERENCES, messagesEnabled: false })
  assert.equal((await service.sendPushToUser("recipient", invite("invite_off"))).outcome, "disabled")

  await service.updatePreferences("recipient", { ...DEFAULT_NOTIFICATION_PREFERENCES, maxPushesPerHour: 1 })
  await service.sendPushToUser("recipient", {
    title: "It’s a match!", body: "Your vibes connected.", data: { type: "discovery.match", matchId: "match_budget" }
  })
  assert.equal((await service.sendPushToUser("recipient", invite("invite_1"))).outcome, "queued")
  assert.equal((await service.sendPushToUser("recipient", invite("invite_1"))).outcome, "duplicate")
  await service.dispatchDue()
  assert.deepEqual(sent.map((entry) => entry.notification.data?.type), ["discovery.match", "chat.room_invite"])
})

test("pushes use the recipient's language and never carry caller-supplied names", async () => {
  const locales: Record<string, "en" | "tr" | undefined> = { tr_user: "tr", en_user: "en", unknown_user: undefined }
  const { service, sent } = createRecordingService({
    resolveRecipientLocale: async (userId) => locales[userId]
  })
  for (const userId of Object.keys(locales)) {
    await service.registerDevice(userId, { platform: "ios", pushToken: `device_${userId}` }, NOW)
  }
  await service.sendPushToUser("tr_user", {
    title: "Blumi", body: "You have a new message.", data: { type: "chat.message", threadId: "t", messageId: "m_tr" }
  })
  await service.sendPushToUser("en_user", {
    title: "Blumi", body: "Ada wants to meet you", data: { type: "mini_room.invite", inviteId: "legacy", roomId: "lobby" }
  })
  await service.sendPushToUser("unknown_user", {
    title: "It’s a match!", body: "Your vibes connected.", data: { type: "discovery.match", matchId: "match_en" }
  })
  await service.dispatchDue()
  const byToken = new Map(sent.map((entry) => [entry.pushToken, entry.notification]))
  assert.equal(byToken.get("device_tr_user")?.body, "Yeni bir mesajın var.")
  assert.doesNotMatch(byToken.get("device_en_user")?.body ?? "", /Ada/)
  assert.equal(byToken.get("device_unknown_user")?.title, "It’s a match!")
})

test("a failing locale lookup still queues the push in English", async () => {
  const { service, sent } = createRecordingService({
    resolveRecipientLocale: async () => { throw new Error("database unavailable") }
  })
  await service.registerDevice("user", { platform: "ios", pushToken: "device" }, NOW)
  assert.equal((await service.sendPushToUser("user", {
    title: "Blumi", body: "x", data: { type: "chat.message", threadId: "t", messageId: "m" }
  })).outcome, "queued")
  await service.dispatchDue()
  assert.equal(sent[0]?.notification.body, "You have a new message.")
})

test("the provider receives the recipient-scoped routing payload and delivery options", async () => {
  const { service, sent } = createRecordingService()
  await service.registerDevice("recipient", { platform: "ios", pushToken: "device" }, NOW)
  await service.sendPushToUser("recipient", {
    title: "Someone likes your vibe", body: "Open Blumi.", data: { type: "discovery.like", sourceUserId: "secret_liker" }
  })
  const [queued] = await service.repository.listPendingDeliveries()
  assert.equal(queued?.notification.data?.sourceUserId, "secret_liker", "server-side checks keep the source")
  await service.dispatchDue()
  assert.deepEqual(sent[0]?.notification.data, { type: "discovery.like", recipientUserId: "recipient" })
  assert.equal(sent[0]?.notification.delivery?.collapseId, "likes")
})

test("an expired room invite push is dropped instead of being delivered late", async () => {
  let now = NOW
  const sent: PushNotification[] = []
  let failNext = true
  const service = createNotificationService({
    now: () => now,
    pushProvider: {
      async sendPush(_token, notification) {
        if (failNext) { failNext = false; throw new Error("provider unavailable") }
        sent.push(notification)
      }
    }
  })
  await service.registerDevice("recipient", { platform: "ios", pushToken: "device" }, NOW)
  await service.sendPushToUser("recipient", {
    title: "Blumi", body: "Invite",
    data: { type: "chat.room_invite", threadId: "t", inviteId: "i", expiresAt: "2026-09-30T10:00:01.000Z" }
  })
  await service.dispatchDue(NOW)
  now = new Date("2026-09-30T10:00:02.000Z")
  await service.dispatchDue(now)
  assert.equal(sent.length, 0)
  assert.equal((await service.repository.listPendingDeliveries()).length, 0)
  assert.deepEqual((await service.repository.listDeliveryAudits()).map((audit) => audit.errorCode), ["provider_unavailable", "expired"])
})

test("a push that is no longer relevant at dispatch is dropped, and a failed check retries", async () => {
  let relevance: boolean | Error = false
  const checked: Array<{ userId: string; type?: string }> = []
  const { service, sent } = createRecordingService({
    isDeliveryCurrent: async ({ userId, notification }) => {
      checked.push({ userId, type: notification.data?.type })
      if (relevance instanceof Error) throw relevance
      return relevance
    }
  })
  await service.registerDevice("recipient", { platform: "ios", pushToken: "device" }, NOW)
  await service.sendPushToUser("recipient", {
    title: "Blumi", body: "x", data: { type: "chat.message", threadId: "t", messageId: "blocked" }
  })
  await service.dispatchDue()
  assert.equal(sent.length, 0)
  assert.deepEqual(checked, [{ userId: "recipient", type: "chat.message" }])
  assert.equal((await service.repository.listDeliveryAudits())[0]?.errorCode, "no_longer_relevant")

  relevance = new Error("lookup failed")
  await service.sendPushToUser("recipient", {
    title: "Blumi", body: "x", data: { type: "chat.message", threadId: "t", messageId: "retry" }
  })
  await service.dispatchDue()
  assert.equal(sent.length, 0)
  assert.equal((await service.repository.listPendingDeliveries())[0]?.attemptCount, 1)
  relevance = true
  await service.dispatchDue(new Date(NOW.getTime() + 2_000))
  assert.equal(sent.length, 1)
})

test("queued pushes wake the dispatcher; suppressed pushes do not", async () => {
  const { service } = createRecordingService()
  let wakes = 0
  const unsubscribe = service.onDeliveriesQueued?.(() => { wakes += 1 })
  assert.equal(typeof unsubscribe, "function")
  await service.sendPushToUser("no_device_user", { title: "Blumi", body: "x", data: { type: "chat.message", messageId: "a" } })
  await service.registerDevice("user", { platform: "ios", pushToken: "device" }, NOW)
  await service.sendPushToUser("user", { title: "Blumi", body: "x", data: { type: "chat.message", messageId: "b" } })
  await service.sendPushToUser("user", { title: "Blumi", body: "x", data: { type: "chat.message", messageId: "b" } })
  await service.sendPushToUser("user", { title: "Blumi", body: "Legacy update" })
  assert.equal(wakes, 2)
  unsubscribe?.()
  await service.sendPushToUser("user", { title: "Blumi", body: "x", data: { type: "chat.message", messageId: "c" } })
  assert.equal(wakes, 2)
})
