import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import { getMiniRoomCopy } from "./miniRoomCopy"
import {
  formatRoomChatHistoryDay,
  formatRoomChatTime,
  ROOM_CHAT_HISTORY_LIMIT,
  resolveRoomChatHistoryStatus,
  selectRoomChatHistory,
  roomChatHistoryKeyOf,
  type RoomChatDelivery
} from "./roomChatHistoryModel"

const local = "local-user"
const partner = "partner-user"

function message(messageId: string, senderUserId: string, body: string): ChatMessage {
  return {
    messageId,
    threadId: "thread",
    senderUserId,
    body,
    sentAt: "2026-09-30T12:00:00.000Z"
  }
}

const allSent = (): RoomChatDelivery => "sent"

test("history keeps each durable timestamp while retaining real sending and failed states", () => {
  const earlier = { ...message("earlier", partner, "a"), sentAt: "2026-10-02T08:04:00.000Z" }
  const pending = { ...message("pending", local, "b"), sentAt: "2026-10-02T08:05:00.000Z" }
  const failed = { ...message("failed", local, "c"), sentAt: "2026-10-02T08:06:00.000Z" }
  const history = selectRoomChatHistory({
    messages: [earlier, pending, failed],
    localUserId: local,
    deliveryOf: (id) => id === "pending" ? "sending" : id === "failed" ? "failed" : "sent"
  })

  assert.deepEqual(history.map((item) => [item.sentAt, item.delivery]), [
    [failed.sentAt, "failed"],
    [pending.sentAt, "sending"],
    [earlier.sentAt, "sent"]
  ])
})

test("adding a message preserves unchanged history rows and recalculates only a changed sender boundary", () => {
  const messages = Array.from({ length: 15 }, (_, index) => message(`row-${index}`, partner, `Line ${index}`))
  const before = selectRoomChatHistory({ messages, localUserId: local, deliveryOf: allSent })
  const newSender = selectRoomChatHistory({
    messages: [...messages, message("new-local", local, "New")], localUserId: local,
    deliveryOf: allSent, previousItems: before
  })
  assert.ok(newSender.slice(1).every((item, index) => item === before[index]), "all unchanged rows retain identity")
  const sameSender = selectRoomChatHistory({
    messages: [...messages, message("new-partner", partner, "New")], localUserId: local,
    deliveryOf: allSent, previousItems: before
  })
  assert.equal(sameSender[1]?.showMeta, false)
  assert.notEqual(sameSender[1], before[0], "the old newest row changes its sender boundary")
  assert.ok(sameSender.slice(2).every((item, index) => item === before[index + 1]))
  const unchanged = selectRoomChatHistory({
    messages: [...messages], localUserId: local, deliveryOf: allSent, previousItems: before
  })
  assert.equal(unchanged, before, "unchanged visible data preserves the whole array")
})

test("acknowledgement preserves the list key while canonical identity, time and delivery update", () => {
  const older = message("older", partner, "Earlier")
  const pending = message("local-pending", local, "Pending")
  const before = selectRoomChatHistory({
    messages: [older, pending], localUserId: local,
    deliveryOf: (id) => id === pending.messageId ? "sending" : "sent"
  })
  const confirmed = { ...pending, messageId: "confirmed", sentAt: "2026-10-03T09:00:00.000Z" }
  const after = selectRoomChatHistory({
    messages: [older, confirmed], localUserId: local, deliveryOf: allSent,
    renderKeyOf: (id) => id === confirmed.messageId ? pending.messageId : id, previousItems: before
  })
  assert.equal(roomChatHistoryKeyOf(after[0]!), roomChatHistoryKeyOf(before[0]!))
  assert.equal(after[0]?.id, confirmed.messageId)
  assert.equal(after[0]?.sentAt, confirmed.sentAt)
  assert.equal(after[0]?.delivery, "sent")
  assert.equal(after[1], before[1])
})

test("bubble time uses the device-local clock and never substitutes a missing or invalid time", () => {
  const localDate = new Date(2026, 9, 2, 8, 4)
  assert.equal(formatRoomChatTime(localDate.toISOString()), "08:04")
  assert.equal(formatRoomChatTime(new Date(2026, 9, 2, 23, 59).toISOString()), "23:59")
  assert.equal(formatRoomChatTime(undefined), null)
  assert.equal(formatRoomChatTime(""), null)
  assert.equal(formatRoomChatTime("invalid-time"), null)
})

test("room history is the durable thread, newest first, without invitation sentinels", () => {
  const history = selectRoomChatHistory({
    messages: [
      message("m1", partner, "Selam"),
      message("invite", local, "__room_invite__"),
      message("m2", local, "Hoş geldin"),
      message("blank", partner, "   ")
    ],
    localUserId: local,
    deliveryOf: allSent
  })

  assert.deepEqual(history.map((item) => [item.id, item.mine]), [
    ["m2", true],
    ["m1", false]
  ])
})

test("the sender line shows once per run of one sender and always for pending or failed sends", () => {
  const delivery: Record<string, RoomChatDelivery> = { "__local_2": "failed" }
  const history = selectRoomChatHistory({
    messages: [
      message("p1", partner, "a"),
      message("p2", partner, "b"),
      message("l1", local, "c"),
      message("__local_2", local, "d")
    ],
    localUserId: local,
    deliveryOf: (id) => delivery[id] ?? "sent"
  })

  assert.deepEqual(history.map((item) => [item.id, item.delivery, item.showMeta]), [
    ["__local_2", "failed", true],
    ["l1", "sent", false],
    ["p2", "sent", true],
    ["p1", "sent", false]
  ])
})

test("MiniRoom keeps only the latest 15 messages while older thread history remains available", () => {
  const messages = Array.from({ length: 90 }, (_, index) => message(`m${index}`, partner, `hi ${index}`))
  const history = selectRoomChatHistory({ messages, localUserId: local, deliveryOf: allSent })

  assert.equal(ROOM_CHAT_HISTORY_LIMIT, 15)
  assert.equal(history.length, 15)
  assert.equal(history[0]?.id, "m89")
  assert.equal(history.at(-1)?.id, "m75")
  assert.equal(messages.length, 90, "selecting the MiniRoom window never truncates the shared thread")
})

test("history status distinguishes no thread, loading, failure and an empty conversation", () => {
  assert.equal(resolveRoomChatHistoryStatus({ hasThread: false, listStatus: "ready", itemCount: 0 }), "unavailable")
  assert.equal(resolveRoomChatHistoryStatus({ hasThread: true, listStatus: "idle", itemCount: 0 }), "loading")
  assert.equal(resolveRoomChatHistoryStatus({ hasThread: true, listStatus: "loading", itemCount: 0 }), "loading")
  assert.equal(resolveRoomChatHistoryStatus({ hasThread: true, listStatus: "failed", itemCount: 0 }), "failed")
  assert.equal(resolveRoomChatHistoryStatus({ hasThread: true, listStatus: "ready", itemCount: 0 }), "ready")
  // Cached messages stay visible while a refresh loads or fails.
  assert.equal(resolveRoomChatHistoryStatus({ hasThread: true, listStatus: "failed", itemCount: 3 }), "ready")
  assert.equal(resolveRoomChatHistoryStatus({ hasThread: true, listStatus: "loading", itemCount: 3 }), "ready")
})

test("the history day comes from the newest message, not the day the room is opened", () => {
  const labels = { today: "Today", yesterday: "Yesterday", dateLocale: "en-US" }
  const now = new Date(2026, 9, 2, 0, 5)
  assert.equal(formatRoomChatHistoryDay(new Date(2026, 9, 2, 0, 1).toISOString(), labels, now), "Today")
  assert.equal(formatRoomChatHistoryDay(new Date(2026, 9, 1, 23, 59).toISOString(), labels, now), "Yesterday")
  const older = new Date(2026, 8, 14, 12, 0)
  assert.equal(formatRoomChatHistoryDay(older.toISOString(), labels, now),
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(older))
  const lastYear = new Date(2025, 11, 31, 12, 0)
  assert.match(formatRoomChatHistoryDay(lastYear.toISOString(), labels, now) ?? "", /2025/)
  // A missing or broken time shows no day rather than an invented one.
  assert.equal(formatRoomChatHistoryDay(undefined, labels, now), null)
  assert.equal(formatRoomChatHistoryDay("not-a-date", labels, now), null)
})

test("both languages label the newest message's day", () => {
  const now = new Date(2026, 9, 2, 12, 0)
  const yesterday = new Date(2026, 9, 1, 9, 0).toISOString()
  assert.notEqual(getMiniRoomCopy("tr").historyDay(yesterday, now), getMiniRoomCopy("tr").historyDay(now.toISOString(), now))
  assert.notEqual(getMiniRoomCopy("en").historyDay(yesterday, now), getMiniRoomCopy("en").historyDay(now.toISOString(), now))
})
