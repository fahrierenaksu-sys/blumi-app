// Adversarial ordering checks for the chat store (2026-09-30): duplicated,
// reordered and delayed server events, HTTP and realtime delivering the same
// message, and sends interrupted by a network loss.
import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import {
  addOptimisticMessage,
  applyChatMessageListed,
  applyChatMessageReceived,
  applyChatThreadCreated,
  applyChatThreadListed,
  applyChatThreadRead,
  beginChatThreadListRequest,
  confirmOptimisticMessage,
  getMessageDeliveryState,
  getMessages,
  getRetryableMessage,
  getThreadUnreadCount,
  getThreads,
  markOptimisticMessageFailed,
  noteRealtimeThreadListRequested,
  resetChatStore
} from "./chatStore"

const ME = "user_me"
const PARTNER = "user_partner"

function thread(threadId: string, createdAt = "2026-09-30T09:00:00.000Z", extra: Partial<ChatThread> = {}): ChatThread {
  return {
    threadId,
    miniRoomId: `mini_${threadId}`,
    participantUserIds: [ME, PARTNER],
    participants: [
      { userId: ME, displayName: "Me" },
      { userId: PARTNER, displayName: "Partner" }
    ],
    createdAt,
    ...extra
  }
}

function message(messageId: string, threadId: string, senderUserId: string, body: string, sentAt: string): ChatMessage {
  return { messageId, threadId, senderUserId, body, sentAt }
}

test("the same realtime message delivered three times renders once and counts one unread", () => {
  resetChatStore()
  try {
    applyChatThreadListed({ userId: ME, threads: [thread("thread_dup", undefined, { unreadCount: 0 })] })
    const incoming = message("m_dup", "thread_dup", PARTNER, "hello", "2026-09-30T10:00:00.000Z")
    for (let index = 0; index < 3; index += 1) applyChatMessageReceived(incoming, { localUserId: ME })
    assert.deepEqual(getMessages("thread_dup").map((entry) => entry.messageId), ["m_dup"])
    assert.equal(getThreadUnreadCount("thread_dup"), 1)
  } finally {
    resetChatStore()
  }
})

test("a delayed older message keeps transcript order and never regresses the thread preview", () => {
  resetChatStore()
  try {
    applyChatThreadListed({ userId: ME, threads: [thread("thread_a"), thread("thread_b", "2026-09-30T08:00:00.000Z")] })
    const newer = message("m_new", "thread_a", PARTNER, "newer", "2026-09-30T10:00:05.000Z")
    const older = message("m_old", "thread_a", PARTNER, "older", "2026-09-30T10:00:01.000Z")
    applyChatMessageReceived(newer, { localUserId: ME })
    applyChatMessageReceived(older, { localUserId: ME })
    assert.deepEqual(getMessages("thread_a").map((entry) => entry.messageId), ["m_old", "m_new"])
    assert.equal(getThreads().find((entry) => entry.threadId === "thread_a")?.lastMessage?.messageId, "m_new")
    applyChatMessageReceived(message("m_b", "thread_b", PARTNER, "b", "2026-09-30T10:00:03.000Z"), { localUserId: ME })
    assert.deepEqual(getThreads().map((entry) => entry.threadId), ["thread_a", "thread_b"])
  } finally {
    resetChatStore()
  }
})

test("a read receipt delivered out of order cannot move the read watermark backwards", () => {
  resetChatStore()
  try {
    applyChatThreadListed({
      userId: ME,
      threads: [thread("thread_read", undefined, {
        unreadCount: 2,
        lastMessage: message("m_last", "thread_read", PARTNER, "x", "2026-09-30T10:00:02.000Z")
      })]
    })
    applyChatThreadRead({ userId: ME, threadId: "thread_read", readAt: "2026-09-30T10:00:05.000Z" })
    assert.equal(getThreadUnreadCount("thread_read"), 0)
    applyChatThreadRead({ userId: ME, threadId: "thread_read", readAt: "2026-09-30T10:00:01.000Z" })
    applyChatThreadRead({ userId: ME, threadId: "thread_read", readAt: "not a date" })
    assert.equal(getThreadUnreadCount("thread_read"), 0)
    assert.equal(getThreads()[0]?.lastReadAt, "2026-09-30T10:00:05.000Z")
  } finally {
    resetChatStore()
  }
})

test("HTTP acknowledgement and realtime echo of one send render one bubble in either order", () => {
  for (const order of ["ack-first", "echo-first"] as const) {
    resetChatStore()
    try {
      const pending = addOptimisticMessage({ threadId: "thread_echo", senderUserId: ME, body: "hi", clientMessageId: `client_${order}` })
      const canonical = message(`m_${order}`, "thread_echo", ME, "hi", "2026-09-30T10:00:00.000Z")
      if (order === "ack-first") {
        confirmOptimisticMessage(pending.clientMessageId, canonical, ME)
        applyChatMessageReceived(canonical, { localUserId: ME })
      } else {
        applyChatMessageReceived(canonical, { localUserId: ME })
        confirmOptimisticMessage(pending.clientMessageId, canonical, ME)
      }
      applyChatMessageListed({ userId: ME, threadId: "thread_echo", messages: [canonical] })
      assert.deepEqual(getMessages("thread_echo").map((entry) => entry.messageId), [`m_${order}`], order)
      assert.equal(getThreadUnreadCount("thread_echo"), 0, order)
    } finally {
      resetChatStore()
    }
  }
})

test("a send whose response was lost is not shown as a failed duplicate after history resync", () => {
  // Fixed 2026-09-30: history resync now reconciles a failed or pending
  // optimistic bubble with its newly listed committed copy (same thread,
  // sender and body), so the message shows once, as sent.
  resetChatStore()
  try {
    const pending = addOptimisticMessage({ threadId: "thread_lost_ack", senderUserId: ME, body: "see you at 8", clientMessageId: "client_lost_ack" })
    // The server committed the message but the HTTP response and the
    // realtime echo were lost with the network; the send is marked failed.
    markOptimisticMessageFailed(pending.clientMessageId)
    assert.equal(getRetryableMessage(pending.localMessageId)?.clientMessageId, "client_lost_ack", "retry reuses the same client id")
    applyChatMessageListed({
      userId: ME,
      threadId: "thread_lost_ack",
      messages: [message("m_committed", "thread_lost_ack", ME, "see you at 8", new Date().toISOString())]
    })
    const messages = getMessages("thread_lost_ack")
    assert.deepEqual(messages.map((entry) => entry.body), ["see you at 8"], "one bubble for one committed message")
    assert.equal(messages[0]?.messageId, "m_committed")
    assert.equal(getMessageDeliveryState("m_committed"), "sent")
    assert.equal(getRetryableMessage(pending.localMessageId), null)
  } finally {
    resetChatStore()
  }
})

test("history resync never merges a failed bubble into an older identical message or a partner message", () => {
  resetChatStore()
  try {
    const earlier = message("m_earlier_ok", "thread_same_body", ME, "ok", new Date(Date.now() - 60_000).toISOString())
    applyChatMessageListed({ userId: ME, threadId: "thread_same_body", messages: [earlier] })
    const pending = addOptimisticMessage({ threadId: "thread_same_body", senderUserId: ME, body: "ok", clientMessageId: "client_second_ok" })
    markOptimisticMessageFailed(pending.clientMessageId)
    // The same history (already known) and a partner "ok" arrive again.
    applyChatMessageListed({
      userId: ME,
      threadId: "thread_same_body",
      messages: [earlier, message("m_partner_ok", "thread_same_body", PARTNER, "ok", new Date().toISOString())]
    })
    assert.deepEqual(getMessages("thread_same_body").map((entry) => entry.messageId).sort(), [pending.localMessageId, "m_earlier_ok", "m_partner_ok"].sort())
    assert.equal(getMessageDeliveryState(pending.localMessageId), "failed")
    // A days-old identical message loaded cold is not this send either.
    applyChatMessageListed({
      userId: ME,
      threadId: "thread_same_body",
      messages: [message("m_old_ok", "thread_same_body", ME, "ok", "2026-01-01T10:00:00.000Z")]
    })
    assert.equal(getMessageDeliveryState(pending.localMessageId), "failed")
  } finally {
    resetChatStore()
  }
})

test("a duplicated canonical acknowledgement cannot consume the next identical pending send", () => {
  resetChatStore()
  try {
    const threadId = "synthetic-duplicate-ack"
    const first = addOptimisticMessage({ threadId, senderUserId: ME, body: "Synthetic same text", clientMessageId: "synthetic-first" })
    const second = addOptimisticMessage({ threadId, senderUserId: ME, body: "Synthetic same text", clientMessageId: "synthetic-second" })
    const canonical = message("synthetic-canonical-first", threadId, ME, "Synthetic same text", new Date().toISOString())
    applyChatMessageReceived(canonical, { localUserId: ME })
    confirmOptimisticMessage(first.clientMessageId, canonical, ME)
    assert.equal(getRetryableMessage(second.localMessageId)?.clientMessageId, second.clientMessageId)
    applyChatMessageReceived(canonical, { localUserId: ME })
    assert.equal(getRetryableMessage(second.localMessageId)?.clientMessageId, second.clientMessageId, "the duplicate cannot acknowledge the second tap")
    assert.equal(getMessageDeliveryState(second.localMessageId), "sending")
    assert.equal(getMessages(threadId).length, 2)
  } finally {
    resetChatStore()
  }
})

test("ordered live insertion preserves retained rows and server ACK authority while pending rows stay newest with a skewed clock", () => {
  resetChatStore()
  try {
    const threadId = "synthetic-live-order"
    const time = (offset: number) => new Date(Date.now() + offset).toISOString()
    const existing = [message("synthetic-one", threadId, PARTNER, "Synthetic content", time(-10_000)),
      message("synthetic-three", threadId, PARTNER, "Synthetic content", time(-5_000))]
    applyChatMessageListed({ userId: ME, threadId, messages: existing })
    const retained = [...getMessages(threadId)]
    const delayed = message("synthetic-two", threadId, PARTNER, "Synthetic delayed", time(-7_500))
    applyChatMessageReceived(delayed, { localUserId: ME })
    const tied = { ...delayed, messageId: "synthetic-tied" }
    applyChatMessageReceived(tied, { localUserId: ME })
    assert.deepEqual(getMessages(threadId).map((entry) => entry.messageId), [existing[0]!.messageId, delayed.messageId, tied.messageId, existing[1]!.messageId])
    assert.equal(getMessages(threadId)[0], retained[0])
    assert.equal(getMessages(threadId)[3], retained[1])
    const future = message("synthetic-server-future", threadId, PARTNER, "Synthetic skew", time(60_000))
    applyChatMessageReceived(future, { localUserId: ME })
    const pending = addOptimisticMessage({ threadId, senderUserId: ME, body: "Synthetic local", clientMessageId: "synthetic-skew" })
    const incoming = message("synthetic-between", threadId, PARTNER, "Synthetic later", time(1_000))
    applyChatMessageReceived(incoming, { localUserId: ME })
    const sorted = getMessages(threadId)
    assert.ok(sorted.every((entry, index) => index === 0 || Date.parse(sorted[index - 1]!.sentAt) <= Date.parse(entry.sentAt)))
    assert.equal(sorted.at(-1)?.messageId, pending.localMessageId, "the newly sent local row stays at the newest visible edge")
    const committed = message("synthetic-clock-ack", threadId, ME, "Synthetic local", time(2_000))
    confirmOptimisticMessage(pending.clientMessageId, committed, ME)
    assert.equal(getMessages(threadId).find((entry) => entry.messageId === committed.messageId)?.sentAt, committed.sentAt, "the ACK restores the actual server time")
    assert.equal(getMessages(threadId).at(-1)?.messageId, future.messageId)
  } finally {
    resetChatStore()
  }
})

test("an in-room message lost with the socket becomes failed and retryable with the same client id", () => {
  // Fixed 2026-09-30: in-room sends are tracked by clientMessageId; the
  // MiniRoom hook marks them failed on socket close or acknowledgement
  // timeout (see useInRoomChat.reconnect.test.ts).
  resetChatStore()
  try {
    const pending = addOptimisticMessage({ threadId: "thread_room", senderUserId: ME, body: "brb", clientMessageId: "room_client_1" })
    markOptimisticMessageFailed(pending.clientMessageId)
    applyChatMessageListed({ userId: ME, threadId: "thread_room", messages: [] })
    assert.equal(getMessageDeliveryState(pending.localMessageId), "failed")
    assert.equal(getRetryableMessage(pending.localMessageId)?.clientMessageId, "room_client_1")
  } finally {
    resetChatStore()
  }
})

test("a stale first thread-list page applied after chat.thread_created keeps the new thread", () => {
  // Fixed 2026-09-30: a non-append list keeps threads the client learned
  // about after that list request was issued.
  resetChatStore()
  try {
    applyChatThreadListed({ userId: ME, threads: [thread("thread_old")] })
    applyChatThreadCreated(thread("thread_new_match", "2026-09-30T10:00:00.000Z"))
    // The reply to the reconnect list request was computed before the match.
    applyChatThreadListed({ userId: ME, threads: [thread("thread_old")] })
    assert.deepEqual(getThreads().map((entry) => entry.threadId).sort(), ["thread_new_match", "thread_old"])
  } finally {
    resetChatStore()
  }
})

test("tracked list requests keep threads learned after issue and drop them once a newer list omits them", () => {
  resetChatStore()
  try {
    applyChatThreadListed({ userId: ME, threads: [thread("thread_old")] })
    noteRealtimeThreadListRequested()
    const httpRequest = beginChatThreadListRequest()
    applyChatThreadCreated(thread("thread_new_match", "2026-09-30T10:00:00.000Z"))
    // Both replies were computed before the match.
    applyChatThreadListed({ userId: ME, threads: [thread("thread_old")] })
    applyChatThreadListed({ userId: ME, threads: [thread("thread_old")] }, { requestSequence: httpRequest })
    assert.deepEqual(getThreads().map((entry) => entry.threadId).sort(), ["thread_new_match", "thread_old"])
    // A list requested after the match is authoritative: the thread is gone
    // (for example unmatched or blocked meanwhile).
    noteRealtimeThreadListRequested()
    applyChatThreadListed({ userId: ME, threads: [thread("thread_old")] })
    assert.deepEqual(getThreads().map((entry) => entry.threadId), ["thread_old"])
  } finally {
    resetChatStore()
  }
})
