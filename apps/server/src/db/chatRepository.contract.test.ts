import assert from "node:assert/strict"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import { createInMemoryChatRepository, type ChatRepository } from "../chat/chatRepository"
import { createChatReceiptSchemaProbe } from "../chat/chatReceiptSchema"
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
    // The gate database has every migration, so the ledger probe finds 070.
    postgres: (pool) => createPostgresChatRepository(pool, { receiptSchema: createChatReceiptSchemaProbe(pool) })
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

    "unread totals per sender follow the same read cursor as the thread list (push badge)": async (backend) => {
      const viewer = backend.id("viewer")
      const ada = backend.id("ada")
      const bo = backend.id("bo")
      const withAda = thread(backend, "ada", "2026-09-30T10:00:00.000Z", [viewer, ada])
      const withBo = thread(backend, "bo", "2026-09-30T10:00:00.000Z", [viewer, bo])
      const others = thread(backend, "others", "2026-09-30T10:00:00.000Z", [ada, bo])
      for (const item of [withAda, withBo, others]) await backend.repository.saveThread(item)
      assert.deepEqual(await backend.repository.countUnreadMessagesBySender(viewer), [])
      await backend.repository.createMessage(message(withAda, "a1", "2026-09-30T10:01:00.000Z", "hi", ada))
      await backend.repository.createMessage(message(withAda, "a2", "2026-09-30T10:02:00.000Z", "hi", ada))
      await backend.repository.createMessage(message(withAda, "mine", "2026-09-30T10:03:00.000Z", "hi", viewer))
      await backend.repository.createMessage(message(withBo, "b1", "2026-09-30T10:01:00.000Z", "hi", bo))
      await backend.repository.createMessage(message(others, "x", "2026-09-30T10:01:00.000Z", "hi", ada))
      await backend.repository.advanceReadCursor({ threadId: withAda.threadId, userId: viewer, readAt: "2026-09-30T10:01:30.000Z" })
      const counts = await backend.repository.countUnreadMessagesBySender(viewer)
      assert.deepEqual(counts.sort((left, right) => left.senderUserId.localeCompare(right.senderUserId)),
        [{ senderUserId: ada, unreadCount: 1 }, { senderUserId: bo, unreadCount: 1 }].sort((left, right) => left.senderUserId.localeCompare(right.senderUserId)))
      const listed = await backend.repository.listThreads(viewer)
      assert.equal(listed.reduce((total, item) => total + (item.unreadCount ?? 0), 0), 2, "the badge equals the app's unread total")
      await backend.repository.advanceReadCursor({ threadId: withBo.threadId, userId: viewer, readAt: "2026-09-30T10:05:00.000Z" })
      await backend.repository.advanceReadCursor({ threadId: withAda.threadId, userId: viewer, readAt: "2026-09-30T10:05:00.000Z" })
      assert.deepEqual(await backend.repository.countUnreadMessagesBySender(viewer), [])
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
      await backend.repository.advanceReadCursor({ threadId: threads[0]!.threadId, userId: viewer, readAt: "2026-09-30T10:01:30.000Z" })
      await backend.repository.advanceReadCursor({ threadId: threads[0]!.threadId, userId: viewer, readAt: "2026-09-30T09:00:00.000Z" })

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
    },

    "the delivery cursor moves only forward and only to the partner's messages": async (backend) => {
      const chat = thread(backend, "delivered", "2026-10-01T10:00:00.000Z")
      const [sender, recipient] = chat.participantUserIds
      await backend.repository.saveThread(chat)
      const first = message(chat, "m1", "2026-10-01T10:01:00.000Z", "one", sender)
      const second = message(chat, "m2", "2026-10-01T10:02:00.000Z", "two", sender)
      const own = message(chat, "m3", "2026-10-01T10:03:00.000Z", "three", recipient)
      for (const item of [first, second, own]) await backend.repository.createMessage(item)
      const ack = (upToMessageId: string, userId = recipient) =>
        backend.repository.advanceDeliveredCursor({ threadId: chat.threadId, userId, upToMessageId })

      assert.equal(await backend.repository.supportsReceipts(), true)
      assert.deepEqual(await ack(second.messageId), {
        partnerUserId: sender,
        deliveredUpTo: { sentAt: second.sentAt, messageId: second.messageId }
      })
      assert.equal(await ack(first.messageId), null, "never backwards")
      assert.equal(await ack(second.messageId), null, "a repeated ack changes nothing")
      assert.equal(await ack(own.messageId), null, "own messages are not deliveries")
      assert.equal(await ack("unknown_message"), null)
      assert.equal(await ack(second.messageId, backend.id("stranger")), null, "only participants have cursors")

      const rows = await backend.repository.listReceiptParticipants([chat.threadId, chat.threadId])
      assert.deepEqual(rows.map((row) => [row.userId, row.deliveredUpTo?.messageId ?? null, row.readUpTo ?? null, row.readReceiptsEnabled]), [
        [sender, null, null, false],
        [recipient, second.messageId, null, false]
      ])
    },

    "messages sent in the same instant are acknowledged in message-id order": async (backend) => {
      const chat = thread(backend, "instant", "2026-10-01T10:00:00.000Z")
      await backend.repository.saveThread(chat)
      const instant = "2026-10-01T10:05:00.000Z"
      const earlier = message(chat, "a", instant)
      const later = message(chat, "b", instant)
      for (const item of [later, earlier]) await backend.repository.createMessage(item)
      const recipient = chat.participantUserIds[1]
      const ack = (upToMessageId: string) =>
        backend.repository.advanceDeliveredCursor({ threadId: chat.threadId, userId: recipient, upToMessageId })
      assert.equal((await ack(earlier.messageId))?.deliveredUpTo.messageId, earlier.messageId)
      assert.equal((await ack(later.messageId))?.deliveredUpTo.messageId, later.messageId)
      assert.equal(await ack(earlier.messageId), null)
    },

    "the read cursor moves forward to a partner message or a whole instant and drives unread counts": async (backend) => {
      const chat = thread(backend, "read", "2026-10-01T10:00:00.000Z")
      const [sender, reader] = chat.participantUserIds
      await backend.repository.saveThread(chat)
      const first = message(chat, "m1", "2026-10-01T10:01:00.000Z", "one", sender)
      const second = message(chat, "m2", "2026-10-01T10:02:00.000Z", "two", sender)
      const own = message(chat, "m3", "2026-10-01T10:03:00.000Z", "three", reader)
      for (const item of [first, second, own]) await backend.repository.createMessage(item)
      const read = (target: { upToMessageId: string } | { readAt: string }, userId = reader) =>
        backend.repository.advanceReadCursor({ threadId: chat.threadId, userId, ...target })
      const unread = async () => (await backend.repository.listThreads(reader))
        .find((item) => item.threadId === chat.threadId)?.unreadCount

      assert.deepEqual(await read({ upToMessageId: first.messageId }), {
        readAt: first.sentAt,
        readUpTo: { sentAt: first.sentAt, messageId: first.messageId }
      })
      assert.equal(await unread(), 1, "the second message is still unread")
      assert.deepEqual(await read({ upToMessageId: second.messageId }), {
        readAt: second.sentAt,
        readUpTo: { sentAt: second.sentAt, messageId: second.messageId }
      })
      assert.deepEqual(await read({ upToMessageId: first.messageId }), { readAt: second.sentAt }, "never backwards")
      assert.equal(await read({ upToMessageId: own.messageId }), null, "a read cursor names a partner message")
      assert.equal(await read({ upToMessageId: "unknown_message" }), null)
      assert.deepEqual(await read({ readAt: "2026-10-01T09:00:00.000Z" }), { readAt: second.sentAt })
      assert.equal(await unread(), 0)
      assert.equal(await read({ readAt: second.sentAt }, backend.id("stranger")), null)

      const rows = await backend.repository.listReceiptParticipants([chat.threadId])
      assert.deepEqual(rows.find((row) => row.userId === reader)?.readUpTo, { sentAt: second.sentAt, messageId: second.messageId })
    },

    "a read without a message clears unread counts but never moves or publishes the read receipt": async (backend) => {
      const chat = thread(backend, "instant", "2026-10-01T10:00:00.000Z")
      const [sender, reader] = chat.participantUserIds
      await backend.repository.saveThread(chat)
      const shown = message(chat, "m1", "2026-10-01T10:01:00.000Z", "one", sender)
      await backend.repository.createMessage(shown)
      const read = (target: { upToMessageId: string } | { readAt: string }) =>
        backend.repository.advanceReadCursor({ threadId: chat.threadId, userId: reader, ...target })
      const unread = async () => (await backend.repository.listThreads(reader))
        .find((item) => item.threadId === chat.threadId)?.unreadCount
      const receipt = async () => (await backend.repository.listReceiptParticipants([chat.threadId]))
        .find((row) => row.userId === reader)?.readUpTo
      assert.deepEqual(await read({ upToMessageId: shown.messageId }), {
        readAt: shown.sentAt,
        readUpTo: { sentAt: shown.sentAt, messageId: shown.messageId }
      })

      // sent_at is taken before the insert commits: this message carries a
      // time before the instant read below but becomes visible only after it.
      const late = message(chat, "m2", "2026-10-01T10:02:00.000Z", "two", sender)
      assert.deepEqual(await read({ readAt: "2026-10-01T10:03:00.000Z" }), { readAt: "2026-10-01T10:03:00.000Z" },
        "an instant read publishes no read receipt")
      await backend.repository.createMessage(late)
      assert.equal(await unread(), 0, "legacy clients still clear their unread count")
      assert.deepEqual(await receipt(), { sentAt: shown.sentAt, messageId: shown.messageId },
        "the partner never sees the late message as read")

      // Reading the late message by id once it is shown moves the receipt,
      // although the unread cursor is already past it.
      assert.deepEqual(await read({ upToMessageId: late.messageId }), {
        readAt: "2026-10-01T10:03:00.000Z",
        readUpTo: { sentAt: late.sentAt, messageId: late.messageId }
      })
      assert.deepEqual(await read({ upToMessageId: late.messageId }), { readAt: "2026-10-01T10:03:00.000Z" })
      assert.deepEqual(await receipt(), { sentAt: late.sentAt, messageId: late.messageId })
    },

    "chat preferences default to read receipts off and are saved per account": async (backend) => {
      const [ada, bo] = [backend.id("ada"), backend.id("bo")]
      await backend.ensureUsers(ada, bo)
      const chat = thread(backend, "prefs", "2026-10-01T10:00:00.000Z", [ada, bo])
      await backend.repository.saveThread(chat)

      assert.deepEqual(await backend.repository.getChatPreferences(ada), { readReceiptsEnabled: false })
      assert.deepEqual(await backend.repository.saveChatPreferences(ada, { readReceiptsEnabled: true }, new Date()), { readReceiptsEnabled: true })
      assert.deepEqual(await backend.repository.getChatPreferences(ada), { readReceiptsEnabled: true })
      assert.deepEqual(await backend.repository.getChatPreferences(bo), { readReceiptsEnabled: false })
      assert.deepEqual(
        (await backend.repository.listReceiptParticipants([chat.threadId])).map((row) => [row.userId, row.readReceiptsEnabled]),
        [[ada, true], [bo, false]]
      )
      assert.deepEqual(await backend.repository.saveChatPreferences(ada, { readReceiptsEnabled: false }, new Date()), { readReceiptsEnabled: false })
      assert.deepEqual(await backend.repository.getChatPreferences(ada), { readReceiptsEnabled: false })
      assert.deepEqual(await backend.repository.listReceiptParticipants([]), [])
    }
  }
})
