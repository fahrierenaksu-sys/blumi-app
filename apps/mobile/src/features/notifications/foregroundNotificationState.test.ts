import assert from "node:assert/strict"
import test from "node:test"
import { setActiveThread } from "../chat/chatStore"
import {
  claimForegroundAlert,
  isConversationFocused,
  registerFocusedConversation,
  resetForegroundNotificationAlerts,
  shouldShowIncomingMessageAlert
} from "./foregroundNotificationState"
import * as foreground from "./foregroundNotificationState"

test("a focused room suppresses message toasts even before its thread resolves, and releases suppression on exit", () => {
  resetForegroundNotificationAlerts()
  const release = foreground.registerRoomMessageAlertSuppression()
  assert.equal(shouldShowIncomingMessageAlert({ threadId: "thread_room", messageId: "room_early" }), false)
  assert.equal(shouldShowIncomingMessageAlert({ threadId: "thread_other", messageId: "room_other" }), false)
  release()
  release()
  assert.equal(shouldShowIncomingMessageAlert({ threadId: "thread_other", messageId: "after_exit" }), true)
  assert.equal(claimForegroundAlert("message:room_early"), false, "a delayed push does not repeat the suppressed alert")
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

test("one alert per message across the toast and the push, reset on account change", () => {
  resetForegroundNotificationAlerts()
  assert.equal(shouldShowIncomingMessageAlert({ threadId: "thread_x", messageId: "m1" }), true)
  assert.equal(claimForegroundAlert("message:m1"), false, "the later push sees the toast's claim")
  resetForegroundNotificationAlerts()
  assert.equal(claimForegroundAlert("message:m1"), true)
  const release = registerFocusedConversation("thread_x")
  assert.equal(shouldShowIncomingMessageAlert({ threadId: "thread_x", messageId: "m2" }), false)
  release()
})
