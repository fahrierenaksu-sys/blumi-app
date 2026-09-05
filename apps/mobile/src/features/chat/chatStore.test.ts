import assert from "node:assert/strict"
import test from "node:test"
import {
  addOptimisticMessage,
  applyChatMessageListed,
  applyChatMessageReceived,
  applyChatMessageListFailed,
  applyChatMessageListLoading,
  confirmOptimisticMessage,
  getMessageListState,
  getMessageDeliveryState,
  applyChatThreadListFailed,
  applyChatThreadListed,
  applyChatThreadRead,
  applyChatThreadListLoading,
  getMessages,
  getThreadUnreadCount,
  getThreadListState,
  markOptimisticMessageFailed,
  markOptimisticMessageSending,
  getRetryableMessage,
  getThreads,
  getTotalUnreadCount,
  markThreadRead,
  findThreadForPartner,
  applyChatThreadCreated,
  resetChatStore,
  subscribeToChatStore,
  setActiveThread
} from "./chatStore"

test("cold chat list hydrates server unread totals", () => {
  resetChatStore()
  applyChatThreadListed({ userId: "b", threads: [{ threadId: "cold", miniRoomId: "room", participantUserIds: ["a", "b"],
    participants: [{ userId: "a" }, { userId: "b" }], createdAt: "2026-09-05T00:00:00Z", unreadCount: 7 }] })
  assert.equal(getThreadUnreadCount("cold"), 7)
})

test("another device read clears unread and a stale list cannot resurrect it", () => {
  resetChatStore()
  const thread = { threadId: "remote-read", miniRoomId: "room", participantUserIds: ["a", "b"] as [string, string],
    participants: [{ userId: "a" }, { userId: "b" }] as [{ userId: string }, { userId: string }], createdAt: "2026-09-05T00:00:00Z", unreadCount: 5,
    lastMessage: { messageId: "old", threadId: "remote-read", senderUserId: "a", body: "old", sentAt: "2026-09-05T09:59:00Z" } }
  applyChatThreadListed({ userId: "b", threads: [thread] })
  applyChatThreadRead({ userId: "b", threadId: thread.threadId, readAt: "2026-09-05T10:00:00Z" })
  assert.equal(getThreadUnreadCount(thread.threadId), 0)
  applyChatThreadListed({ userId: "b", threads: [thread] })
  assert.equal(getThreadUnreadCount(thread.threadId), 0)
  applyChatMessageReceived({ messageId: "later", threadId: thread.threadId, senderUserId: "a", body: "new", sentAt: "2026-09-05T10:01:00Z" }, { localUserId: "b" })
  assert.equal(getThreadUnreadCount(thread.threadId), 1)
})

test("summary-covered delayed realtime delivery does not double count unread", () => {
  resetChatStore()
  const message = { messageId: "covered", threadId: "summary", senderUserId: "a", body: "offline", sentAt: "2026-09-05T10:02:00Z" }
  applyChatThreadListed({ userId: "b", threads: [{ threadId: "summary", miniRoomId: "room", participantUserIds: ["a", "b"], participants: [{ userId: "a" }, { userId: "b" }], createdAt: "2026-09-05T00:00:00Z", unreadCount: 1, lastMessage: message }] })
  applyChatMessageReceived(message, { localUserId: "b" })
  applyChatMessageReceived({ ...message, messageId: "older", sentAt: "2026-09-05T10:00:00Z" }, { localUserId: "b" })
  assert.equal(getThreadUnreadCount("summary"), 1)
  assert.equal(getThreads()[0].lastMessage?.messageId, "covered")
})

test("delayed read does not replace an authoritative offline summary with an incomplete cache", () => {
  resetChatStore()
  const thread = { threadId: "partial", miniRoomId: "room", participantUserIds: ["a", "b"] as [string, string], participants: [{ userId: "a" }, { userId: "b" }] as [{ userId: string }, { userId: string }], createdAt: "2026-09-05T00:00:00Z", unreadCount: 5,
    lastMessage: { messageId: "newer", threadId: "partial", senderUserId: "a", body: "offline", sentAt: "2026-09-05T10:02:00Z" } }
  applyChatThreadListed({ userId: "b", threads: [thread] })
  applyChatThreadRead({ userId: "b", threadId: "partial", readAt: "2026-09-05T10:01:00Z" })
  assert.equal(getThreadUnreadCount("partial"), 5, "retain summary while refreshing; cache is not authoritative")
  applyChatThreadListed({ userId: "b", threads: [{ ...thread, unreadCount: 2, lastReadAt: "2026-09-05T10:01:00Z" }] })
  assert.equal(getThreadUnreadCount("partial"), 2)
})

test("an in-flight list cannot erase a newer received message or unread count", () => {
  resetChatStore()
  const thread = { threadId: "racing", miniRoomId: "room", participantUserIds: ["a", "b"] as [string, string],
    participants: [{ userId: "a" }, { userId: "b" }] as [{ userId: string }, { userId: string }], createdAt: "2026-09-05T00:00:00Z", unreadCount: 0 }
  applyChatThreadListed({ userId: "b", threads: [thread] })
  applyChatMessageReceived({ messageId: "new", threadId: thread.threadId, senderUserId: "a", body: "new", sentAt: "2026-09-05T10:01:00Z" }, { localUserId: "b" })
  applyChatThreadListed({ userId: "b", threads: [thread] })
  assert.equal(getThreadUnreadCount(thread.threadId), 1)
  assert.equal(getThreads()[0].lastMessage?.messageId, "new")
})

for (const order of ["http-first", "websocket-first"] as const) {
  test(`${order}: optimistic acknowledgement notifies subscribers with exactly one final message`, () => {
    resetChatStore()
    const pending = addOptimisticMessage({ threadId: "thread_one", senderUserId: "user_one",
      body: "hello", clientMessageId: "tracked-client-001" })
    const message = { messageId: "server-001", threadId: "thread_one", senderUserId: "user_one",
      body: "hello", sentAt: "2026-09-05T10:00:00Z" }
    const snapshots: string[][] = []
    const unsubscribe = subscribeToChatStore(() => {
      snapshots.push(getMessages("thread_one").map((entry) => entry.messageId))
    })
    try {
      if (order === "websocket-first") applyChatMessageReceived(message, { localUserId: "user_one" })
      const beforeConfirmation = snapshots.length
      confirmOptimisticMessage(pending.clientMessageId, message, "user_one")
      assert.equal(snapshots.length, beforeConfirmation + 1)
      assert.deepEqual(snapshots.at(-1), ["server-001"])
      const beforeDuplicate = snapshots.length
      applyChatMessageReceived(message, { localUserId: "user_one" })
      confirmOptimisticMessage(pending.clientMessageId, message, "user_one")
      assert.equal(snapshots.length, beforeDuplicate)
      assert.equal(getThreadUnreadCount("thread_one"), 0)
    } finally {
      unsubscribe()
    }
    const beforeReset = snapshots.length
    resetChatStore()
    assert.equal(snapshots.length, beforeReset)
  })
}

test("acknowledgement removes retry metadata while unrelated pending messages stay retryable", () => {
  resetChatStore()
  const pending = addOptimisticMessage({ threadId: "thread_one", senderUserId: "user_one",
    body: "hello", clientMessageId: "tracked-client-001" })
  markOptimisticMessageFailed(pending.clientMessageId)
  markOptimisticMessageSending(pending.clientMessageId)
  assert.equal(getMessageDeliveryState(pending.localMessageId), "sending")
  assert.deepEqual(getRetryableMessage(pending.localMessageId), {
    body: "hello", clientMessageId: pending.clientMessageId, threadId: "thread_one"
  })
  confirmOptimisticMessage(pending.clientMessageId, {
    messageId: "server-001", threadId: "thread_one", senderUserId: "user_one",
    body: "hello", sentAt: "2026-09-05T10:00:00Z"
  }, "user_one")
  assert.equal(getRetryableMessage(pending.localMessageId), null)
  markOptimisticMessageFailed(pending.clientMessageId)
  markOptimisticMessageSending(pending.clientMessageId)
  assert.equal(getMessageDeliveryState(pending.localMessageId), "sent")
})

test("subscribers observe thread creation, canonical preview and read-count updates", () => {
  resetChatStore()
  applyChatThreadCreated({ threadId: "thread_one", miniRoomId: "room_one", participantUserIds: ["user_one", "user_two"],
    participants: [{ userId: "user_one", displayName: "One" }, { userId: "user_two", displayName: "Two" }],
    createdAt: "2026-09-05T10:00:00Z" })
  applyChatMessageReceived({ messageId: "server-002", threadId: "thread_one", senderUserId: "user_two",
    body: "hi", sentAt: "2026-09-05T10:01:00Z" }, { localUserId: "user_one" })
  assert.equal(getThreads()[0]?.lastMessage?.body, "hi")
  assert.equal(findThreadForPartner("user_two")?.threadId, "thread_one")
  assert.equal(findThreadForPartner("unknown"), undefined)
  assert.equal(getTotalUnreadCount(), 1)
  markThreadRead("thread_one")
  assert.equal(getTotalUnreadCount(), 0)
  setActiveThread("thread_one")
  assert.equal(getThreadUnreadCount("thread_one"), 0)
})

test("server-confirmed messages replace one optimistic echo at a time", () => {
  resetChatStore()

  addOptimisticMessage({
    threadId: "thread_one",
    senderUserId: "user_one",
    body: "first"
  })
  addOptimisticMessage({
    threadId: "thread_one",
    senderUserId: "user_one",
    body: "second"
  })

  applyChatMessageReceived({
    messageId: "message_server_one",
    threadId: "thread_one",
    senderUserId: "user_one",
    body: "first",
    sentAt: "2026-06-27T10:00:00.000Z"
  })

  const messages = getMessages("thread_one")

  assert.equal(messages.length, 2)
  assert.equal(messages[0]?.messageId, "message_server_one")
  assert.equal(messages[1]?.body, "second")
  assert.match(messages[1]?.messageId ?? "", /^__local_/)
})

test("a failed optimistic send stays tied to its exact retry ID until acknowledged", () => {
  resetChatStore()
  const pending = addOptimisticMessage({
    threadId: "thread_one",
    senderUserId: "user_one",
    body: "first",
    clientMessageId: "client-message-001"
  })

  markOptimisticMessageFailed(pending.clientMessageId)
  assert.equal(getMessageDeliveryState(pending.localMessageId), "failed")

  confirmOptimisticMessage(pending.clientMessageId, {
    messageId: "message_server_one",
    threadId: "thread_one",
    senderUserId: "user_one",
    body: "first",
    sentAt: "2026-06-27T10:00:00.000Z"
  })

  assert.deepEqual(getMessages("thread_one").map((message) => message.messageId), [
    "message_server_one"
  ])
  assert.equal(getMessageDeliveryState("message_server_one"), "sent")
})

test("resetChatStore clears optimistic chat state", () => {
  resetChatStore()
  addOptimisticMessage({
    threadId: "thread_one",
    senderUserId: "user_one",
    body: "hello"
  })

  resetChatStore()

  assert.deepEqual(getMessages("thread_one"), [])
})

test("thread list exposes loading, failed, and ready instead of an endless loader", () => {
  resetChatStore()
  applyChatThreadListLoading()
  assert.deepEqual(getThreadListState(), { status: "loading" })

  applyChatThreadListFailed("Chats need a connection.")
  assert.deepEqual(getThreadListState(), {
    status: "failed",
    errorMessage: "Chats need a connection."
  })

  applyChatThreadListed({ userId: "user_one", threads: [] })
  assert.deepEqual(getThreadListState(), { status: "ready" })
})

test("thread list failure never exposes transport diagnostics to people", () => {
  resetChatStore()

  applyChatThreadListFailed(
    "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"
  )

  assert.deepEqual(getThreadListState(), {
    status: "failed",
    errorMessage: "We couldn't load your chats. Check your connection and try again."
  })
})

test("each conversation exposes loading, failed, and ready message states", () => {
  resetChatStore()
  assert.deepEqual(getMessageListState("thread_one"), { status: "idle" })

  applyChatMessageListLoading("thread_one")
  assert.deepEqual(getMessageListState("thread_one"), { status: "loading" })

  applyChatMessageListFailed("thread_one", "Chat needs a connection.")
  assert.deepEqual(getMessageListState("thread_one"), {
    status: "failed",
    errorMessage: "Chat needs a connection."
  })

  applyChatMessageListed({
    userId: "user_one",
    threadId: "thread_one",
    messages: []
  })
  assert.deepEqual(getMessageListState("thread_one"), { status: "ready" })
})

test("conversation failure never exposes transport diagnostics to people", () => {
  resetChatStore()

  applyChatMessageListFailed(
    "thread_one",
    "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"
  )

  assert.deepEqual(getMessageListState("thread_one"), {
    status: "failed",
    errorMessage:
      "We couldn't load this conversation. Check your connection and try again."
  })
})

test("self-authored realtime echoes never create unread counts", () => {
  resetChatStore()
  setActiveThread(null)

  applyChatMessageReceived({
    messageId: "message_self",
    threadId: "thread_one",
    senderUserId: "user_one",
    body: "hello",
    sentAt: "2026-06-27T10:00:00.000Z"
  }, { localUserId: "user_one" })
  applyChatMessageReceived({
    messageId: "message_partner",
    threadId: "thread_one",
    senderUserId: "user_two",
    body: "hi",
    sentAt: "2026-06-27T10:00:01.000Z"
  }, { localUserId: "user_one" })

  assert.equal(getThreadUnreadCount("thread_one"), 1)
})

test("late delivery of an already read message does not recreate unread", () => {
  resetChatStore()
  applyChatThreadRead({ userId: "user_one", threadId: "thread_one", readAt: "2026-06-27T10:01:00.000Z" })
  applyChatMessageReceived({ messageId: "late", threadId: "thread_one", senderUserId: "user_two", body: "old", sentAt: "2026-06-27T10:00:00.000Z" }, { localUserId: "user_one" })
  assert.equal(getThreadUnreadCount("thread_one"), 0)
})
