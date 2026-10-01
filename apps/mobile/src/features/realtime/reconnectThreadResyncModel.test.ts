import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread } from "@blumi/contracts"
import {
  MAX_RECONNECT_THREAD_RESYNCS,
  selectThreadsToResynchronize,
  snapshotThreadLastMessages
} from "./reconnectThreadResyncModel"

function thread(threadId: string, lastMessageId?: string): ChatThread {
  return {
    threadId,
    miniRoomId: `room_${threadId}`,
    participantUserIds: ["ada", "bora"],
    participants: [{ userId: "ada" }, { userId: "bora" }],
    createdAt: "2026-10-01T09:00:00.000Z",
    ...(lastMessageId ? {
      lastMessage: {
        messageId: lastMessageId,
        threadId,
        senderUserId: "bora",
        body: "hi",
        sentAt: "2026-10-01T09:05:00.000Z"
      }
    } : {})
  }
}

test("only cached conversations whose latest message changed are refetched", () => {
  const before = snapshotThreadLastMessages([
    thread("unchanged", "m1"),
    thread("changed", "m2"),
    thread("first_message"),
    thread("not_cached", "m4")
  ])
  const listed = [
    thread("changed", "m2b"),
    thread("first_message", "m3"),
    thread("unchanged", "m1"),
    thread("not_cached", "m4b"),
    thread("brand_new", "m5")
  ]
  assert.deepEqual(selectThreadsToResynchronize({
    before,
    listed,
    hasMessageHistory: (threadId) => threadId !== "not_cached"
  }), ["changed", "first_message"])
})

test("the active conversation is skipped because it is resynchronized on its own", () => {
  const before = snapshotThreadLastMessages([thread("active", "m1"), thread("other", "m2")])
  assert.deepEqual(selectThreadsToResynchronize({
    before,
    listed: [thread("active", "m1b"), thread("other", "m2b")],
    hasMessageHistory: () => true,
    activeThreadId: "active"
  }), ["other"])
})

test("a long outage refetches at most a bounded number of the most recent conversations", () => {
  const threads = Array.from({ length: 12 }, (_, index) => thread(`t${index}`, `m${index}`))
  const listed = threads.map((entry, index) => thread(entry.threadId, `m${index}b`))
  const selected = selectThreadsToResynchronize({
    before: snapshotThreadLastMessages(threads),
    listed,
    hasMessageHistory: () => true
  })
  assert.equal(selected.length, MAX_RECONNECT_THREAD_RESYNCS)
  assert.deepEqual(selected, listed.slice(0, MAX_RECONNECT_THREAD_RESYNCS).map((entry) => entry.threadId))
})
