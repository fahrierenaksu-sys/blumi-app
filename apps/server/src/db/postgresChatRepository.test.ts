import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createPostgresChatRepository } from "./postgresChatRepository"

interface QueryCall {
  text: string
  values?: readonly unknown[]
}

function createFakePool(handler: (text: string) => Record<string, unknown>[]) {
  const calls: QueryCall[] = []
  return {
    calls,
    pool: {
      async query(text: string, values?: readonly unknown[]) {
        calls.push({ text, values })
        return { rows: handler(text) }
      }
    }
  }
}

test("chat duplicate lookup keeps same-body retries and flags changed-body idempotency conflicts", async () => {
  const fake = createFakePool((text) => text.includes("INSERT INTO blumi_chat_messages")
    ? []
    : [{
      message_id: "message_existing", thread_id: "thread_one", sender_user_id: "user_a",
      body: "original", sent_at: "2026-06-27T10:00:00.000Z"
    }])
  const repository = createPostgresChatRepository(fake.pool)
  const sameBodyRetry = await repository.createMessage({ messageId: "unused", threadId: "thread_one", senderUserId: "user_a", body: "original", sentAt: "2026-06-27T10:00:00.000Z" }, "client-001")
  const changedBodyRetry = await repository.createMessage({ messageId: "unused_again", threadId: "thread_one", senderUserId: "user_a", body: "changed", sentAt: "2026-06-27T10:00:01.000Z" }, "client-001")
  assert.equal(sameBodyRetry.created, false)
  assert.notEqual(sameBodyRetry.idempotencyConflict, true)
  assert.equal(sameBodyRetry.message.messageId, "message_existing")
  assert.equal(sameBodyRetry.message.body, "original")
  assert.equal(changedBodyRetry.created, false)
  assert.equal(changedBodyRetry.idempotencyConflict, true)
  assert.equal(changedBodyRetry.message.messageId, "message_existing")
  assert.equal(changedBodyRetry.message.body, "original")
  assert.match(fake.calls[3].text, /saved\.body = \$4/)
  assert.deepEqual(fake.calls[3].values, ["thread_one", "user_a", "client-001", "changed"])
  assert.match(fake.calls[1].text, /INSERT INTO blumi_chat_delivery_outbox/)
  assert.match(fake.calls[1].text, /ON CONFLICT \(message_id\) DO NOTHING/)
})

test("chat delivery claims use leases and completion/retry are fenced", async () => {
  const fake = createFakePool(() => [{ message_id: "message_one", thread_id: "thread_one",
    sender_user_id: "user_a", body: "hello", sent_at: "2026-06-27T10:00:00.000Z", lease_token: "lease", attempt_count: 2 }])
  const repository = createPostgresChatRepository(fake.pool)
  const now = new Date("2026-06-27T10:00:00.000Z")
  const [job] = await repository.claimDeliveries({ now, limit: 50, leaseMs: 30000 })
  assert.equal(job.leaseToken, "lease")
  assert.equal(job.attempt, 2)
  assert.match(fake.calls[0].text, /FOR UPDATE SKIP LOCKED/)
  await repository.completeDelivery(job.message.messageId, job.leaseToken, now)
  await repository.retryDelivery(job.message.messageId, job.leaseToken, now)
  for (const call of fake.calls.slice(1)) assert.match(call.text, /lease_token = \$2 AND completed_at IS NULL/)
  await repository.advanceReadCursor({ threadId: "thread_one", userId: "user_b", readAt: now.toISOString() })
  assert.deepEqual(fake.calls[3].values, ["thread_one", "user_b", now])
})

// `m.delivered_at AS last_delivered_at` is migration 042's message column under an alias.
const MIGRATION_070_OBJECTS = /(?<!AS )\blast_delivered_at|last_delivered_message_id|last_read_message_id|blumi_chat_privacy_preferences/

test("before migration 070 no chat query names a 070 column or table and receipts read as off", async () => {
  const fake = createFakePool((text) => text.includes("RETURNING last_read_at") || text.includes("RETURNING participant.last_read_at")
    ? [{ last_read_at: "2026-10-01T10:00:00.000Z" }]
    : [])
  const repository = createPostgresChatRepository(fake.pool)

  assert.equal(await repository.supportsReceipts(), false)
  assert.equal(await repository.advanceDeliveredCursor({ threadId: "thread_one", userId: "user_b", upToMessageId: "message_one" }), null)
  assert.deepEqual(await repository.listReceiptParticipants(["thread_one"]), [])
  assert.deepEqual(await repository.getChatPreferences("user_b"), { readReceiptsEnabled: false })
  await assert.rejects(repository.saveChatPreferences("user_b", { readReceiptsEnabled: true }, new Date()), /070/)
  assert.equal(fake.calls.length, 0, "receipt-only methods answer without a query")

  // The read cursor keeps working on the pre-070 schema, with or without a message.
  assert.deepEqual(
    await repository.advanceReadCursor({ threadId: "thread_one", userId: "user_b", readAt: "2026-10-01T10:00:00.000Z" }),
    { readAt: "2026-10-01T10:00:00.000Z" }
  )
  assert.deepEqual(
    await repository.advanceReadCursor({ threadId: "thread_one", userId: "user_b", upToMessageId: "message_one" }),
    { readAt: "2026-10-01T10:00:00.000Z" }
  )
  assert.match(fake.calls[0]!.text, /GREATEST\(last_read_at, \$3::timestamptz\)/)
  assert.match(fake.calls[1]!.text, /GREATEST\(participant\.last_read_at, target\.sent_at\)/)
  assert.match(fake.calls[1]!.text, /sender_user_id <> \$2/)

  await repository.listThreadsPage("user_b")
  await repository.findThread("thread_one")
  await repository.listMessages("thread_one", { limit: 20 })
  await repository.claimDeliveries({ now: new Date(), limit: 1, leaseMs: 1000 })
  for (const call of fake.calls) assert.doesNotMatch(call.text, MIGRATION_070_OBJECTS)
})

test("after migration 070 cursor moves compare (sent_at, message_id) rows in one statement", async () => {
  const fake = createFakePool(() => [])
  const repository = createPostgresChatRepository(fake.pool, {
    receiptSchema: { async isReady() { return true }, peek() { return true } }
  })

  assert.equal(await repository.advanceDeliveredCursor({ threadId: "thread_one", userId: "user_b", upToMessageId: "message_one" }), null)
  assert.equal(await repository.advanceReadCursor({ threadId: "thread_one", userId: "user_b", upToMessageId: "message_one" }), null)
  assert.equal(fake.calls.length, 2)
  assert.match(fake.calls[0]!.text, /\(participant\.last_delivered_at, participant\.last_delivered_message_id\)\s+< \(target\.sent_at, target\.message_id\)/)
  assert.match(fake.calls[0]!.text, /sender_user_id <> \$2/)
  assert.deepEqual(fake.calls[0]!.values, ["thread_one", "user_b", "message_one"])
  assert.match(fake.calls[1]!.text, /participant\.last_read_message_id < target\.message_id/)
})

test("postgres chat repository saves threads with ordered participants", async () => {
  const fake = createFakePool(() => [])
  const repository = createPostgresChatRepository(fake.pool)

  await repository.saveThread({
    threadId: "thread_one",
    miniRoomId: "room_one",
    participantUserIds: ["user_a", "user_b"],
    participants: [
      { userId: "user_a", displayName: "A" },
      { userId: "user_b", displayName: "B" }
    ],
    createdAt: "2026-06-27T10:00:00.000Z"
  })

  assert.equal(fake.calls.length, 1)
  assert.match(fake.calls[0].text, /INSERT INTO blumi_chat_threads/)
  assert.match(fake.calls[0].text, /ON CONFLICT \(thread_id\) DO NOTHING/)
  assert.match(fake.calls[0].text, /INSERT INTO blumi_chat_thread_participants/)
  assert.match(fake.calls[0].text, /FROM inserted_thread/)
  assert.doesNotMatch(fake.calls[0].text, /DO UPDATE/)
  assert.deepEqual(fake.calls[0].values?.slice(0, 2), [
    "thread_one",
    "room_one"
  ])
  assert.deepEqual(fake.calls[0].values?.slice(4), [
    ["user_a", "user_b"],
    ["A", "B"]
  ])
})

test("match sync checks existing chat IDs in one parameterized query", async () => {
  const fake = createFakePool(() => [{ thread_id: "thread_match_one" }])
  const repository = createPostgresChatRepository(fake.pool)
  const ids = await repository.findExistingThreadIds(["thread_match_one", "thread_match_two"])
  assert.deepEqual([...ids], ["thread_match_one"])
  assert.match(fake.calls[0]?.text ?? "", /thread_id = ANY\(\$1::text\[\]\)/)
  assert.deepEqual(fake.calls[0]?.values, [["thread_match_one", "thread_match_two"]])
})

test("postgres chat repository maps listed threads with latest message", async () => {
  const fake = createFakePool((text) => {
    if (text.includes("FROM blumi_chat_thread_participants")) {
      return [
        {
          thread_id: "thread_one", user_id: "user_a",
          display_name: "A",
          avatar_preset_id: "avatar_v2_body_default",
          avatar_selection: DEFAULT_FEMALE_AVATAR_LOADOUT,
          avatar_revision: 1
        },
        {
          thread_id: "thread_one", user_id: "user_b",
          display_name: "B",
          avatar_preset_id: "avatar_v2_body_default",
          avatar_selection: DEFAULT_FEMALE_AVATAR_LOADOUT,
          avatar_revision: 2
        }
      ]
    }
    return [
      {
        thread_id: "thread_one",
        mini_room_id: "room_one",
        created_at: "2026-06-27T09:00:00.000Z",
        last_message_id: "message_one",
        last_sender_user_id: "user_b",
        last_body: "hello",
        last_sent_at: "2026-06-27T10:00:00.000Z",
        last_delivered_at: "2026-06-27T10:00:01.000Z",
        last_read_at: "2026-06-27T10:00:02.000Z",
        last_edited_at: "2026-06-27T10:01:00.000Z"
      }
    ]
  })
  const repository = createPostgresChatRepository(fake.pool)

  const threads = await repository.listThreads("user_a")

  assert.equal(threads.length, 1)
  assert.deepEqual(threads[0].participantUserIds, ["user_a", "user_b"])
  assert.equal(threads[0].lastMessage?.body, "hello")
  assert.equal(
    threads[0].lastMessage?.deliveredAt,
    "2026-06-27T10:00:01.000Z"
  )
  assert.equal(threads[0].lastMessage?.readAt, "2026-06-27T10:00:02.000Z")
  assert.equal(threads[0].lastMessage?.editedAt, "2026-06-27T10:01:00.000Z")
  assert.equal(threads[0].participants[1].avatar?.revision, 2)
  assert.match(fake.calls[0].text, /ORDER BY t.created_at DESC, t.thread_id DESC LIMIT \$4/)
  assert.deepEqual(fake.calls[0].values, ["user_a", null, null, 51])
})

test("postgres chat repository groups participants by thread in a two-query page", async () => {
  const fake = createFakePool((text) => text.includes("FROM blumi_chat_thread_participants")
    ? [
        { thread_id: "thread_two", user_id: "user_a", participant_order: 0 },
        { thread_id: "thread_one", user_id: "user_a", participant_order: 0 },
        { thread_id: "thread_one", user_id: "user_b", participant_order: 1 },
        { thread_id: "thread_two", user_id: "user_c", participant_order: 1 }
      ]
    : [
        { thread_id: "thread_two", mini_room_id: "room_two", created_at: "2026-06-27T10:00:00.000Z" },
        { thread_id: "thread_one", mini_room_id: "room_one", created_at: "2026-06-27T09:00:00.000Z" }
      ])
  const repository = createPostgresChatRepository(fake.pool)

  const page = await repository.listThreadsPage("user_a")

  assert.deepEqual(page.threads.map((thread) => thread.participantUserIds), [
    ["user_a", "user_c"],
    ["user_a", "user_b"]
  ])
  assert.equal(fake.calls.length, 2)
})

test("postgres chat repository keeps a legacy malformed avatar optional", async () => {
  const fake = createFakePool((text) => {
    if (text.includes("FROM blumi_chat_thread_participants")) {
      return [
        {
          thread_id: "thread_one", user_id: "user_a",
          display_name: "A",
          avatar_preset_id: "avatar_v2_body_default",
          avatar_selection: DEFAULT_FEMALE_AVATAR_LOADOUT,
          avatar_revision: 1
        },
        {
          thread_id: "thread_one", user_id: "user_b",
          display_name: "B",
          avatar_preset_id: "avatar_v2_body_default",
          avatar_selection: {
            ...DEFAULT_FEMALE_AVATAR_LOADOUT,
            faceId: "legacy_removed_face"
          },
          avatar_revision: 2
        }
      ]
    }
    return [
      {
        thread_id: "thread_one",
        mini_room_id: "room_one",
        created_at: "2026-06-27T09:00:00.000Z",
        last_message_id: null
      }
    ]
  })
  const repository = createPostgresChatRepository(fake.pool)

  const threads = await repository.listThreads("user_a")

  assert.equal(threads[0]?.participants[0]?.avatar?.revision, 1)
  assert.equal(threads[0]?.participants[1]?.avatar, undefined)
})

test("postgres chat repository stores messages through an atomic idempotency key", async () => {
  const fake = createFakePool((text) => {
    if (text.includes("RETURNING message_id")) {
      return [
        {
          message_id: "message_one",
          thread_id: "thread_one",
          sender_user_id: "user_a",
          body: "hello",
          sent_at: "2026-06-27T10:00:00.000Z"
        }
      ]
    }
    if (text.includes("SELECT message_id")) {
      return [
        {
          message_id: "message_one",
          thread_id: "thread_one",
          sender_user_id: "user_a",
          body: "hello",
          sent_at: "2026-06-27T10:00:00.000Z"
        }
      ]
    }
    return []
  })
  const repository = createPostgresChatRepository(fake.pool)

  const saved = await repository.createMessage({
    messageId: "message_one",
    threadId: "thread_one",
    senderUserId: "user_a",
    body: "hello",
    sentAt: "2026-06-27T10:00:00.000Z"
  }, "client-message-001")
  const messages = await repository.listMessages("thread_one")

  assert.match(fake.calls[0].text, /INSERT INTO blumi_chat_messages/)
  assert.match(fake.calls[0].text, /UPDATE blumi_chat_threads/)
  assert.match(fake.calls[0].text, /INSERT INTO blumi_chat_delivery_outbox/)
  assert.match(fake.calls[0].text, /ON CONFLICT \(thread_id, sender_user_id, client_message_id\)/)
  assert.match(fake.calls[0].text, /RETURNING message_id/)
  assert.deepEqual(fake.calls[0].values?.slice(0, 4), [
    "message_one",
    "thread_one",
    "user_a",
    "hello"
  ])
  assert.equal(saved.created, true)
  assert.equal(messages[0]?.body, "hello")
  assert.match(fake.calls[1].text, /ORDER BY sent_at ASC/)
})

test("postgres idempotency lookup is a read scoped to thread, sender, and client ID", async () => {
  const fake = createFakePool(() => [{
    message_id: "message_existing", thread_id: "thread_one", sender_user_id: "user_a",
    body: "persisted", sent_at: "2026-06-27T10:00:00.000Z"
  }])
  const repository = createPostgresChatRepository(fake.pool)

  const message = await repository.findMessageByClientMessageId(
    "thread_one", "user_a", "client-message-001"
  )

  assert.equal(message?.messageId, "message_existing")
  assert.equal(message?.body, "persisted")
  assert.match(fake.calls[0].text, /FROM blumi_chat_messages/)
  assert.match(fake.calls[0].text, /thread_id = \$1 AND sender_user_id = \$2 AND client_message_id = \$3/)
  assert.doesNotMatch(fake.calls[0].text, /INSERT INTO|UPDATE blumi_chat_delivery_outbox/)
  assert.deepEqual(fake.calls[0].values, ["thread_one", "user_a", "client-message-001"])
})

test("postgres chat repository only advances a thread preview", async () => {
  const fake = createFakePool(() => [])
  const repository = createPostgresChatRepository(fake.pool)

  await repository.updateThreadLastMessage("thread_one", {
    messageId: "message_new",
    threadId: "thread_one",
    senderUserId: "user_a",
    body: "new",
    sentAt: "2026-06-27T10:01:00.000Z"
  })

  assert.match(fake.calls[0].text, /UPDATE blumi_chat_threads AS thread/)
  assert.match(fake.calls[0].text, /<= \$3/)
  assert.deepEqual(fake.calls[0].values?.slice(0, 2), ["thread_one", "message_new"])
})

test("postgres chat repository projects optional message metadata and keeps legacy rows exact", async () => {
  const rows = [
    {
      message_id: "message_one",
      thread_id: "thread_one",
      sender_user_id: "user_a",
      body: "edited",
      sent_at: "2026-06-27T10:00:00.000Z",
      delivered_at: "2026-06-27T10:00:01.000Z",
      read_at: "2026-06-27T10:00:02.000Z",
      edited_at: "2026-06-27T10:01:00.000Z"
    },
    {
      message_id: "message_two",
      thread_id: "thread_one",
      sender_user_id: "user_b",
      body: "legacy",
      sent_at: "2026-06-27T10:02:00.000Z",
      delivered_at: null,
      read_at: null,
      edited_at: null
    }
  ]
  const fake = createFakePool(() => rows)
  const repository = createPostgresChatRepository(fake.pool)

  const messages = await repository.listMessages("thread_one")

  assert.deepEqual(messages[0], {
    messageId: "message_one",
    threadId: "thread_one",
    senderUserId: "user_a",
    body: "edited",
    sentAt: "2026-06-27T10:00:00.000Z",
    deliveredAt: "2026-06-27T10:00:01.000Z",
    readAt: "2026-06-27T10:00:02.000Z",
    editedAt: "2026-06-27T10:01:00.000Z"
  })
  assert.deepEqual(messages[1], {
    messageId: "message_two",
    threadId: "thread_one",
    senderUserId: "user_b",
    body: "legacy",
    sentAt: "2026-06-27T10:02:00.000Z"
  })
  assert.match(fake.calls[0].text, /delivered_at/)
  assert.match(fake.calls[0].text, /read_at/)
  assert.match(fake.calls[0].text, /edited_at/)
})

test("postgres chat message pagination has a stable timestamp and message-ID order", async () => {
  const fake = createFakePool(() => [])
  const repository = createPostgresChatRepository(fake.pool)

  await repository.listMessages("thread_one", {
    beforeMessageId: "message_cursor",
    limit: 20
  })

  assert.match(fake.calls[0].text, /ORDER BY sent_at DESC, message_id DESC/)
  assert.match(fake.calls[0].text, /message_id < \$2/)
  assert.match(fake.calls[0].text, /ORDER BY sent_at ASC, message_id ASC/)
})
