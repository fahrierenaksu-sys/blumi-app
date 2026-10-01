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

test("message delivery persists once and queues push even when the recipient has a socket", async () => {
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
        return true
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
  // Production wiring: the chat service's block policy is the safety service.
  const safetyService = createSafetyService()
  const chatService = createChatService({ idFactory: () => "must_not_be_used", blockPolicy: safetyService })
  await createThread(chatService)
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
  assert.deepEqual(await chatService.repository.listMessages("thread_one"), [])
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
  const safetyService = createSafetyService()
  const chatService = createChatService({
    repository: createInMemoryChatRepository(store, { blockSource: safetyService }),
    idFactory: () => "message_ack_lost",
    blockPolicy: safetyService
  })
  await createThread(chatService)
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
  assert.equal((await chatService.repository.listMessages("thread_one")).length, 1)
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
  assert.equal((await chatService.repository.listMessages("thread_one")).length, 1)
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
  const safetyService = createSafetyService()
  const chatService = createChatService({
    repository: createInMemoryChatRepository(store, { blockSource: safetyService }),
    idFactory: () => "message_queued_before_block",
    blockPolicy: safetyService
  })
  await createThread(chatService)
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

test("a send checks and persists in one repository call and keeps the post-persist block check", async () => {
  const safetyService = createSafetyService()
  let blockChecks = 0
  const hasBlockBetween = safetyService.hasBlockBetween.bind(safetyService)
  safetyService.hasBlockBetween = async (a, b) => { blockChecks += 1; return hasBlockBetween(a, b) }
  const repository = createInMemoryChatRepository(undefined, { blockSource: safetyService })
  let threadReads = 0
  let claims = 0
  const findThread = repository.findThread.bind(repository)
  repository.findThread = async (threadId) => { threadReads += 1; return findThread(threadId) }
  const claimDeliveries = repository.claimDeliveries.bind(repository)
  repository.claimDeliveries = async (input) => { claims += 1; return claimDeliveries(input) }
  const chatService = createChatService({ repository, idFactory: () => "message_counted", blockPolicy: safetyService })
  await createThread(chatService)
  threadReads = 0
  const sentEvents: ServerEvent[] = []
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService,
    connectionManager: {
      async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) { sentEvents.push(event) },
      hasUserConnections: () => true
    } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })

  await delivery.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "counted" })
  await waitFor(() => sentEvents.length === 1)

  assert.equal(threadReads, 0, "was three reads, then one: the send statement checks the participants itself")
  assert.equal(claims, 0, "the send statement leases the outbox job to the inline dispatch")
  assert.equal(blockChecks, 2, "inside the send statement and again before fanout")
  assert.equal((await repository.listMessages("thread_one")).length, 1)
})

test("a slow dispatch of one message never lets the sender's next message overtake it, across HTTP and socket senders", async () => {
  // Found by the PostgreSQL social-loop E2E: sequential sends reached the
  // partner out of order when an earlier message's dispatch queries were slower.
  const chatService = createChatService()
  await createThread(chatService)
  // The first message's dispatch is held at its fanout (the send statement
  // leases its job, so there is no claim left to slow down).
  let releaseFirst!: () => void
  const firstFanoutGate = new Promise<void>((resolve) => { releaseFirst = resolve })
  let fanouts = 0
  const delivered: string[] = []
  const connectionManager = {
    async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) {
      fanouts += 1
      if (fanouts === 1) await firstFanoutGate
      if (event.type === "chat.message_received") delivered.push(event.payload.body)
    },
    hasUserConnections: () => true
  } as unknown as ConnectionManager
  const notificationService = { async sendPushToUser() {} } as unknown as NotificationService
  // The HTTP route and the realtime router each create their own service.
  const http = createChatMessageDeliveryService({ chatService, safetyService: createSafetyService(), connectionManager, notificationService })
  const socket = createChatMessageDeliveryService({ chatService, safetyService: createSafetyService(), connectionManager, notificationService })

  await http.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "first" })
  await socket.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "second" })
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(delivered, [], "the second message waits for the first one's dispatch")
  releaseFirst()
  await waitFor(() => delivered.length === 2)
  assert.deepEqual(delivered, ["first", "second"])
})

test("the recovery worker delivers a thread's messages in message order and never waits on a slow thread", async () => {
  // After a restart or a lost lease the worker recovers the outbox. A claim
  // takes only a thread's oldest undelivered message, so a retried first
  // message holds its thread back, and a tick returns without waiting for a
  // slow dispatch so other threads keep being recovered.
  const store = createInMemoryChatStore()
  let nextId = 0
  const chatService = createChatService({
    repository: createInMemoryChatRepository(store),
    idFactory: () => ["message_z", "message_a", "message_other", "message_other_2"][nextId++]!
  })
  await createThread(chatService)
  await chatService.createThread({
    threadId: "thread_two", miniRoomId: "room_two", participantUserIds: ["user_a", "user_c"],
    participants: [{ userId: "user_a", displayName: "Ada" }, { userId: "user_c", displayName: "Cem" }]
  })
  const first = await chatService.sendMessage("user_a", "thread_one", "first", new Date("2026-10-01T10:00:00.000Z"))
  await chatService.sendMessage("user_a", "thread_one", "second", new Date("2026-10-01T10:00:01.000Z"))
  await chatService.sendMessage("user_a", "thread_two", "elsewhere", new Date("2026-10-01T10:00:02.000Z"))
  // The first message's job was retried: it becomes due after the second's.
  const firstJob = store.deliveryJobs.get(first.messageId)!
  store.deliveryJobs.set(first.messageId, { ...firstJob, availableAt: firstJob.availableAt + 5_000 })

  let releaseFirst!: () => void
  const firstFanoutGate = new Promise<void>((resolve) => { releaseFirst = resolve })
  const delivered: string[] = []
  const connectionManager = {
    async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) {
      if (event.type !== "chat.message_received") return
      if (event.payload.body === "first") await firstFanoutGate
      delivered.push(event.payload.body)
    },
    hasUserConnections: () => true
  } as unknown as ConnectionManager
  const worker = createChatMessageDeliveryService({
    chatService, safetyService: createSafetyService(), connectionManager, recoveryTickWaitMs: 50,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })

  const beforeFirstIsDue = new Date(firstJob.availableAt + 1_000)
  await worker.dispatchDue(beforeFirstIsDue)
  assert.deepEqual(delivered, ["elsewhere"], "the second message waits for the retried first one")

  const later = new Date(firstJob.availableAt + 60_000)
  await worker.dispatchDue(later)
  assert.deepEqual(delivered, ["elsewhere"], "the tick returned while the first dispatch is still running")
  await chatService.sendMessage("user_a", "thread_two", "elsewhere again", new Date("2026-10-01T10:00:03.000Z"))
  await worker.dispatchDue(new Date(later.getTime() + 1_000))
  assert.deepEqual(delivered, ["elsewhere", "elsewhere again"], "another thread is recovered meanwhile")

  releaseFirst()
  await waitFor(() => delivered.includes("first"))
  await worker.dispatchDue(new Date(later.getTime() + 2_000))
  assert.deepEqual(delivered, ["elsewhere", "elsewhere again", "first", "second"])
})

test("input the one-statement send refuses keeps its answers behind the conversation and block checks", async () => {
  const safetyService = createSafetyService()
  const chatService = createChatService({ blockPolicy: safetyService })
  await createThread(chatService)
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService,
    connectionManager: { async sendToUsersDurably() {}, hasUserConnections: () => false } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })
  const errorOf = (input: { senderUserId: string; body: string; clientMessageId?: string }) =>
    delivery.sendMessage({ threadId: "thread_one", ...input }).then(() => "sent", (error: Error) => error.message)

  assert.equal(await errorOf({ senderUserId: "user_c", body: "   " }), "That conversation is not available.")
  assert.equal(await errorOf({ senderUserId: "user_a", body: "   " }), "Write a message first.")
  assert.equal(await errorOf({ senderUserId: "user_a", body: "hi", clientMessageId: "bad id" }), "Message retry ID is invalid.")
  await safetyService.blockUser("user_b", "user_a")
  assert.equal(await errorOf({ senderUserId: "user_a", body: "   " }), "That conversation is not available.",
    "a block still hides the thread before the body is judged")
  assert.deepEqual(await chatService.repository.listMessages("thread_one"), [])
})

test("a leased dispatch that waited renews its lease, and one whose lease the worker took is delivered once, by the worker", async () => {
  const store = createInMemoryChatStore()
  const repository = createInMemoryChatRepository(store)
  const renewals: boolean[] = []
  const renewDeliveryLease = repository.renewDeliveryLease.bind(repository)
  repository.renewDeliveryLease = async (...args) => {
    const renewed = await renewDeliveryLease(...args)
    renewals.push(renewed)
    return renewed
  }
  // The first message is delivered and completed, but its dispatch keeps the
  // thread's chain busy afterwards, so the next sends are leased and wait.
  let releaseFirst!: () => void
  const firstCompletionGate = new Promise<void>((resolve) => { releaseFirst = resolve })
  const completeDelivery = repository.completeDelivery.bind(repository)
  repository.completeDelivery = async (messageId, ...rest) => {
    await completeDelivery(messageId, ...rest)
    if (messageId === "message_1") await firstCompletionGate
  }
  let nextMessageId = 0
  const chatService = createChatService({ repository, idFactory: () => `message_${++nextMessageId}` })
  await createThread(chatService)
  const delivered: string[] = []
  const options = {
    chatService,
    safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) {
        if (event.type === "chat.message_received") delivered.push(event.payload.messageId)
      },
      hasUserConnections: () => true
    } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  }
  const delivery = createChatMessageDeliveryService({ ...options, leaseRenewAfterMs: 200 })
  await delivery.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "first" })
  await waitFor(() => store.deliveryJobs.get("message_1")?.completed === true)
  await delivery.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "second" })
  await delivery.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "third" })
  assert.ok(store.deliveryJobs.get("message_2")?.leaseToken, "nothing undelivered is ahead, so the send leased it")
  // The second job's lease runs out while it waits: the worker of another
  // process (its own chat service and dispatch chains) claims and delivers it.
  const worker = createChatMessageDeliveryService({ ...options, chatService: createChatService({ repository }), connectionManager: {
    async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) {
      if (event.type === "chat.message_received") delivered.push(`worker:${event.payload.messageId}`)
    },
    hasUserConnections: () => true
  } as unknown as ConnectionManager })
  const job = store.deliveryJobs.get("message_2")!
  store.deliveryJobs.set("message_2", { ...job, availableAt: Date.now() - 1 })
  // Message 3 was sent behind the undelivered message 2, so it was not
  // leased: the worker's tick drains the thread in order.
  await worker.dispatchDue(new Date())
  assert.deepEqual(delivered, ["message_1", "worker:message_2", "worker:message_3"])
  await new Promise<void>((resolve) => setTimeout(resolve, 300))
  releaseFirst()
  await new Promise<void>((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(delivered, ["message_1", "worker:message_2", "worker:message_3"], "nothing is delivered again inline")
  assert.deepEqual(renewals, [false], "the waiting job renews first; the lost lease is not used")
  assert.equal(store.deliveryJobs.get("message_3")?.completed, true)
})

test("a leased dispatch that waited behind its thread renews its lease and delivers", async () => {
  const store = createInMemoryChatStore()
  const repository = createInMemoryChatRepository(store)
  const renewals: boolean[] = []
  const renewDeliveryLease = repository.renewDeliveryLease.bind(repository)
  repository.renewDeliveryLease = async (...args) => {
    const renewed = await renewDeliveryLease(...args)
    renewals.push(renewed)
    return renewed
  }
  let releaseFirst!: () => void
  const firstCompletionGate = new Promise<void>((resolve) => { releaseFirst = resolve })
  const completeDelivery = repository.completeDelivery.bind(repository)
  repository.completeDelivery = async (messageId, ...rest) => {
    await completeDelivery(messageId, ...rest)
    if (messageId === "message_1") await firstCompletionGate
  }
  let nextMessageId = 0
  const chatService = createChatService({ repository, idFactory: () => `message_${++nextMessageId}` })
  await createThread(chatService)
  const delivered: string[] = []
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService: createSafetyService(),
    connectionManager: {
      async sendToUsersDurably(_userIds: readonly string[], event: ServerEvent) {
        if (event.type === "chat.message_received") delivered.push(event.payload.messageId)
      },
      hasUserConnections: () => true
    } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService,
    leaseRenewAfterMs: 200
  })
  await delivery.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "first" })
  await waitFor(() => store.deliveryJobs.get("message_1")?.completed === true)
  await delivery.sendMessage({ senderUserId: "user_a", threadId: "thread_one", body: "second" })
  await new Promise<void>((resolve) => setTimeout(resolve, 300))
  releaseFirst()
  await waitFor(() => delivered.length === 2)
  assert.deepEqual(delivered, ["message_1", "message_2"])
  assert.deepEqual(renewals, [true])
  await waitFor(() => store.deliveryJobs.get("message_2")?.completed === true)
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
