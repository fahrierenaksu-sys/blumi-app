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
