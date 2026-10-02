import assert from "node:assert/strict"
import test from "node:test"
import {
  claimVisibleIncomingMessage,
  createForegroundAlertLedger,
  foregroundAlertKey,
  isConversationNotificationData,
  resolveForegroundNotificationPresentation
} from "./notificationPresentationModel"

function presentation(data: unknown, options: {
  appActive?: boolean
  focused?: string[]
  presented?: string[]
  suppressMessageAlerts?: boolean
} = {}) {
  const ledger = createForegroundAlertLedger()
  for (const key of options.presented ?? []) ledger.claim(key)
  const result = resolveForegroundNotificationPresentation({
    data,
    appActive: options.appActive ?? true,
    suppressMessageAlerts: options.suppressMessageAlerts,
    isConversationFocused: (threadId) => (options.focused ?? []).includes(threadId),
    claimAlert: ledger.claim
  })
  return { ...result, ledger }
}

test("a message or room invite for the open conversation is not shown as a banner", () => {
  for (const data of [
    { type: "chat.message", threadId: "thread_a", messageId: "m1" },
    { type: "chat.room_invite", threadId: "thread_a", inviteId: "i1" }
  ]) {
    const hidden = presentation(data, { focused: ["thread_a"] })
    assert.equal(hidden.shouldShowBanner, false)
    assert.equal(hidden.shouldShowList, false)
    assert.equal(presentation(data, { focused: ["thread_b"] }).shouldShowBanner, true)
    assert.equal(presentation(data, { focused: ["thread_a"], appActive: false }).shouldShowBanner, true)
  }
})

test("room focus suppresses foreground message banners without disabling background notifications", () => {
  const message = { type: "chat.message", threadId: "other_thread", messageId: "room_message" }
  assert.equal(presentation(message, { suppressMessageAlerts: true }).shouldShowBanner, false)
  assert.equal(presentation(message, { suppressMessageAlerts: true, appActive: false }).shouldShowBanner, true)
  assert.equal(presentation({ type: "discovery.like" }, { suppressMessageAlerts: true }).shouldShowBanner, true)
})

test("a delayed message push is hidden after the message was already displayed", () => {
  const data = { type: "chat.message", threadId: "thread_a", messageId: "already-read" }
  const presented = ["message:already-read"]
  assert.equal(presentation(data, { presented }).shouldShowBanner, false)
  assert.equal(presentation(data, { presented, appActive: false }).shouldShowBanner, false)
  assert.equal(presentation(data, { appActive: false }).shouldShowBanner, true)
})

test("a message already presented is not shown again by a repeated push", () => {
  const data = { type: "chat.message", threadId: "thread_a", messageId: "m1" }
  assert.equal(presentation(data, { presented: ["message:m1"] }).shouldShowBanner, false)
  const first = presentation(data)
  assert.equal(first.shouldShowBanner, true)
  assert.equal(first.ledger.claim("message:m1"), false, "the banner claims the alert")
})

test("the open-conversation rule holds in active and inactive states for X; Y still banners", () => {
  // appActive is true for iOS "active" and "inactive" (Notification Center,
  // Control Center, an incoming call sheet over the open chat).
  for (const type of ["chat.message", "chat.room_invite"]) {
    const fromX = { type, threadId: "thread_x", messageId: "mx", inviteId: "ix" }
    const fromY = { type, threadId: "thread_y", messageId: "my", inviteId: "iy" }
    assert.equal(presentation(fromX, { focused: ["thread_x"] }).shouldShowBanner, false)
    assert.equal(presentation(fromX, { focused: ["thread_x"] }).shouldShowList, false)
    assert.equal(presentation(fromY, { focused: ["thread_x"] }).shouldShowBanner, true)
  }
})

test("the Chats list suppresses message banners only; invites and matches still banner", () => {
  const options = { suppressMessageAlerts: true }
  assert.equal(presentation({ type: "chat.message", threadId: "thread_y", messageId: "m" }, options).shouldShowBanner, false)
  assert.equal(presentation({ type: "chat.room_invite", threadId: "thread_y", inviteId: "i" }, options).shouldShowBanner, true)
  assert.equal(presentation({ type: "discovery.match", matchId: "x" }, options).shouldShowBanner, true)
})

test("the match someone is already looking at does not banner again", () => {
  const data = { type: "discovery.match", matchId: "match_1" }
  assert.equal(presentation(data, { presented: ["match:match_1"] }).shouldShowBanner, false)
  assert.equal(presentation(data).shouldShowBanner, true)
})

test("a realtime connection match is presented by the in-app modal while the app is open", () => {
  assert.equal(presentation({ type: "connection.matched", miniRoomId: "room" }).shouldShowBanner, false)
  assert.equal(presentation({ type: "connection.matched", miniRoomId: "room" }, { appActive: false }).shouldShowBanner, true)
})

test("likes, Discovery Watch and unknown pushes keep their banner; foreground pushes stay silent", () => {
  for (const data of [{ type: "discovery.like" }, { type: "discovery.watch_match" }, { type: "future.type" }, null, "junk"]) {
    const result = presentation(data)
    assert.equal(result.shouldShowBanner, true)
    assert.equal(result.shouldShowList, true)
    assert.equal(result.shouldPlaySound, false)
    assert.equal(result.shouldSetBadge, false)
  }
})

test("alert keys use only routing ids", () => {
  assert.equal(foregroundAlertKey({ type: "chat.message", messageId: " m1 " }), "message:m1")
  assert.equal(foregroundAlertKey({ type: "chat.room_invite", inviteId: "i1" }), "room-invite:i1")
  assert.equal(foregroundAlertKey({ type: "discovery.match", matchId: "x" }), "match:x")
  assert.equal(foregroundAlertKey({ type: "chat.message" }), null)
  assert.equal(foregroundAlertKey({ type: "discovery.like" }), null)
})

test("a socket message claims its alert only when visible, so the push banner stays the one alert", () => {
  const ledger = createForegroundAlertLedger()
  const visible = (threadId: string) => threadId === "thread_open"
  assert.equal(claimVisibleIncomingMessage({ threadId: "thread_open", messageId: "m1" }, visible, ledger.claim), true)
  assert.equal(claimVisibleIncomingMessage({ threadId: "thread_other", messageId: "m2" }, visible, ledger.claim), false)
  assert.equal(ledger.claim("message:m1"), false, "a late push for the seen message stays quiet")
  assert.equal(ledger.claim("message:m2"), true, "the unseen message is left to its push banner")
})

test("delivered notifications of one conversation are recognised for clearing", () => {
  assert.equal(isConversationNotificationData({ type: "chat.message", threadId: "t1", messageId: "m" }, "t1"), true)
  assert.equal(isConversationNotificationData({ type: "chat.room_invite", threadId: "t1", inviteId: "i" }, "t1"), true)
  assert.equal(isConversationNotificationData({ type: "chat.message", threadId: "t2" }, "t1"), false)
  assert.equal(isConversationNotificationData({ type: "discovery.match", threadId: "t1" }, "t1"), false)
  assert.equal(isConversationNotificationData(null, "t1"), false)
})

test("the alert ledger forgets old entries and stays bounded", () => {
  let now = 0
  const ledger = createForegroundAlertLedger({ capacity: 3, ttlMs: 1000, now: () => now })
  assert.equal(ledger.claim("a"), true)
  assert.equal(ledger.claim("a"), false)
  now = 1001
  assert.equal(ledger.claim("a"), true, "an expired claim can be made again")
  ledger.claim("b"); ledger.claim("c"); ledger.claim("d")
  assert.equal(ledger.size(), 3)
  ledger.reset()
  assert.equal(ledger.size(), 0)
})
