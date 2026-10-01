import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryChatRepository } from "./chatRepository"
import { createChatService } from "./chatService"

test("chat pages have stable distinct IDs and hydrate unread from the stored read cursor", async () => {
  const service = createChatService()
  const base = new Date("2026-09-05T10:00:00Z")
  for (let index = 0; index < 5; index++) await service.createThread({
    threadId: `page_${index}`, miniRoomId: "room", participantUserIds: ["a", "b"], participants: [{ userId: "a" }, { userId: "b" }]
  }, new Date(base.getTime() + index))
  await service.sendMessage("a", "page_4", "unread", new Date(base.getTime() + 100))
  const first = await service.listThreadsPage("b", { limit: 2 })
  assert.deepEqual(first.threads.map((thread) => thread.threadId), ["page_4", "page_3"])
  assert.equal(first.threads[0].unreadCount, 1)
  await service.sendMessage("a", "page_0", "new activity", new Date(base.getTime() + 200))
  const second = await service.listThreadsPage("b", { limit: 2, cursor: first.nextCursor! })
  assert.deepEqual(second.threads.map((thread) => thread.threadId), ["page_2", "page_1"])
  await service.markThreadRead("b", "page_4", new Date(base.getTime() + 300))
  assert.equal((await service.listThreadsPage("b")).threads[0].unreadCount, 0)
  await service.markThreadRead("b", "page_4", base)
  assert.equal((await service.listThreadsPage("b")).threads[0].unreadCount, 0)
  await assert.rejects(service.listThreadsPage("a", { cursor: first.nextCursor! }), /invalid/)
})

test("chat threads are listed only for participants", async () => {
  const service = createChatService({
    repository: createInMemoryChatRepository()
  })
  await service.createThread(
    {
      threadId: "thread_one",
      miniRoomId: "room_one",
      participantUserIds: ["user_a", "user_b"],
      participants: [
        { userId: "user_a", displayName: "A" },
        { userId: "user_b", displayName: "B" }
      ]
    },
    new Date("2026-06-26T12:00:00.000Z")
  )

  assert.equal((await service.listThreads("user_a")).length, 1)
  assert.equal((await service.listThreads("user_c")).length, 0)
})

test("messages are trimmed, stored, sorted, and update last message", async () => {
  const service = createChatService({
    repository: createInMemoryChatRepository(),
    idFactory: () => "message_fixed"
  })
  await service.createThread({
    threadId: "thread_one",
    miniRoomId: "room_one",
    participantUserIds: ["user_a", "user_b"],
    participants: [
      { userId: "user_a", displayName: "A" },
      { userId: "user_b", displayName: "B" }
    ]
  })

  const sent = await service.sendMessage(
    "user_a",
    "thread_one",
    "  hey   there  ",
    new Date("2026-06-26T12:00:00.000Z")
  )
  const messages = await service.listMessages("user_b", "thread_one")
  const [thread] = await service.listThreads("user_a")

  assert.equal(sent.body, "hey there")
  assert.deepEqual(messages, [sent])
  assert.equal(thread.lastMessage?.messageId, "message_fixed")
})

test("an older concurrent completion cannot overwrite a newer thread preview", async () => {
  const ids = ["message_new", "message_old"]
  const service = createChatService({ idFactory: () => ids.shift()! })
  await service.createThread({
    threadId: "thread_one",
    miniRoomId: "room_one",
    participantUserIds: ["user_a", "user_b"],
    participants: [
      { userId: "user_a", displayName: "A" },
      { userId: "user_b", displayName: "B" }
    ]
  })

  await service.sendMessage("user_a", "thread_one", "new", new Date("2026-06-27T10:01:00.000Z"))
  await service.sendMessage("user_a", "thread_one", "old", new Date("2026-06-27T10:00:00.000Z"))

  assert.equal((await service.listThreads("user_a"))[0]?.lastMessage?.messageId, "message_new")
})

test("non-participants cannot read or send messages", async () => {
  const service = createChatService()
  await service.createThread({
    threadId: "thread_one",
    miniRoomId: "room_one",
    participantUserIds: ["user_a", "user_b"],
    participants: [
      { userId: "user_a", displayName: "A" },
      { userId: "user_b", displayName: "B" }
    ]
  })

  await assert.rejects(
    () => service.listMessages("user_c", "thread_one"),
    /conversation/
  )
  await assert.rejects(
    () => service.sendMessage("user_c", "thread_one", "hello"),
    /conversation/
  )
})

test("empty and oversized messages are rejected", async () => {
  const service = createChatService()
  await service.createThread({
    threadId: "thread_one",
    miniRoomId: "room_one",
    participantUserIds: ["user_a", "user_b"],
    participants: [
      { userId: "user_a", displayName: "A" },
      { userId: "user_b", displayName: "B" }
    ]
  })

  await assert.rejects(
    () => service.sendMessage("user_a", "thread_one", "    "),
    /message/
  )
  await assert.rejects(
    () => service.sendMessage("user_a", "thread_one", "x".repeat(501)),
    /500/
  )
  await assert.rejects(
    () => service.sendMessage("user_a", "thread_one", "kill yourself"),
    /community rules/
  )
  assert.deepEqual(await service.listMessages("user_b", "thread_one"), [])
})

test("malformed client retry IDs are rejected before persistence", async () => {
  const service = createChatService()
  await service.createThread({
    threadId: "thread_one",
    miniRoomId: "room_one",
    participantUserIds: ["user_a", "user_b"],
    participants: [
      { userId: "user_a", displayName: "A" },
      { userId: "user_b", displayName: "B" }
    ]
  })

  await assert.rejects(
    () => service.sendMessageIdempotently("user_a", "thread_one", "hello", "bad id"),
    /retry ID is invalid/
  )
})

test("idempotent chat retries return the original message and reject a changed body", async () => {
  let nextMessageId = 0
  const service = createChatService({ idFactory: () => `message_${++nextMessageId}` })
  await service.createThread({
    threadId: "thread_one",
    miniRoomId: "room_one",
    participantUserIds: ["user_a", "user_b"],
    participants: [
      { userId: "user_a", displayName: "A" },
      { userId: "user_b", displayName: "B" }
    ]
  })

  const first = await service.sendMessageIdempotently(
    "user_a", "thread_one", "same body", "client-message-001"
  )
  const repeated = await service.sendMessageIdempotently(
    "user_a", "thread_one", "same body", "client-message-001"
  )

  assert.equal(first.created, true)
  assert.equal(repeated.created, false)
  assert.deepEqual(repeated.message, first.message)
  await assert.rejects(
    service.sendMessageIdempotently("user_a", "thread_one", "different body", "client-message-001"),
    (error: unknown) => error instanceof Error &&
      error.name === "ChatMessageIdempotencyConflictError" &&
      "code" in error && error.code === "CHAT_MESSAGE_IDEMPOTENCY_CONFLICT"
  )
  assert.deepEqual(
    (await service.listMessages("user_a", "thread_one")).map((message) => message.body),
    ["same body"]
  )
})

test("concurrent opens for one matched thread persist one canonical thread without messages", async () => {
  const service = createChatService()
  const threadId = "thread_match_match_chat_authorized"
  const createdAt = new Date("2026-09-29T10:00:00.000Z")
  const open = () => service.createThread({
    threadId,
    miniRoomId: "match_match_chat_authorized",
    participantUserIds: ["user_a", "user_b"],
    participants: [
      { userId: "user_a", displayName: "A" },
      { userId: "user_b", displayName: "B" }
    ]
  }, createdAt)

  // Both callers read the missing stable ID before either save completes.
  const [first, concurrent] = await Promise.all([open(), open()])
  const stored = await service.repository.findThread(threadId)

  assert.deepEqual(concurrent, first)
  assert.equal(first.threadId, threadId)
  assert.ok(stored)
  assert.equal(stored.threadId, first.threadId)
  assert.equal(stored.miniRoomId, first.miniRoomId)
  assert.deepEqual(stored.participantUserIds, first.participantUserIds)
  assert.equal(stored.createdAt, first.createdAt)
  assert.deepEqual((await service.listThreads("user_a")).map((thread) => thread.threadId), [threadId])
  assert.deepEqual(await service.listMessages("user_a", threadId), [])
})

function createBlockPolicy(blockedPairs: Array<[string, string]>) {
  const queries: Array<{ viewer: string; candidates: readonly string[] }> = []
  const blocked = (a: string, b: string) =>
    blockedPairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
  return {
    queries,
    blockedPairs,
    policy: {
      async listBlockedUserIdsBetween(viewer: string, candidates: readonly string[]) {
        queries.push({ viewer, candidates: [...candidates] })
        return candidates.filter((candidate) => blocked(viewer, candidate))
      },
      async hasBlockBetween(a: string, b: string) { return blocked(a, b) }
    }
  }
}

async function createPairThreads(
  service: ReturnType<typeof createChatService>,
  viewer: string,
  partners: string[]
) {
  const base = Date.parse("2026-09-30T10:00:00.000Z")
  for (const [index, partner] of partners.entries()) {
    await service.createThread({
      threadId: `thread_${partner}`,
      miniRoomId: `room_${partner}`,
      participantUserIds: [viewer, partner],
      participants: [{ userId: viewer }, { userId: partner }]
    }, new Date(base + index * 1000))
  }
}

test("a block in either direction hides the thread from both users on every chat read path", async () => {
  const blocks = createBlockPolicy([])
  const service = createChatService({ blockPolicy: blocks.policy })
  await createPairThreads(service, "viewer", ["friend", "blocked_partner"])
  await service.sendMessage("blocked_partner", "thread_blocked_partner", "sent before the block")
  blocks.blockedPairs.push(["viewer", "blocked_partner"])

  for (const [userId, visible] of [
    ["viewer", ["thread_friend"]],
    ["blocked_partner", []],
    ["friend", ["thread_friend"]]
  ] as const) {
    assert.deepEqual((await service.listThreadsPage(userId)).threads.map((thread) => thread.threadId), visible)
    assert.deepEqual((await service.listThreads(userId)).map((thread) => thread.threadId), visible)
  }
  for (const userId of ["viewer", "blocked_partner"]) {
    // Same answer as a thread the caller is not in, so the block is not revealed.
    await assert.rejects(service.listMessages(userId, "thread_blocked_partner"), /That conversation is not available\./)
    await assert.rejects(service.markThreadRead(userId, "thread_blocked_partner"), /That conversation is not available\./)
  }
  await assert.rejects(service.listMessages("friend", "thread_blocked_partner"), /That conversation is not available\./)
})

test("removing the block restores the hidden thread with its history and unread count intact", async () => {
  const blocks = createBlockPolicy([])
  const service = createChatService({ blockPolicy: blocks.policy })
  await createPairThreads(service, "viewer", ["partner"])
  await service.sendMessage("partner", "thread_partner", "kept")
  blocks.blockedPairs.push(["partner", "viewer"])
  assert.deepEqual((await service.listThreadsPage("viewer")).threads, [])

  blocks.blockedPairs.length = 0
  const restored = await service.listThreadsPage("viewer")
  assert.deepEqual(restored.threads.map((thread) => thread.threadId), ["thread_partner"])
  assert.equal(restored.threads[0]?.unreadCount, 1)
  assert.equal(restored.threads[0]?.lastMessage?.body, "kept")
  assert.deepEqual((await service.listMessages("viewer", "thread_partner")).map((message) => message.body), ["kept"])
})

test("hidden threads never shorten a thread page or break its cursor, with one batched block lookup per page read", async () => {
  // Newest first: p5 p4 p3 p2 p1 p0; p4, p3 and p1 are blocked in either direction.
  const partners = ["p0", "p1", "p2", "p3", "p4", "p5"]
  const blocks = createBlockPolicy([["viewer", "p4"], ["p3", "viewer"], ["viewer", "p1"]])
  const service = createChatService({ blockPolicy: blocks.policy })
  await createPairThreads(service, "viewer", partners)

  const first = await service.listThreadsPage("viewer", { limit: 2 })
  assert.deepEqual(first.threads.map((thread) => thread.threadId), ["thread_p5", "thread_p2"])
  assert.ok(first.nextCursor)
  const second = await service.listThreadsPage("viewer", { limit: 2, cursor: first.nextCursor! })
  assert.deepEqual(second.threads.map((thread) => thread.threadId), ["thread_p0"])
  assert.equal(second.nextCursor, null)

  blocks.queries.length = 0
  await service.listThreadsPage("viewer", { limit: 50 })
  assert.equal(blocks.queries.length, 1, "one block query covers every partner on a page")
  assert.deepEqual([...blocks.queries[0]!.candidates].sort(), [...partners].sort())
})

test("the push badge counts unread partner messages and leaves out blocked partners in one batched lookup", async () => {
  const blocks = createBlockPolicy([["viewer", "blocked"]])
  const service = createChatService({ blockPolicy: blocks.policy })
  await createPairThreads(service, "viewer", ["friend", "blocked"])
  assert.equal(await service.countUnreadMessages("viewer"), 0)
  assert.equal(blocks.queries.length, 0, "nothing unread needs no block lookup")
  await service.sendMessage("friend", "thread_friend", "one", new Date("2026-09-30T11:00:00.000Z"))
  await service.sendMessage("friend", "thread_friend", "two", new Date("2026-09-30T11:01:00.000Z"))
  await service.sendMessage("viewer", "thread_friend", "mine", new Date("2026-09-30T11:02:00.000Z"))
  await service.sendMessage("blocked", "thread_blocked", "hidden", new Date("2026-09-30T11:00:00.000Z"))
  assert.equal(await service.countUnreadMessages("viewer"), 2)
  assert.equal(blocks.queries.length, 1)
  await service.markThreadRead("viewer", "thread_friend", new Date("2026-09-30T11:05:00.000Z"))
  assert.equal(await service.countUnreadMessages("viewer"), 0)
})
