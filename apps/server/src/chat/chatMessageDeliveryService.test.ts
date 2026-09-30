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
import { ChatMessageIdempotencyConflictError, createChatService } from "./chatService"
import { createInMemoryChatRepository, createInMemoryChatStore } from "./chatRepository"

test("failed notification enqueue remains recoverable by a fresh delivery dispatcher", async () => {
  const chatService = createChatService({ idFactory: () => "message_recover" })
  await createThread(chatService)
  let fail = true
  let enqueued = 0
  let signalFailedPush!: () => void
  const failedPush = new Promise<void>((resolve) => { signalFailedPush = resolve })
  const options = {
    chatService, safetyService: createSafetyService(),
    connectionManager: { async sendToUsersDurably() {}, hasUserConnections: () => false } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {
      if (fail) {
        signalFailedPush()
        throw new Error("DB unavailable")
      }
      enqueued += 1
    } } as unknown as NotificationService
  }
  const first = await createChatMessageDeliveryService(options).sendMessage({
    senderUserId: "user_a", threadId: "thread_one", body: "hello", clientMessageId: "client-recover-001"
  })
  assert.equal(first.created, true)
  assert.equal((await chatService.listThreads("user_a"))[0]?.lastMessage?.messageId, first.message.messageId)
  await failedPush
  await new Promise<void>((resolve) => setImmediate(resolve))
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
  let signalFailedFanout!: () => void
  const failedFanout = new Promise<void>((resolve) => { signalFailedFanout = resolve })
  const delivery = createChatMessageDeliveryService({
    chatService, safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably() {
        attempts += 1
        if (fail) {
          signalFailedFanout()
          throw new Error("fanout unavailable")
        }
      },
      hasUserConnections: () => true
    } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })
  await delivery.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "hello" })
  await failedFanout
  await new Promise<void>((resolve) => setImmediate(resolve))
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
  await waitFor(() => sentEvents.length === 1 && pushes.length === 1)
  assert.deepEqual(sentEvents, [{
    type: "chat.message_received",
    payload: message
  }])
  assert.deepEqual(pushes, [{ userId: "user_b", body: "You have a new message." }])
})

test("returns the persisted message acknowledgement without waiting for a slow push", async () => {
  const chatService = createChatService({ idFactory: () => "message_ack_before_push" })
  await createThread(chatService)
  let signalPushStarted!: () => void
  let releasePush!: () => void
  let signalPushFinished!: () => void
  const pushStarted = new Promise<void>((resolve) => { signalPushStarted = resolve })
  const heldPush = new Promise<void>((resolve) => { releasePush = resolve })
  const pushFinished = new Promise<void>((resolve) => { signalPushFinished = resolve })
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably() {},
      hasUserConnections: () => false
    } as unknown as ConnectionManager,
    notificationService: {
      async sendPushToUser() {
        signalPushStarted()
        await heldPush
        signalPushFinished()
      }
    } as unknown as NotificationService
  })

  const pendingResponse = delivery.sendMessage({
    senderUserId: "user_a",
    threadId: "thread_one",
    body: "hello",
    clientMessageId: "client-ack-before-push-001"
  })
  await pushStarted
  const acknowledgedBeforePushCompleted = await Promise.race([
    pendingResponse.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 25))
  ])
  releasePush()
  const response = await pendingResponse
  await pushFinished

  assert.equal(acknowledgedBeforePushCompleted, true)
  assert.equal(response.message.messageId, "message_ack_before_push")
  assert.deepEqual((await chatService.listMessages("user_a", "thread_one")).map((message) => message.messageId), [
    "message_ack_before_push"
  ])
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
  await waitFor(() => sentEvents.length === 1)
  assert.equal(sentEvents.length, 1)
})

test("a committed send can be ACK-retried after a block without creating or delivering again", async () => {
  const store = createInMemoryChatStore()
  const chatService = createChatService({
    repository: createInMemoryChatRepository(store),
    idFactory: () => "message_ack_lost"
  })
  await createThread(chatService)
  const safetyService = createSafetyService()
  const sentEvents: ServerEvent[] = []
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService,
    connectionManager: {
      async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) {
        sentEvents.push(event)
      },
      hasUserConnections: () => true
    } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })
  const original = await delivery.sendMessage({
    senderUserId: "user_a",
    threadId: "thread_one",
    body: "persisted before ACK loss",
    clientMessageId: "client-ack-loss-001"
  })
  await waitFor(() => sentEvents.length === 1)

  // Simulate a lost HTTP response: persistence and the durable delivery job remain.
  await safetyService.blockUser("user_b", "user_a")
  const retry = await delivery.sendMessage({
    senderUserId: "user_a",
    threadId: "thread_one",
    body: "persisted before ACK loss",
    clientMessageId: "client-ack-loss-001"
  })

  assert.deepEqual(retry.message, original.message)
  assert.equal(retry.created, false)
  assert.equal((await chatService.listMessages("user_a", "thread_one")).length, 1)
  assert.equal(store.deliveryJobs.size, 1)
  await assert.rejects(
    delivery.sendMessage({
      senderUserId: "user_a",
      threadId: "thread_one",
      body: "different body",
      clientMessageId: "client-ack-loss-001"
    }),
    ChatMessageIdempotencyConflictError
  )
  await assert.rejects(
    delivery.sendMessage({
      senderUserId: "user_a",
      threadId: "thread_one",
      body: "new message after block",
      clientMessageId: "client-new-after-block-001"
    }),
    ChatDeliveryBlockedError
  )
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal((await chatService.listMessages("user_a", "thread_one")).length, 1)
  assert.equal(store.deliveryJobs.size, 1)
  assert.equal(sentEvents.length, 1)
})

test("a persisted test persona replies once to a newly delivered user message", async () => {
  let nextMessageId = 0
  const repository = createInMemoryChatRepository()
  repository.findTestPersona = async (userId) => userId === "user_b"
    ? { userId, greeting: "Selam!", replies: ["Kahve iyi fikir."] }
    : null
  const chatService = createChatService({ repository, idFactory: () => `message_${++nextMessageId}` })
  await createThread(chatService)
  const events: ServerEvent[] = []
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) {
        events.push(event)
      },
      hasUserConnections: () => true
    } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })
  const send = () => delivery.sendMessage({
    senderUserId: "user_a", threadId: "thread_one", body: "Merhaba",
    clientMessageId: "test-client-1"
  })
  await send()
  await send()
  await waitFor(() => events.length === 2)
  const messages = await chatService.listMessages("user_a", "thread_one")
  assert.deepEqual(messages.map((message) => message.senderUserId), ["user_a", "user_b"])
  assert.equal(messages[1]?.body, "Kahve iyi fikir.")
  assert.equal(events.length, 2)
})

test("a message queued before a block is never pushed or fanned out after it, and the block error matches a foreign thread", async () => {
  const store = createInMemoryChatStore()
  const chatService = createChatService({
    repository: createInMemoryChatRepository(store),
    idFactory: () => "message_queued_before_block"
  })
  await createThread(chatService)
  const safetyService = createSafetyService()
  let fanoutCount = 0
  const pushes: PushNotification[] = []
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService,
    connectionManager: {
      async sendToUsersDurably() { fanoutCount += 1 },
      hasUserConnections: () => false
    } as unknown as ConnectionManager,
    notificationService: {
      async sendPushToUser(_userId: string, notification: PushNotification) { pushes.push(notification) }
    } as unknown as NotificationService
  })
  // Persisted with its outbox job, but not dispatched yet (e.g. the process restarted).
  await chatService.sendMessage("user_a", "thread_one", "queued")
  await safetyService.blockUser("user_a", "user_b")

  await delivery.dispatchDue(new Date(Date.now() + 60_000))
  assert.equal(fanoutCount, 0)
  assert.deepEqual(pushes, [])
  assert.equal(store.deliveryJobs.get("message_queued_before_block")?.completed, true,
    "the job is settled, so it is not pushed after an unblock either")

  for (const senderUserId of ["user_a", "user_b"]) {
    const blocked = await delivery.sendMessage({ senderUserId, threadId: "thread_one", body: "after" })
      .then(() => null, (error: unknown) => error)
    const foreign = await delivery.sendMessage({ senderUserId: "user_c", threadId: "thread_one", body: "after" })
      .then(() => null, (error: unknown) => error)
    assert.ok(blocked instanceof ChatDeliveryBlockedError)
    assert.equal((blocked as Error).message, (foreign as Error).message)
  }
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

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
  assert.fail("Timed out waiting for asynchronous chat delivery")
}
