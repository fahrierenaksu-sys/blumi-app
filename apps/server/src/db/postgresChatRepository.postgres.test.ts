import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { createPostgresSafetyRepository } from "./postgresSafetyRepository"
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
  // Production wiring: the chat send statement reads the same block table.
  const safetyService = createSafetyService({ repository: createPostgresSafetyRepository(pool) })
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

test("PostgreSQL one-statement send: personas, a lost first-insert race, repair of a retried message and a broken thread", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1"
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  const repository = createPostgresChatRepository(pool)
  const scope = randomUUID().slice(0, 8)
  const [sender, persona] = [`user_sender_${scope}`, `user_persona_${scope}`]
  const threadId = `thread_checked_${scope}`
  const send = (messageId: string, body: string, clientMessageId?: string) => repository.sendMessageChecked({
    message: { messageId, threadId, senderUserId: sender, body, sentAt: new Date().toISOString() },
    ...(clientMessageId ? { clientMessageId } : {}),
    leaseUntil: new Date(Date.now() + 30_000)
  })
  try {
    for (const [index, userId] of [sender, persona].entries()) {
      await pool.query(`INSERT INTO blumi_accounts (account_id, user_id, phone_number, created_at, updated_at)
        VALUES ($1, $2, $3, now(), now())`, [`account_${userId}`, userId, `+1555${String(Date.now()).slice(-6)}${index}`])
    }
    await pool.query(`INSERT INTO blumi_test_personas (user_id, greeting, replies) VALUES ($1, 'Selam!', ARRAY['Kahve?', 'Olur'])`, [persona])
    await repository.saveThread({ threadId, miniRoomId: `room_${scope}`, createdAt: new Date().toISOString(),
      participantUserIds: [sender, persona], participants: [{ userId: sender }, { userId: persona }] })

    // The recipient's persona comes back with a created message only.
    const created = await send(`message_${scope}_1`, "hello", "client-checked-001")
    assert.equal(created.outcome, "created")
    assert.deepEqual(created.outcome === "created" ? created.recipientPersonas : [],
      [{ userId: persona, greeting: "Selam!", replies: ["Kahve?", "Olur"] }])

    // A retry repairs a missing outbox row and preview, exactly like createMessage.
    await pool.query("DELETE FROM blumi_chat_delivery_outbox WHERE message_id = $1", [`message_${scope}_1`])
    await pool.query("UPDATE blumi_chat_threads SET last_message_id = NULL, last_message_sent_at = NULL WHERE thread_id = $1", [threadId])
    const retried = await send(`message_${scope}_1b`, "hello", "client-checked-001")
    assert.equal(retried.outcome, "retried")
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM blumi_chat_delivery_outbox WHERE message_id = $1",
      [`message_${scope}_1`])).rows[0].count, 1)
    assert.equal((await repository.findThread(threadId))?.lastMessage?.messageId, `message_${scope}_1`)

    // A first insert of the same client message ID that commits after this
    // statement's snapshot is only seen as a conflict: the caller goes stepwise.
    const holder = await pool.connect()
    try {
      await holder.query("BEGIN")
      await holder.query(`INSERT INTO blumi_chat_messages (message_id, thread_id, sender_user_id, body, sent_at, client_message_id)
        VALUES ($1, $2, $3, 'racing', now(), 'client-checked-race')`, [`message_${scope}_race_a`, threadId, sender])
      const racing = send(`message_${scope}_race_b`, "racing", "client-checked-race")
      await new Promise((resolve) => setTimeout(resolve, 100))
      await holder.query("COMMIT")
      assert.deepEqual(await racing, { outcome: "raced" })
    } finally {
      holder.release()
    }

    // A thread whose participant rows are not two fails like findThread, writing nothing.
    await pool.query("DELETE FROM blumi_chat_thread_participants WHERE thread_id = $1 AND user_id = $2", [threadId, persona])
    await assert.rejects(send(`message_${scope}_broken`, "broken"), /missing participants/)
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM blumi_chat_messages WHERE message_id = $1",
      [`message_${scope}_broken`])).rows[0].count, 0)
  } finally { await pool.end() }
})
