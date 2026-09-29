import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { createChatService } from "../chat/chatService"
import { ChatDeliveryBlockedError, createChatMessageDeliveryService } from "../chat/chatMessageDeliveryService"
import { createSafetyService } from "../safety/safetyService"
import type { ConnectionManager } from "../realtime/connectionManager"
import type { NotificationService } from "../notifications/notificationService"

test("PostgreSQL chat aggregate rolls back preview/outbox failures and recovers durable delivery", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1"
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const repository = createPostgresChatRepository(pool)
  const threadId = `thread_${randomUUID()}`
  let next = 0
  const chatService = createChatService({ repository, idFactory: () => `message_${threadId}_${++next}` })
  try {
    await chatService.createThread({ threadId, miniRoomId: "room", participantUserIds: ["user_a", "user_b"],
      participants: [{ userId: "user_a" }, { userId: "user_b" }] })
    await pool.query(`CREATE FUNCTION test_chat_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected chat write failure'; END $$`)
    for (const table of ["blumi_chat_threads", "blumi_chat_delivery_outbox"]) {
      await pool.query(`CREATE TRIGGER test_chat_fail BEFORE INSERT OR UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION test_chat_fail_write()`)
      await assert.rejects(chatService.sendMessageIdempotently("user_a", threadId, "hello", "retry-client-001"), /injected chat write failure/)
      assert.equal((await repository.listMessages(threadId)).length, 0)
      assert.equal((await repository.findThread(threadId))?.lastMessage, undefined)
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM blumi_chat_delivery_outbox")).rows[0].count, 0)
      await pool.query(`DROP TRIGGER test_chat_fail ON ${table}`)
    }
    const sent = await chatService.sendMessageIdempotently("user_a", threadId, "hello", "retry-client-001")
    assert.equal(sent.created, true)
    const repeated = await chatService.sendMessageIdempotently("user_a", threadId, "hello", "retry-client-001")
    assert.equal(repeated.created, false)
    assert.equal(repeated.message.messageId, sent.message.messageId)
    assert.equal((await repository.findThread(threadId))?.lastMessage?.messageId, sent.message.messageId)
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM blumi_chat_delivery_outbox")).rows[0].count, 1)
    let failEnqueue = true
    let enqueued = 0
    const options = {
      chatService, safetyService: createSafetyService(),
      connectionManager: { async sendToUsersDurably() {}, hasUserConnections: () => false } as unknown as ConnectionManager,
      notificationService: { async sendPushToUser() {
        if (failEnqueue) throw new Error("notification DB unavailable")
        enqueued += 1
      } } as unknown as NotificationService
    }
    await createChatMessageDeliveryService(options).dispatchDue(new Date(Date.now() + 1000))
    assert.equal((await pool.query("SELECT completed_at FROM blumi_chat_delivery_outbox")).rows[0].completed_at, null)
    failEnqueue = false
    const restarted = createChatMessageDeliveryService({ ...options, chatService: createChatService({ repository: createPostgresChatRepository(pool) }) })
    await restarted.dispatchDue(new Date(Date.now() + 60_000))
    await restarted.dispatchDue(new Date(Date.now() + 120_000))
    assert.equal(enqueued, 1)
    assert.ok((await pool.query("SELECT completed_at FROM blumi_chat_delivery_outbox")).rows[0].completed_at)
    await pool.query("DROP FUNCTION test_chat_fail_write()")
  } finally { await pool.end() }
})

test("PostgreSQL ACK-loss retry after block returns the committed row without another outbox row", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1"
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const threadId = `thread_${randomUUID()}`
  const clientMessageId = "client-ack-blocked-001"
  const repository = createPostgresChatRepository(pool)
  const chatService = createChatService({ repository, idFactory: () => `message_${threadId}` })
  const safetyService = createSafetyService()
  let fanoutCount = 0
  let signalFanout!: () => void
  const fanout = new Promise<void>((resolve) => { signalFanout = resolve })
  const delivery = createChatMessageDeliveryService({
    chatService,
    safetyService,
    connectionManager: {
      async sendToUsersDurably() { fanoutCount += 1; signalFanout() },
      hasUserConnections: () => true
    } as unknown as ConnectionManager,
    notificationService: { async sendPushToUser() {} } as unknown as NotificationService
  })
  try {
    await chatService.createThread({
      threadId,
      miniRoomId: `room_${threadId}`,
      participantUserIds: ["user_a", "user_b"],
      participants: [{ userId: "user_a" }, { userId: "user_b" }]
    })

    // The server persists before ACK; fanout is best-effort and may instead be
    // picked up by the durable worker. Dispatch deterministically before the
    // later block so this test isolates the lost-ACK idempotency contract.
    const original = await delivery.sendMessage({
      senderUserId: "user_a", threadId, body: "committed before lost ACK", clientMessageId
    })
    await delivery.dispatchDue(new Date(Date.now() + 1_000))
    await fanout
    await new Promise<void>((resolve) => setImmediate(resolve))
    await safetyService.blockUser("user_b", "user_a")

    const retry = await delivery.sendMessage({
      senderUserId: "user_a", threadId, body: "committed before lost ACK", clientMessageId
    })
    assert.equal(retry.created, false)
    assert.deepEqual(retry.message, original.message)
    await assert.rejects(
      delivery.sendMessage({
        senderUserId: "user_a", threadId, body: "new blocked message",
        clientMessageId: "client-new-after-block-001"
      }),
      ChatDeliveryBlockedError
    )

    const rows = await pool.query(
      `SELECT message_id FROM blumi_chat_messages
        WHERE thread_id = $1 AND sender_user_id = $2 AND client_message_id = $3`,
      [threadId, "user_a", clientMessageId]
    )
    const outbox = await pool.query(
      `SELECT message_id FROM blumi_chat_delivery_outbox WHERE message_id = $1`,
      [original.message.messageId]
    )
    assert.equal(rows.rows.length, 1)
    assert.equal(outbox.rows.length, 1)
    assert.equal(fanoutCount, 1)
  } finally { await pool.end() }
})
