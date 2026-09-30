import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import {
  resolveRoomChatHistoryStatus,
  selectRoomChatHistory,
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

test("a long conversation is capped so the room never renders the whole thread", () => {
  const messages = Array.from({ length: 90 }, (_, index) => message(`m${index}`, partner, `hi ${index}`))
  const history = selectRoomChatHistory({ messages, localUserId: local, deliveryOf: allSent, limit: 60 })

  assert.equal(history.length, 60)
  assert.equal(history[0]?.id, "m89")
  assert.equal(history.at(-1)?.id, "m30")
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
