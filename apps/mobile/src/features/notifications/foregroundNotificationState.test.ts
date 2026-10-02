import assert from "node:assert/strict"
import test from "node:test"
import { setActiveThread } from "../chat/chatStore"
import {
  areMessageAlertsSuppressed,
  claimForegroundAlert,
  isConversationFocused,
  noteIncomingMessage,
  registerFocusedConversation,
  registerMessageAlertSuppression,
  resetForegroundNotificationAlerts,
  subscribeToConversationFocus
} from "./foregroundNotificationState"

test("a focused room or the Chats list claims every arriving message until it is released", () => {
  resetForegroundNotificationAlerts()
  const release = registerMessageAlertSuppression()
  assert.equal(areMessageAlertsSuppressed(), true)
  noteIncomingMessage({ threadId: "thread_room", messageId: "room_early" })
  noteIncomingMessage({ threadId: "thread_other", messageId: "room_other" })
  release()
  release()
  assert.equal(areMessageAlertsSuppressed(), false)
  noteIncomingMessage({ threadId: "thread_other", messageId: "after_exit" })
  assert.equal(claimForegroundAlert("message:room_early"), false, "a delayed push does not repeat the seen message")
  assert.equal(claimForegroundAlert("message:room_other"), false)
  assert.equal(claimForegroundAlert("message:after_exit"), true, "an unseen message leaves its alert to the push banner")
})

test("a conversation stays focused until every surface showing it releases it", () => {
  const first = registerFocusedConversation("thread_room")
  const second = registerFocusedConversation("thread_room")
  assert.equal(isConversationFocused("thread_room"), true)
  first()
  first()
  assert.equal(isConversationFocused("thread_room"), true, "a repeated release does not drop another owner")
  second()
  assert.equal(isConversationFocused("thread_room"), false)
})

test("the open chat thread counts as focused through the chat store", () => {
  setActiveThread("thread_chat")
  assert.equal(isConversationFocused("thread_chat"), true)
  setActiveThread(null)
  assert.equal(isConversationFocused("thread_chat"), false)
})

test("a message seen in its open chat is never alerted again; the ledger resets on account change", () => {
  resetForegroundNotificationAlerts()
  const release = registerFocusedConversation("thread_x")
  noteIncomingMessage({ threadId: "thread_x", messageId: "m1" })
  release()
  assert.equal(claimForegroundAlert("message:m1"), false, "the late push sees the open chat's claim")
  resetForegroundNotificationAlerts()
  assert.equal(claimForegroundAlert("message:m1"), true)
})

test("opening a conversation tells subscribers, so its delivered banners can be cleared", () => {
  const opened: string[] = []
  const unsubscribe = subscribeToConversationFocus((threadId) => { opened.push(threadId) })
  const throwing = subscribeToConversationFocus(() => { throw new Error("native failure") })
  const release = registerFocusedConversation("thread_a")
  assert.equal(isConversationFocused("thread_a"), true, "a failing subscriber does not break focus")
  release()
  unsubscribe()
  throwing()
  registerFocusedConversation("thread_b")()
  assert.deepEqual(opened, ["thread_a"])
})
