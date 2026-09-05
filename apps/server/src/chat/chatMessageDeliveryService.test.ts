import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import type { NotificationService } from "../notifications/notificationService"
import type { PushNotification } from "../notifications/pushProvider"
import type { ConnectionManager } from "../realtime/connectionManager"
import { createSafetyService } from "../safety/safetyService"
import {
  ChatDeliveryBlockedError,
  createChatMessageDeliveryService
} from "./chatMessageDeliveryService"
import { createChatService } from "./chatService"

test("failed notification enqueue remains recoverable by a fresh delivery dispatcher", async () => {
  const chatService = createChatService({ idFactory: () => "message_recover" })
  await createThread(chatService)
  let fail = true
  let enqueued = 0
  const options = {
    chatService, safetyService: createSafetyService(),
    connectionManager: { async sendToUsersDurably() {}, hasUserConnections: () => false } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {
      if (fail) throw new Error("DB unavailable")
      enqueued += 1
    } } as unknown as NotificationService
  }
  const first = await createChatMessageDeliveryService(options).sendMessage({
    senderUserId: "user_a", threadId: "thread_one", body: "hello", clientMessageId: "client-recover-001"
  })
  assert.equal(first.created, true)
  assert.equal((await chatService.listThreads("user_a"))[0]?.lastMessage?.messageId, first.message.messageId)
  fail = false
  const restarted = createChatMessageDeliveryService(options)
  await restarted.dispatchDue(new Date(Date.now() + 60_000))
  await restarted.dispatchDue(new Date(Date.now() + 120_000))
  assert.equal(enqueued, 1)
})

test("cross-instance fanout failure leaves the chat job pending until publication succeeds", async () => {
  const chatService = createChatService({ idFactory: () => "message_fanout" })
  await createThread(chatService)
  let fail = true
  let attempts = 0
  const delivery = createChatMessageDeliveryService({
    chatService, safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably() { attempts += 1; if (fail) throw new Error("fanout unavailable") },
      hasUserConnections: () => true
    } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })
  await delivery.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "hello" })
  assert.equal(attempts, 1)
  fail = false
  await delivery.dispatchDue(new Date(Date.now() + 60_000))
  await delivery.dispatchDue(new Date(Date.now() + 120_000))
  assert.equal(attempts, 2)
})

test("message delivery persists once, fans out realtime, and pushes offline recipients", async () => {
  const chatService = createChatService({ idFactory: () => "message_one" })
  await createThread(chatService)
  const sentEvents: ServerEvent[] = []
  const pushes: Array<{ userId: string; body: string }> = []
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) {
        sentEvents.push(event)
      },
      hasUserConnections() {
        return false
      }
    } as unknown as ConnectionManager,
    notificationService: {
      async sendPushToUser(userId: string, notification: PushNotification) {
        pushes.push({ userId, body: notification.body })
      }
    } as unknown as NotificationService
  })

  const firstDelivery = await delivery.sendMessage({
    senderUserId: "user_a",
    senderDisplayName: "Ada",
    threadId: "thread_one",
    body: "  hello   there  "
  })

  const { message } = firstDelivery
  assert.equal(firstDelivery.created, true)
  assert.equal(message.body, "hello there")
  assert.deepEqual(sentEvents, [{
    type: "chat.message_received",
    payload: message
  }])
  assert.deepEqual(pushes, [{ userId: "user_b", body: "You have a new message." }])
})

test("message delivery rejects either-direction blocks before persistence or fanout", async () => {
  const chatService = createChatService({ idFactory: () => "must_not_be_used" })
  await createThread(chatService)
  const safetyService = createSafetyService()
  await safetyService.blockUser("user_b", "user_a")
  let fanoutCount = 0
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService,
    connectionManager: {
      async sendToUsersDurably() {
        fanoutCount += 1
      },
      hasUserConnections() {
        return false
      }
    } as unknown as ConnectionManager,
    notificationService: {
      async sendPushToUser() {
        throw new Error("push must not run")
      }
    } as unknown as NotificationService
  })

  await assert.rejects(
    () => delivery.sendMessage({
      senderUserId: "user_a",
      threadId: "thread_one",
      body: "blocked"
    }),
    ChatDeliveryBlockedError
  )
  assert.deepEqual(await chatService.listMessages("user_a", "thread_one"), [])
  assert.equal(fanoutCount, 0)
})

test("retries with the same client message ID return one message and fan out once", async () => {
  let nextMessageId = 0
  const chatService = createChatService({ idFactory: () => `message_${++nextMessageId}` })
  await createThread(chatService)
  const sentEvents: ServerEvent[] = []
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) {
        sentEvents.push(event)
      },
      hasUserConnections() {
        return true
      }
    } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })

  const first = await delivery.sendMessage({
    senderUserId: "user_a",
    threadId: "thread_one",
    body: "hello",
    clientMessageId: "client-message-001"
  })
  const retry = await delivery.sendMessage({
    senderUserId: "user_a",
    threadId: "thread_one",
    body: "hello",
    clientMessageId: "client-message-001"
  })

  assert.deepEqual(retry.message, first.message)
  assert.equal(first.created, true)
  assert.equal(retry.created, false)
  assert.equal((await chatService.listMessages("user_a", "thread_one")).length, 1)
  assert.equal(sentEvents.length, 1)
})

async function createThread(chatService: ReturnType<typeof createChatService>) {
  await chatService.createThread({
    threadId: "thread_one",
    miniRoomId: "room_one",
    participantUserIds: ["user_a", "user_b"],
    participants: [
      { userId: "user_a", displayName: "Ada" },
      { userId: "user_b", displayName: "Bora" }
    ]
  })
}
