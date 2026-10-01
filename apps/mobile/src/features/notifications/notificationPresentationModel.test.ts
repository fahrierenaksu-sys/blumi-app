import assert from "node:assert/strict"
import test from "node:test"
import {
  createForegroundAlertLedger,
  foregroundAlertKey,
  resolveForegroundNotificationPresentation,
  shouldShowInAppMessageAlert
} from "./notificationPresentationModel"

function presentation(data: unknown, options: {
  appActive?: boolean
  focused?: string[]
  presented?: string[]
} = {}) {
  const ledger = createForegroundAlertLedger()
  for (const key of options.presented ?? []) ledger.claim(key)
  const result = resolveForegroundNotificationPresentation({
    data,
    appActive: options.appActive ?? true,
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

test("a message already shown by the in-app toast is not shown again by the push", () => {
  const data = { type: "chat.message", threadId: "thread_a", messageId: "m1" }
  assert.equal(presentation(data, { presented: ["message:m1"] }).shouldShowBanner, false)
  const first = presentation(data)
  assert.equal(first.shouldShowBanner, true)
  assert.equal(first.ledger.claim("message:m1"), false, "the push claims the alert so a late toast stays quiet")
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

test("the in-app message toast yields to an open conversation and to a banner already shown", () => {
  const ledger = createForegroundAlertLedger()
  const focused = (threadId: string) => threadId === "thread_open"
  assert.equal(shouldShowInAppMessageAlert({ threadId: "thread_open", messageId: "m1" }, focused, ledger.claim), false)
  assert.equal(shouldShowInAppMessageAlert({ threadId: "thread_other", messageId: "m2" }, focused, ledger.claim), true)
  assert.equal(shouldShowInAppMessageAlert({ threadId: "thread_other", messageId: "m2" }, focused, ledger.claim), false)
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
