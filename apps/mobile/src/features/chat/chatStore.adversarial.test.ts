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
  confirmOptimisticMessage,
  getMessageDeliveryState,
  getMessages,
  getRetryableMessage,
  getThreadUnreadCount,
  getThreads,
  markOptimisticMessageFailed,
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

test(
  "a send whose response was lost is not shown as a failed duplicate after history resync",
  { todo: "BUG: applyChatMessageListed never reconciles a failed optimistic bubble with its committed server copy (lost ACK), so the user sees the message twice, once as failed" },
  () => {
    resetChatStore()
    try {
      const pending = addOptimisticMessage({ threadId: "thread_lost_ack", senderUserId: ME, body: "see you at 8", clientMessageId: "client_lost_ack" })
      // The server committed the message but the HTTP response and the
      // realtime echo were lost with the network; the send is marked failed.
      markOptimisticMessageFailed(pending.clientMessageId)
      applyChatMessageListed({
        userId: ME,
        threadId: "thread_lost_ack",
        messages: [message("m_committed", "thread_lost_ack", ME, "see you at 8", "2026-09-30T10:00:00.000Z")]
      })
      const bodies = getMessages("thread_lost_ack").map((entry) => entry.body)
      assert.deepEqual(bodies, ["see you at 8"], "one bubble for one committed message")
    } finally {
      resetChatStore()
    }
  }
)

test(
  "an in-room message lost with the socket does not stay 'sending' forever",
  { todo: "BUG: in-room chat.send_message has no ACK or clientMessageId, so a frame lost on disconnect leaves a permanent 'sending' bubble with no retry" },
  () => {
    resetChatStore()
    try {
      // useInRoomChat adds an untracked optimistic bubble and sends over the socket.
      const pending = addOptimisticMessage({ threadId: "thread_room", senderUserId: ME, body: "brb" })
      // The socket dropped before the server read the frame; reconnect history
      // is authoritative and does not contain it.
      applyChatMessageListed({ userId: ME, threadId: "thread_room", messages: [] })
      const state = getMessageDeliveryState(pending.localMessageId)
      assert.ok(
        state !== "sending" || getRetryableMessage(pending.localMessageId) !== null,
        "a lost room message must become failed or retryable"
      )
    } finally {
      resetChatStore()
    }
  }
)

test(
  "a stale first thread-list page applied after chat.thread_created keeps the new thread",
  { todo: "BUG: a non-append chat.thread_listed replaces the cache; a page computed before a match erases the newer chat.thread_created" },
  () => {
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
  }
)
