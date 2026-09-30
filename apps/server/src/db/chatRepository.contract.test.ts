import assert from "node:assert/strict"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import { createInMemoryChatRepository, type ChatRepository } from "../chat/chatRepository"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"

type Backend = RepositoryContractBackend<ChatRepository>

function thread(backend: Backend, suffix: string, createdAt: string, users?: [string, string]): ChatThread {
  const participantUserIds = users ?? [backend.id("user_a"), backend.id("user_b")]
  return {
    threadId: backend.id(`thread_${suffix}`),
    miniRoomId: backend.id(`room_${suffix}`),
    participantUserIds,
    participants: [
      { userId: participantUserIds[0], displayName: "Ada" },
      { userId: participantUserIds[1], displayName: "Bo" }
    ],
    createdAt
  }
}

function message(threadValue: ChatThread, id: string, sentAt: string, body = `body ${id}`, sender = threadValue.participantUserIds[0]): ChatMessage {
  return { messageId: `${threadValue.threadId}_${id}`, threadId: threadValue.threadId, senderUserId: sender, body, sentAt }
}

runRepositoryContract<ChatRepository>({
  name: "chat repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryChatRepository(),
    postgres: (pool) => createPostgresChatRepository(pool)
  },
  cases: {
    "saveThread is create-only: a repeated save never changes the thread or its participants": async (backend) => {
      const original = thread(backend, "one", "2026-09-30T10:00:00.000Z")
      await backend.repository.saveThread(original)
      await backend.repository.saveThread({
        ...original,
        miniRoomId: backend.id("room_other"),
        participantUserIds: [original.participantUserIds[0], backend.id("intruder")],
        participants: [
          { userId: original.participantUserIds[0], displayName: "Renamed" },
          { userId: backend.id("intruder"), displayName: "Intruder" }
        ],
        createdAt: "2026-09-30T12:00:00.000Z"
      })
      const saved = await backend.repository.findThread(original.threadId)
      assert.equal(saved?.miniRoomId, original.miniRoomId)
      assert.equal(saved?.createdAt, original.createdAt)
      assert.deepEqual(saved?.participantUserIds, original.participantUserIds)
      assert.deepEqual(saved?.participants.map((participant) => participant.displayName), ["Ada", "Bo"])
      assert.deepEqual((await backend.repository.listThreads(backend.id("intruder"))), [])
      assert.deepEqual(
        [...await backend.repository.findExistingThreadIds([original.threadId, backend.id("absent")])],
        [original.threadId]
      )
    },

    "createMessage is idempotent per thread, sender and client message ID": async (backend) => {
      const chat = thread(backend, "idem", "2026-09-30T10:00:00.000Z")
      await backend.repository.saveThread(chat)
      const first = await backend.repository.createMessage(message(chat, "m1", "2026-09-30T10:01:00.000Z", "hello"), "client-1")
      assert.equal(first.created, true)

      const retry = await backend.repository.createMessage(message(chat, "m1_retry", "2026-09-30T10:02:00.000Z", "hello"), "client-1")
      assert.deepEqual([retry.created, retry.message.messageId, retry.idempotencyConflict], [false, first.message.messageId, undefined])

      const changed = await backend.repository.createMessage(message(chat, "m1_changed", "2026-09-30T10:03:00.000Z", "changed"), "client-1")
      assert.deepEqual([changed.created, changed.message.body, changed.idempotencyConflict], [false, "hello", true])

      const otherSender = await backend.repository.createMessage(
        message(chat, "m2", "2026-09-30T10:04:00.000Z", "hello", chat.participantUserIds[1]), "client-1")
      assert.equal(otherSender.created, true, "the key is scoped to the sender")

      const found = await backend.repository.findMessageByClientMessageId(chat.threadId, chat.participantUserIds[0], "client-1")
      assert.equal(found?.messageId, first.message.messageId)
      assert.equal(await backend.repository.findMessageByClientMessageId(chat.threadId, chat.participantUserIds[0], "client-x"), null)
      assert.deepEqual((await backend.repository.listMessages(chat.threadId)).map((item) => item.messageId),
        [first.message.messageId, otherSender.message.messageId])
      assert.equal((await backend.repository.findThread(chat.threadId))?.lastMessage?.messageId, otherSender.message.messageId)

      const jobs = await backend.repository.claimDeliveries({ now: new Date("2100-01-01T00:00:00.000Z"), limit: 10, leaseMs: 1000 })
      assert.deepEqual(jobs.map((job) => job.message.messageId).sort(),
        [first.message.messageId, otherSender.message.messageId].sort(), "one outbox job per created message")
    },

    "a late message never replaces a newer thread preview": async (backend) => {
      const chat = thread(backend, "preview", "2026-09-30T10:00:00.000Z")
      await backend.repository.saveThread(chat)
      const newer = message(chat, "newer", "2026-09-30T10:05:00.000Z")
      await backend.repository.createMessage(newer)
      await backend.repository.createMessage(message(chat, "older", "2026-09-30T10:01:00.000Z"))
      assert.equal((await backend.repository.findThread(chat.threadId))?.lastMessage?.messageId, newer.messageId)
    },

    "message pages are ordered by sentAt then messageId and page backwards without gaps": async (backend) => {
      const chat = thread(backend, "pages", "2026-09-30T10:00:00.000Z")
      await backend.repository.saveThread(chat)
      const sameInstant = "2026-09-30T10:02:00.000Z"
      const inserted = [
        message(chat, "e", "2026-09-30T10:03:00.000Z"),
        message(chat, "c", sameInstant),
        message(chat, "a", "2026-09-30T10:01:00.000Z"),
        message(chat, "d", sameInstant),
        message(chat, "b", sameInstant)
      ]
      for (const item of inserted) await backend.repository.createMessage(item)
      const expected = ["a", "b", "c", "d", "e"].map((id) => `${chat.threadId}_${id}`)
      const ids = (items: ChatMessage[]) => items.map((item) => item.messageId)

      assert.deepEqual(ids(await backend.repository.listMessages(chat.threadId)), expected)
      const newest = await backend.repository.listMessages(chat.threadId, { limit: 2 })
      assert.deepEqual(ids(newest), expected.slice(3))
      const middle = await backend.repository.listMessages(chat.threadId, { limit: 2, beforeMessageId: newest[0]!.messageId })
      assert.deepEqual(ids(middle), expected.slice(1, 3))
      const oldest = await backend.repository.listMessages(chat.threadId, { limit: 2, beforeMessageId: middle[0]!.messageId })
      assert.deepEqual(ids(oldest), expected.slice(0, 1))
      assert.deepEqual(ids(await backend.repository.listMessages(chat.threadId, { limit: 2, beforeMessageId: oldest[0]!.messageId })), [])
      assert.deepEqual(ids(await backend.repository.listMessages(chat.threadId, { limit: 2, beforeMessageId: "unknown" })),
        expected.slice(3), "an unknown cursor falls back to the newest page")
    },

    "thread pages are newest first with a stable createdAt/threadId cursor and per-viewer unread counts": async (backend) => {
      const viewer = backend.id("viewer")
      const createdAt = "2026-09-30T10:00:00.000Z"
      const threads = ["t1", "t2", "t3"].map((suffix) => thread(backend, suffix, createdAt, [viewer, backend.id(`peer_${suffix}`)]))
      const older = thread(backend, "t0", "2026-09-29T10:00:00.000Z", [viewer, backend.id("peer_t0")])
      for (const item of [...threads, older]) await backend.repository.saveThread(item)
      await backend.repository.createMessage(message(threads[0]!, "in1", "2026-09-30T10:01:00.000Z", "hi", threads[0]!.participantUserIds[1]))
      await backend.repository.createMessage(message(threads[0]!, "in2", "2026-09-30T10:02:00.000Z", "hi", threads[0]!.participantUserIds[1]))
      await backend.repository.createMessage(message(threads[0]!, "out", "2026-09-30T10:03:00.000Z", "hi", viewer))
      await backend.repository.markThreadRead(threads[0]!.threadId, viewer, "2026-09-30T10:01:30.000Z")
      await backend.repository.markThreadRead(threads[0]!.threadId, viewer, "2026-09-30T09:00:00.000Z")

      const first = await backend.repository.listThreadsPage(viewer, { limit: 2 })
      const expectedOrder = [...threads.map((item) => item.threadId)].sort().reverse()
      assert.deepEqual(first.threads.map((item) => item.threadId), expectedOrder.slice(0, 2))
      assert.ok(first.nextCursor)
      const second = await backend.repository.listThreadsPage(viewer, { limit: 2, cursor: first.nextCursor ?? undefined })
      assert.deepEqual(second.threads.map((item) => item.threadId), [expectedOrder[2], older.threadId])
      assert.equal(second.nextCursor, null)

      const all = await backend.repository.listThreads(viewer)
      const unread = all.find((item) => item.threadId === threads[0]!.threadId)
      assert.equal(unread?.unreadCount, 1, "read marker never moves backwards")
      assert.equal(unread?.lastReadAt, "2026-09-30T10:01:30.000Z")
      assert.equal(all.find((item) => item.threadId === older.threadId)?.unreadCount, 0)
    },

    "a thread cursor continues with a different page size without gaps or repeats": async (backend) => {
      // The chat service tops up a page past threads hidden by a block by
      // reading on from the cursor with the remaining size.
      const viewer = backend.id("viewer")
      const threads = ["a", "b", "c", "d", "e"].map((suffix, index) =>
        thread(backend, suffix, `2026-09-30T10:0${index}:00.000Z`, [viewer, backend.id(`peer_${suffix}`)]))
      for (const item of threads) await backend.repository.saveThread(item)
      const newestFirst = threads.map((item) => item.threadId).reverse()

      const first = await backend.repository.listThreadsPage(viewer, { limit: 2 })
      const second = await backend.repository.listThreadsPage(viewer, { limit: 1, cursor: first.nextCursor! })
      const third = await backend.repository.listThreadsPage(viewer, { limit: 5, cursor: second.nextCursor! })
      assert.deepEqual([...first.threads, ...second.threads, ...third.threads].map((item) => item.threadId), newestFirst)
      assert.equal(third.nextCursor, null)
    }
  }
})
