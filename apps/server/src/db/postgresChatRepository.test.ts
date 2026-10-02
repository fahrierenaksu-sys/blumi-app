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

  await repository.listThreadsPage("user_b")
  await repository.findThread("thread_one")
  await repository.listMessages("thread_one", { limit: 20 })
  await repository.claimDeliveries({ now: new Date(), limit: 1, leaseMs: 1000 })
  for (const call of fake.calls) assert.doesNotMatch(call.text, MIGRATION_070_OBJECTS)
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
})

test("postgres chat repository groups participants by thread", async () => {
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
})
