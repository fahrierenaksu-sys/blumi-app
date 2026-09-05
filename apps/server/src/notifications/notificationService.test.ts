import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationService } from "./notificationService"

test("notification service registers devices and fans out pushes", async () => {
  const sent: Array<{
    pushToken: string
    title: string
    body: string
    data?: Record<string, string>
  }> = []
  const service = createNotificationService({
    pushProvider: {
      async sendPush(pushToken, notification) {
        sent.push({
          pushToken,
          title: notification.title,
          body: notification.body,
          ...(notification.data ? { data: { ...notification.data } } : {})
        })
      }
    }
  })

  const device = await service.registerDevice(
    "user_a",
    {
      platform: "ios",
      pushToken: " token_a "
    },
    new Date("2026-06-28T10:00:00.000Z")
  )
  await service.registerDevice("user_a", {
    platform: "android",
    pushToken: "token_b"
  })
  await service.registerDevice("user_b", {
    platform: "ios",
    pushToken: "token_c"
  })

  assert.equal(device.pushToken, "token_a")
  assert.equal((await service.repository.listDevices("user_a")).length, 2)

  await service.sendPushToUser("user_a", {
    title: "  New match  ",
    body: "  Hello   there  ",
    data: {
      type: "match"
    }
  })

  await service.dispatchDue()
  assert.deepEqual(
    sent.map((push) => push.pushToken).sort(),
    ["token_a", "token_b"]
  )
  assert.equal(sent[0].title, "New match")
  assert.equal(sent[0].body, "Hello there")

  await service.removeDevice("user_a", "token_a")
  assert.deepEqual(
    (await service.repository.listDevices("user_a")).map((item) => item.pushToken),
    ["token_b"]
  )
})

test("a push token follows the current account instead of leaking the previous user's notifications", async () => {
  const sent: Array<{ pushToken: string; body: string }> = []
  const service = createNotificationService({
    pushProvider: {
      async sendPush(pushToken, notification) {
        sent.push({ pushToken, body: notification.body })
      }
    }
  })

  await service.registerDevice("previous_user", {
    platform: "ios",
    pushToken: "shared_device_token"
  })
  await service.registerDevice("current_user", {
    platform: "ios",
    pushToken: "shared_device_token"
  })

  assert.deepEqual(
    await service.repository.listDevices("previous_user"),
    []
  )
  assert.deepEqual(
    (await service.repository.listDevices("current_user")).map(
      (device) => device.pushToken
    ),
    ["shared_device_token"]
  )

  await service.sendPushToUser("previous_user", {
    title: "Private",
    body: "previous account message"
  })
  await service.sendPushToUser("current_user", {
    title: "Private",
    body: "current account message"
  })

  await service.dispatchDue()
  assert.deepEqual(sent, [
    {
      pushToken: "shared_device_token",
      body: "current account message"
    }
  ])
})

test("notification delivery is durably retried and every provider attempt is audited", async () => {
  let shouldFail = true
  const service = createNotificationService({
    pushProvider: {
      async sendPush() {
        if (shouldFail) throw new Error("provider unavailable")
      }
    },
    now: () => new Date("2026-07-22T10:00:00.000Z")
  })
  await service.registerDevice("user_a", {
    platform: "ios",
    pushToken: "retry_token"
  })

  await service.sendPushToUser("user_a", {
    title: "New message",
    body: "A message is waiting.",
    data: { type: "chat.message" }
  })

  await service.dispatchDue()
  const firstAudits = await service.repository.listDeliveryAudits()
  assert.equal(firstAudits.length, 1)
  assert.match(firstAudits[0]?.deliveryId ?? "", /^[A-Za-z0-9_-]{8,128}$/)
  assert.deepEqual(
    { ...firstAudits[0], deliveryId: "opaque" },
    {
      attempt: 1,
      deliveryId: "opaque",
      outcome: "retry_scheduled",
      occurredAt: "2026-07-22T10:00:00.000Z",
      errorCode: "provider_unavailable"
    }
  )
  const pending = await service.repository.listPendingDeliveries()
  assert.equal(pending.length, 1)
  assert.equal(pending[0]?.attemptCount, 1)

  shouldFail = false
  await service.dispatchDue(new Date("2026-07-22T10:00:02.000Z"))
  const audits = await service.repository.listDeliveryAudits()
  assert.equal(audits.length, 2)
  assert.equal(audits[1]?.outcome, "sent")
  assert.equal((await service.repository.listPendingDeliveries()).length, 0)
})

test("notification preferences suppress disabled, quiet-hour, duplicate, and rate-limited value notifications before they enter the outbox", async () => {
  const sent: Array<{ pushToken: string; type?: string }> = []
  let currentTime = new Date("2026-07-22T21:30:00.000Z")
  const service = createNotificationService({
    now: () => currentTime,
    pushProvider: {
      async sendPush(pushToken, notification) {
        sent.push({ pushToken, type: notification.data?.type })
      }
    }
  })
  await service.registerDevice("user_a", { platform: "ios", pushToken: "policy_token" })

  await service.updatePreferences("user_a", {
    likesEnabled: false,
    messagesEnabled: true,
    matchesEnabled: true,
    discoveryWatchEnabled: true,
    quietHours: null,
    quietHoursUtcOffsetMinutes: 0,
    maxPushesPerHour: 1
  })
  await service.sendPushToUser("user_a", {
    title: "Someone likes your vibe",
    body: "A new connection is waiting.",
    data: { type: "discovery.like", sourceUserId: "user_b" }
  })
  assert.deepEqual(sent, [])
  assert.equal((await service.repository.listPendingDeliveries()).length, 0)

  await service.updatePreferences("user_a", {
    likesEnabled: true,
    messagesEnabled: true,
    matchesEnabled: true,
    discoveryWatchEnabled: true,
    quietHours: { startMinute: 21 * 60, endMinute: 7 * 60 },
    quietHoursUtcOffsetMinutes: 0,
    maxPushesPerHour: 1
  })
  await service.sendPushToUser("user_a", {
    title: "New message",
    body: "A message is waiting.",
    data: { type: "chat.message", messageId: "message_quiet" }
  })
  assert.deepEqual(sent, [])

  currentTime = new Date("2026-07-22T08:30:00.000Z")
  await service.updatePreferences("user_a", {
    likesEnabled: true,
    messagesEnabled: true,
    matchesEnabled: true,
    discoveryWatchEnabled: true,
    quietHours: null,
    quietHoursUtcOffsetMinutes: 0,
    maxPushesPerHour: 1
  })
  const message = {
    title: "New message",
    body: "A message is waiting.",
    data: { type: "chat.message", messageId: "message_1" }
  } as const
  await service.sendPushToUser("user_a", message)
  await service.sendPushToUser("user_a", message)
  await service.sendPushToUser("user_a", {
    title: "It’s a match!",
    body: "Your vibes connected.",
    data: { type: "discovery.match", matchId: "match_2" }
  })

  await service.dispatchDue()
  assert.deepEqual(sent, [{ pushToken: "policy_token", type: "chat.message" }])
  assert.deepEqual(
    (await service.repository.listPolicyAudits()).map((entry) => entry.reason),
    ["disabled", "quiet_hours", "queued", "duplicate", "frequency_cap"]
  )
})

test("a failed outbox insert does not consume the policy slot for a later retry", async () => {
  const deliveryIds = ["same_delivery", "same_delivery", "retry_delivery"]
  const service = createNotificationService({
    deliveryIdFactory: () => deliveryIds.shift() ?? "unexpected_delivery",
    now: () => new Date("2026-07-22T10:00:00.000Z"),
    pushProvider: { async sendPush() { throw new Error("provider unavailable") } }
  })
  await service.registerDevice("user_a", { platform: "ios", pushToken: "token_a" })

  await service.sendPushToUser("user_a", {
    title: "First message",
    body: "This reserves the first delivery id.",
    data: { type: "chat.message", messageId: "message_one" }
  })

  await assert.rejects(
    service.sendPushToUser("user_a", {
      title: "Second message",
      body: "This delivery id collides before it can be queued.",
      data: { type: "chat.message", messageId: "message_two" }
    }),
    /Push delivery ID must be unique\./
  )

  const retry = await service.sendPushToUser("user_a", {
    title: "Second message",
    body: "The policy slot remains available after the failed insert.",
    data: { type: "chat.message", messageId: "message_two" }
  })

  assert.deepEqual(retry, { outcome: "queued", deliveryCount: 1 })
  assert.deepEqual(
    (await service.repository.listPolicyAudits()).map((audit) => [audit.reason, audit.dedupeKey]),
    [
      ["queued", "message:message_one"],
      ["queued", "message:message_two"]
    ]
  )
})

test("dispatchDue drains every currently due batch before returning", async () => {
  const sent: string[] = []
  const now = new Date("2026-07-22T10:00:00.000Z")
  const service = createNotificationService({
    pushProvider: {
      async sendPush(pushToken) {
        sent.push(pushToken)
      }
    }
  })

  await Promise.all(
    Array.from({ length: 101 }, async (_, index) => {
      const device = await service.registerDevice("user_a", { platform: "ios", pushToken: `token_${index}` })
      await service.repository.enqueueDelivery({
        registrationId: device.registrationId,
        deliveryId: `backlog_${index}`,
        userId: "user_a",
        pushToken: `token_${index}`,
        notification: { title: "Blumi", body: "You have an update." },
        attemptCount: 0,
        availableAt: now.toISOString(),
        createdAt: now.toISOString()
      })
    }
    )
  )

  await service.dispatchDue(now)

  assert.equal(sent.length, 101)
  assert.equal((await service.repository.listPendingDeliveries()).length, 0)
})
