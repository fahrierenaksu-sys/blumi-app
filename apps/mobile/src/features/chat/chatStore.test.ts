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
  getMessageListCompletionVersion,
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
  setActiveThread,
  createChatThreadSnapshotReader,
  beginChatThreadListRequest,
  removeChatThreadsWithPartner,
  applyChatReceiptUpdated,
  getPartnerReceipts
} from "./chatStore"

test("one realtime message is not proof that the first history page is ready", () => {
  resetChatStore()
  const read = createChatThreadSnapshotReader("cold-history")
  applyChatMessageReceived({ messageId: "new", threadId: "cold-history", senderUserId: "peer", body: "hello", sentAt: "2026-09-29T00:00:00Z" })
  applyChatMessageListLoading("cold-history")
  assert.equal(read().messages.length, 1)
  assert.equal(read().historyReady, false)
  applyChatMessageListed({ userId: "owner", threadId: "cold-history", messages: [] })
  assert.equal(read().historyReady, true, "even an empty server page is an authoritative completed fetch")
  applyChatMessageListLoading("cold-history")
  assert.equal(read().historyReady, true, "a background refresh must not hide an already-loaded conversation")
  resetChatStore()
  assert.equal(read().historyReady, false)
})

test("thread snapshot ignores other conversations but reflects delivery changes and logout", () => {
  resetChatStore()
  const read = createChatThreadSnapshotReader("selected")
  const pending = addOptimisticMessage({ threadId: "selected", senderUserId: "owner", body: "hello", clientMessageId: "scoped-send" })
  const original = read()
  applyChatMessageReceived({ messageId: "other", threadId: "other-thread", senderUserId: "peer", body: "other", sentAt: "2026-09-29T00:00:00Z" })
  assert.equal(read(), original, "unrelated messages should not render the selected timeline")
  markOptimisticMessageFailed(pending.clientMessageId)
  assert.notEqual(read(), original)
  const failed = read()
  assert.equal(read(), failed, "a snapshot is referentially stable until its values change")
  resetChatStore()
  assert.equal(read().messages.length, 0)
})

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

test("CHT-06: a list served before this device's read cannot bring read messages back as unread", () => {
  resetChatStore()
  const seen = { messageId: "seen", threadId: "read-here", senderUserId: "a", body: "seen", sentAt: "2026-09-05T10:00:00Z" }
  const thread = { threadId: "read-here", miniRoomId: "room", participantUserIds: ["a", "b"] as [string, string],
    participants: [{ userId: "a" }, { userId: "b" }] as [{ userId: string }, { userId: string }], createdAt: "2026-09-05T00:00:00Z",
    unreadCount: 2, lastReadAt: "2026-09-05T09:00:00Z", lastMessage: seen }
  applyChatThreadListed({ userId: "b", threads: [thread] })
  assert.equal(getThreadUnreadCount("read-here"), 2)
  // The chat opens on screen and is marked read on this device.
  setActiveThread("read-here")
  markThreadRead("read-here")
  // A partner message arrives while the conversation is on screen.
  const whileOpen = { ...seen, messageId: "while-open", sentAt: "2026-09-05T10:01:00Z" }
  applyChatMessageReceived(whileOpen, { localUserId: "b" })
  // Back in the inbox; the refresh was served before the server stored the read.
  setActiveThread(null)
  applyChatThreadListed({ userId: "b", threads: [{ ...thread, unreadCount: 3, lastMessage: whileOpen }] })
  assert.equal(getThreadUnreadCount("read-here"), 0, "messages already shown here stay read")
  // A message that arrives after leaving is unread, and a later list stays authoritative for it.
  const afterLeaving = { ...seen, messageId: "after-leaving", sentAt: "2026-09-05T10:02:00Z" }
  applyChatMessageReceived(afterLeaving, { localUserId: "b" })
  assert.equal(getThreadUnreadCount("read-here"), 1)
  applyChatThreadListed({ userId: "b", threads: [{ ...thread, unreadCount: 3, lastMessage: whileOpen }] })
  assert.equal(getThreadUnreadCount("read-here"), 1, "a stale list keeps counting the message this device has not shown")
  applyChatThreadListed({ userId: "b", threads: [{ ...thread, unreadCount: 1, lastReadAt: whileOpen.sentAt, lastMessage: afterLeaving }] })
  assert.equal(getThreadUnreadCount("read-here"), 1)
  // An account switch forgets what this device read.
  resetChatStore()
  applyChatThreadListed({ userId: "b", threads: [thread] })
  assert.equal(getThreadUnreadCount("read-here"), 2)
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
      assert.equal(snapshots.length, beforeConfirmation + (order === "http-first" ? 1 : 0))
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

test("optimistic send is published immediately and stays pending until a canonical acknowledgement", () => {
  resetChatStore()
  const snapshots: { ids: string[]; state: string | undefined }[] = []
  const unsubscribe = subscribeToChatStore(() => {
    const optimistic = getMessages("thread_one").find((entry) => entry.messageId.startsWith("__local_"))
    snapshots.push({
      ids: getMessages("thread_one").map((entry) => entry.messageId),
      state: optimistic ? getMessageDeliveryState(optimistic.messageId) : undefined
    })
  })
  try {
    const pending = addOptimisticMessage({
      threadId: "thread_one",
      senderUserId: "user_one",
      body: "hello",
      clientMessageId: "client-message-immediate-001"
    })

    assert.deepEqual(getMessages("thread_one").map((entry) => entry.messageId), [pending.localMessageId])
    assert.equal(getMessageDeliveryState(pending.localMessageId), "sending")
    assert.deepEqual(snapshots.at(-1), {
      ids: [pending.localMessageId],
      state: "sending"
    })

    confirmOptimisticMessage(pending.clientMessageId, {
      messageId: "server-immediate-001",
      threadId: "thread_one",
      senderUserId: "user_one",
      body: "hello",
      sentAt: "2026-09-29T10:00:00Z"
    }, "user_one")

    assert.deepEqual(getMessages("thread_one").map((entry) => entry.messageId), ["server-immediate-001"])
    assert.equal(getMessageDeliveryState("server-immediate-001"), "sent")
  } finally {
    unsubscribe()
    resetChatStore()
  }
})

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

test("websocket echo atomically replaces a tracked optimistic bubble before ACK", () => {
  resetChatStore()
  try {
    const target = addOptimisticMessage({
      threadId: "thread_target",
      senderUserId: "user_one",
      body: "same body",
      clientMessageId: "target-client-id"
    })
    markOptimisticMessageFailed(target.clientMessageId)
    assert.equal(getMessageDeliveryState(target.localMessageId), "failed")

    const snapshots: string[][] = []
    const unsubscribe = subscribeToChatStore(() => {
      snapshots.push(getMessages("thread_target").map((entry) => entry.messageId))
    })
    const canonical = {
      messageId: "server-target",
      threadId: "thread_target",
      senderUserId: "user_one",
      body: "same body",
      sentAt: "2026-09-29T10:00:00.000Z"
    }
    try {
      applyChatMessageReceived(canonical, { localUserId: "user_one" })

      assert.deepEqual(snapshots, [["server-target"]],
        "the websocket reducer publishes one atomic replacement, not both target rows")
      assert.equal(getMessageDeliveryState("server-target"), "sent")
      assert.equal(getRetryableMessage(target.localMessageId), null)

      const snapshotCount = snapshots.length
      confirmOptimisticMessage(target.clientMessageId, canonical, "user_one")
      assert.equal(snapshots.length, snapshotCount, "the later ACK must not create or remove another scoped row")
      assert.deepEqual(getMessages("thread_target").map((entry) => entry.messageId), ["server-target"])
    } finally {
      unsubscribe()
    }
  } finally {
    resetChatStore()
  }
})

test("same clientMessageId in another sender or thread does not steal optimistic tracking", () => {
  resetChatStore()
  try {
    const clientMessageId = "shared-client-id-across-scopes"
    const otherSender = addOptimisticMessage({
      threadId: "thread_target",
      senderUserId: "user_two",
      body: "same body",
      clientMessageId
    })
    markOptimisticMessageFailed(clientMessageId)
    const otherThread = addOptimisticMessage({
      threadId: "thread_other",
      senderUserId: "user_one",
      body: "same body",
      clientMessageId
    })
    const target = addOptimisticMessage({
      threadId: "thread_target",
      senderUserId: "user_one",
      body: "same body",
      clientMessageId
    })

    applyChatMessageReceived({
      messageId: "server-target-scoped",
      threadId: "thread_target",
      senderUserId: "user_one",
      body: "same body",
      sentAt: "2026-09-29T10:00:00.000Z"
    }, { localUserId: "user_one" })

    assert.equal(getMessageDeliveryState("server-target-scoped"), "sent")
    assert.equal(getMessageDeliveryState(otherSender.localMessageId), "failed")
    assert.equal(getMessageDeliveryState(otherThread.localMessageId), "sending")
    assert.deepEqual(getRetryableMessage(otherSender.localMessageId), {
      body: "same body", clientMessageId, threadId: "thread_target"
    })
    assert.deepEqual(getRetryableMessage(otherThread.localMessageId), {
      body: "same body", clientMessageId, threadId: "thread_other"
    })
    assert.deepEqual(getMessages("thread_target").map((entry) => entry.messageId).sort(), [
      "server-target-scoped", otherSender.localMessageId
    ].sort())
    assert.deepEqual(getMessages("thread_other").map((entry) => entry.messageId), [otherThread.localMessageId])

    const beforeAck = getMessages("thread_target").map((entry) => entry.messageId).sort()
    confirmOptimisticMessage(clientMessageId, {
      messageId: "server-target-scoped",
      threadId: "thread_target",
      senderUserId: "user_one",
      body: "same body",
      sentAt: "2026-09-29T10:00:00.000Z"
    }, "user_one")
    assert.deepEqual(getMessages("thread_target").map((entry) => entry.messageId).sort(), beforeAck)
    assert.deepEqual(getMessages("thread_other").map((entry) => entry.messageId), [otherThread.localMessageId])
    assert.equal(getRetryableMessage(target.localMessageId), null)
  } finally {
    resetChatStore()
  }
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

test("unread badge snapshot stays stable across unrelated chat updates", () => {
  resetChatStore()
  const snapshots: number[] = []
  const unsubscribe = subscribeToChatStore(() => snapshots.push(getTotalUnreadCount()))
  try {
    applyChatMessageListLoading("thread_one")
    applyChatMessageListed({ userId: "user_one", threadId: "thread_one", messages: [] })
    addOptimisticMessage({ threadId: "thread_one", senderUserId: "user_one", body: "hello" })
    assert.deepEqual(snapshots, [0, 0, 0])

    applyChatMessageReceived({ messageId: "incoming", threadId: "thread_one",
      senderUserId: "user_two", body: "hi", sentAt: "2026-09-05T10:01:00Z" },
    { localUserId: "user_one" })
    assert.equal(getTotalUnreadCount(), 1)
    markThreadRead("thread_one")
    assert.equal(getTotalUnreadCount(), 0)
  } finally {
    unsubscribe()
    resetChatStore()
  }
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

test("a retried failed message takes its canonical server sentAt position without duplicating", () => {
  resetChatStore()
  try {
    const messageA = addOptimisticMessage({
      threadId: "thread_retry_order",
      senderUserId: "user_one",
      body: "A",
      clientMessageId: "client-retry-order-a"
    })
    markOptimisticMessageFailed(messageA.clientMessageId)
    assert.equal(getMessageDeliveryState(messageA.localMessageId), "failed")
    assert.deepEqual(getRetryableMessage(messageA.localMessageId), {
      body: "A",
      clientMessageId: messageA.clientMessageId,
      threadId: "thread_retry_order"
    })

    const messageB = addOptimisticMessage({
      threadId: "thread_retry_order",
      senderUserId: "user_one",
      body: "B",
      clientMessageId: "client-retry-order-b"
    })
    confirmOptimisticMessage(messageB.clientMessageId, {
      messageId: "server-retry-order-b",
      threadId: "thread_retry_order",
      senderUserId: "user_one",
      body: "B",
      sentAt: "2026-09-29T10:00:02.000Z"
    }, "user_one")
    assert.equal(getMessageDeliveryState("server-retry-order-b"), "sent")

    markOptimisticMessageSending(messageA.clientMessageId)
    assert.equal(getMessageDeliveryState(messageA.localMessageId), "sending")
    confirmOptimisticMessage(messageA.clientMessageId, {
      messageId: "server-retry-order-a",
      threadId: "thread_retry_order",
      senderUserId: "user_one",
      body: "A",
      sentAt: "2026-09-29T10:00:03.000Z"
    }, "user_one")

    const transcript = getMessages("thread_retry_order")
    assert.deepEqual(transcript.map((message) => message.messageId), [
      "server-retry-order-b",
      "server-retry-order-a"
    ])
    assert.equal(transcript.filter((message) => message.messageId === "server-retry-order-a").length, 1)
    assert.equal(transcript.some((message) => message.messageId.startsWith("__local_")), false)
    assert.equal(getMessageDeliveryState("server-retry-order-b"), "sent")
    assert.equal(getMessageDeliveryState("server-retry-order-a"), "sent")
    assert.equal(getRetryableMessage(messageA.localMessageId), null)
  } finally {
    resetChatStore()
  }
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

test("message-list completion revision advances only when a fetch settles", () => {
  resetChatStore()
  const before = getMessageListCompletionVersion("revision-thread")
  applyChatMessageListLoading("revision-thread")
  assert.equal(getMessageListCompletionVersion("revision-thread"), before)
  applyChatMessageListed({ userId: "owner", threadId: "revision-thread", messages: [] })
  assert.equal(getMessageListCompletionVersion("revision-thread"), before + 1)
  applyChatMessageListLoading("revision-thread")
  applyChatMessageListFailed("revision-thread", "offline")
  assert.equal(getMessageListCompletionVersion("revision-thread"), before + 2)
  resetChatStore()
  assert.equal(getMessageListCompletionVersion("revision-thread"), 0)
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

// ── Blocked partner removal ────────────────────────────────

function blockedPartnerThread(threadId: string, partnerUserId: string) {
  return {
    threadId,
    miniRoomId: `room_${threadId}`,
    participantUserIds: ["me", partnerUserId] as [string, string],
    participants: [{ userId: "me", displayName: "Me" }, { userId: partnerUserId, displayName: partnerUserId }] as [
      { userId: string; displayName: string },
      { userId: string; displayName: string }
    ],
    createdAt: "2026-09-30T09:00:00.000Z",
    unreadCount: 2,
    lastMessage: { messageId: `last_${threadId}`, threadId, senderUserId: partnerUserId, body: "hi", sentAt: "2026-09-30T10:00:00.000Z" }
  }
}

test("blocking a partner removes their threads, messages and unread counts at once", () => {
  resetChatStore()
  applyChatThreadListed({ userId: "me", threads: [blockedPartnerThread("t_blocked", "blocked"), blockedPartnerThread("t_other", "other")] })
  applyChatMessageListed({ userId: "me", threadId: "t_blocked", messages: [{ messageId: "m1", threadId: "t_blocked", senderUserId: "blocked", body: "hi", sentAt: "2026-09-30T10:00:00.000Z" }] })
  setActiveThread("t_blocked")
  let notifications = 0
  const unsubscribe = subscribeToChatStore(() => { notifications += 1 })

  const removed = removeChatThreadsWithPartner("blocked")
  unsubscribe()

  assert.deepEqual(removed, ["t_blocked"])
  assert.deepEqual(getThreads().map((thread) => thread.threadId), ["t_other"])
  assert.deepEqual(getMessages("t_blocked"), [])
  assert.equal(getThreadUnreadCount("t_blocked"), 0)
  assert.equal(getTotalUnreadCount(), 2, "only the remaining thread's unread count is left")
  assert.equal(findThreadForPartner("blocked"), undefined)
  assert.equal(notifications, 1)
  assert.deepEqual(removeChatThreadsWithPartner("blocked"), [], "a repeated confirmation is a no-op")
})

test("a thread list requested before the block cannot bring the blocked thread back; a later one can", () => {
  resetChatStore()
  applyChatThreadListed({ userId: "me", threads: [blockedPartnerThread("t_blocked", "blocked")] })
  const staleRequest = beginChatThreadListRequest()
  removeChatThreadsWithPartner("blocked")

  applyChatThreadListed({ userId: "me", threads: [blockedPartnerThread("t_blocked", "blocked"), blockedPartnerThread("t_other", "other")] }, { requestSequence: staleRequest })
  assert.deepEqual(getThreads().map((thread) => thread.threadId), ["t_other"])

  // After an unblock the next normal refresh restores the thread.
  const freshRequest = beginChatThreadListRequest()
  applyChatThreadListed({ userId: "me", threads: [blockedPartnerThread("t_blocked", "blocked"), blockedPartnerThread("t_other", "other")] }, { requestSequence: freshRequest })
  assert.deepEqual(getThreads().map((thread) => thread.threadId).sort(), ["t_blocked", "t_other"])
})

// ── Partner receipts (2026-10-01) ───────────────────────────

test("receipt events move only the partner's cursors and re-render only that conversation", () => {
  resetChatStore()
  applyChatThreadListed({ userId: "me", threads: [blockedPartnerThread("t_receipts", "partner")] })
  const read = createChatThreadSnapshotReader("t_receipts")
  const before = read()
  assert.equal(before.partnerReceipts, undefined)
  const delivered = { sentAt: "2026-09-30T10:00:00.000Z", messageId: "m1" }
  const receipt = { threadId: "t_receipts", participantUserIds: ["me", "partner"] as [string, string] }

  applyChatReceiptUpdated({ ...receipt, userId: "me", deliveredUpTo: delivered }, { localUserId: "me" })
  applyChatReceiptUpdated({ threadId: "t_receipts", userId: "partner", participantUserIds: ["partner", "other"], deliveredUpTo: delivered }, { localUserId: "me" })
  assert.equal(read(), before, "my own cursor and a foreign pair are ignored")

  applyChatReceiptUpdated({ ...receipt, userId: "partner", deliveredUpTo: delivered }, { localUserId: "me" })
  const after = read()
  assert.notEqual(after, before)
  assert.deepEqual(after.partnerReceipts, { deliveredUpTo: delivered })

  let notifications = 0
  const unsubscribe = subscribeToChatStore(() => { notifications += 1 })
  applyChatReceiptUpdated({ ...receipt, userId: "partner", deliveredUpTo: { sentAt: "2026-09-30T09:00:00.000Z", messageId: "m0" } }, { localUserId: "me" })
  unsubscribe()
  assert.equal(notifications, 0, "an older cursor changes nothing")
  assert.equal(read(), after)
})

test("thread and message lists carry the server's receipt view; an old server's lists keep it", () => {
  resetChatStore()
  const delivered = { sentAt: "2026-09-30T10:00:00.000Z", messageId: "m1" }
  applyChatThreadListed({ userId: "me", threads: [{
    ...blockedPartnerThread("t_list", "partner"),
    partnerReceipts: { deliveredUpTo: delivered, readUpTo: delivered }
  }] })
  assert.deepEqual(getPartnerReceipts("t_list"), { deliveredUpTo: delivered, readUpTo: delivered })

  applyChatMessageListed({ userId: "me", threadId: "t_list", messages: [] })
  assert.deepEqual(getPartnerReceipts("t_list"), { deliveredUpTo: delivered, readUpTo: delivered }, "no field: keep")

  // The partner turned read receipts off: the server's view drops readUpTo.
  applyChatMessageListed({ userId: "me", threadId: "t_list", messages: [], partnerReceipts: { deliveredUpTo: delivered } })
  assert.deepEqual(getPartnerReceipts("t_list"), { deliveredUpTo: delivered })
})

test("blocking the partner or switching accounts forgets their receipts", () => {
  resetChatStore()
  applyChatThreadListed({ userId: "me", threads: [{
    ...blockedPartnerThread("t_forget", "blocked"),
    partnerReceipts: { deliveredUpTo: { sentAt: "2026-09-30T10:00:00.000Z", messageId: "m1" } }
  }, blockedPartnerThread("t_keep", "other")] })
  applyChatReceiptUpdated({ threadId: "t_keep", userId: "other", participantUserIds: ["me", "other"],
    deliveredUpTo: { sentAt: "2026-09-30T10:00:00.000Z", messageId: "m2" } }, { localUserId: "me" })
  removeChatThreadsWithPartner("blocked")
  assert.equal(getPartnerReceipts("t_forget"), undefined)
  assert.ok(getPartnerReceipts("t_keep"))
  resetChatStore()
  assert.equal(getPartnerReceipts("t_keep"), undefined)
})
