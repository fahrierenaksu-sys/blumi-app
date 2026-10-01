import assert from "node:assert/strict"
import test from "node:test"
import {
  applyTypingUpdate,
  CHAT_TYPING_ANNOUNCE_COOLDOWN_MS,
  CHAT_TYPING_DEFAULT_LIFETIME_MS,
  CHAT_TYPING_RENEW_MS,
  clearTypingForMessage,
  clearTypingForUser,
  IDLE_TYPING_SENDER,
  isPartnerTyping,
  nextTypingExpiry,
  NO_PARTNER_TYPING,
  planDraftChange,
  planDraftEnd,
  pruneExpiredTyping,
  shouldAnnounceTyping,
  type ChatTypingSenderState
} from "./chatTypingModel"

const T = "thread-1"

function typeSequence(times: number[], texts?: string[]) {
  let state: ChatTypingSenderState = IDLE_TYPING_SENDER
  const sent: string[] = []
  times.forEach((now, index) => {
    const plan = planDraftChange(state, { threadId: T, text: texts?.[index] ?? "hel", now })
    if (plan.send) sent.push(`${plan.send.state}@${now}`)
    state = plan.next
  })
  return { state, sent }
}

test("a start goes out on the first change and is renewed at most every 3 s while typing", () => {
  const { sent } = typeSequence([0, 200, 900, 2_999, 3_000, 4_500, 6_100])
  assert.deepEqual(sent, ["start@0", "start@3000", "start@6100"])
  assert.equal(CHAT_TYPING_RENEW_MS, 3_000)
})

test("clearing the draft or ending it stops once, only while a start may still show", () => {
  const { state } = typeSequence([0])
  const cleared = planDraftChange(state, { threadId: T, text: "   ", now: 1_000 })
  assert.deepEqual(cleared.send, { threadId: T, state: "stop" })
  assert.equal(planDraftEnd(cleared.next, 1_100).send, undefined, "no second stop")
  // A start that already lapsed on the partner's phone needs no stop.
  assert.equal(planDraftEnd(state, CHAT_TYPING_DEFAULT_LIFETIME_MS + 1).send, undefined)
  assert.equal(planDraftEnd(IDLE_TYPING_SENDER, 0).send, undefined)
})

test("a draft never leaks: signals carry only the thread and the state", () => {
  const plan = planDraftChange(IDLE_TYPING_SENDER, { threadId: T, text: "secret words", now: 0 })
  assert.deepEqual(Object.keys(plan.send ?? {}).sort(), ["state", "threadId"])
  assert.equal(JSON.stringify(plan).includes("secret"), false)
})

test("moving to another conversation stops the first before starting the second", () => {
  const { state } = typeSequence([0])
  const switched = planDraftChange(state, { threadId: "thread-2", text: "x", now: 500 })
  assert.deepEqual(switched.send, { threadId: T, state: "stop" })
  const next = planDraftChange(switched.next, { threadId: "thread-2", text: "xy", now: 600 })
  assert.deepEqual(next.send, { threadId: "thread-2", state: "start" })
})

test("the receiver shows a partner start at once, lapses it, and ignores its own devices", () => {
  const start = { threadId: T, userId: "bora", state: "start" as const, expiresInMs: 6_000 }
  const shown = applyTypingUpdate(NO_PARTNER_TYPING, start, { localUserId: "ada", now: 1_000 })
  assert.equal(isPartnerTyping(shown, T, "bora", 1_000), true)
  assert.equal(isPartnerTyping(shown, T, "bora", 6_999), true)
  assert.equal(isPartnerTyping(shown, T, "bora", 7_000), false)
  assert.equal(isPartnerTyping(shown, T, "cem", 1_000), false)
  assert.equal(nextTypingExpiry(shown), 7_000)
  assert.deepEqual(pruneExpiredTyping(shown, 7_000), {})

  assert.equal(applyTypingUpdate(NO_PARTNER_TYPING, { ...start, userId: "ada" }, { localUserId: "ada", now: 0 }), NO_PARTNER_TYPING)
  assert.equal(applyTypingUpdate(NO_PARTNER_TYPING, start, { localUserId: undefined, now: 0 }), NO_PARTNER_TYPING)
})

test("a renewal extends the indicator and an out-of-range lifetime falls back to 6 s", () => {
  const start = { threadId: T, userId: "bora", state: "start" as const, expiresInMs: 6_000 }
  const first = applyTypingUpdate(NO_PARTNER_TYPING, start, { localUserId: "ada", now: 0 })
  const renewed = applyTypingUpdate(first, start, { localUserId: "ada", now: 3_000 })
  assert.equal(isPartnerTyping(renewed, T, "bora", 8_000), true)
  const odd = applyTypingUpdate(NO_PARTNER_TYPING, { ...start, expiresInMs: 60_000 }, { localUserId: "ada", now: 0 })
  assert.equal(nextTypingExpiry(odd), CHAT_TYPING_DEFAULT_LIFETIME_MS)
})

test("stop, a message from the typist and a block clear the indicator; others do not", () => {
  const start = { threadId: T, userId: "bora", state: "start" as const, expiresInMs: 6_000 }
  const shown = applyTypingUpdate(NO_PARTNER_TYPING, start, { localUserId: "ada", now: 0 })
  assert.deepEqual(applyTypingUpdate(shown, { ...start, state: "stop", expiresInMs: 0 }, { localUserId: "ada", now: 1 }), {})
  assert.deepEqual(clearTypingForMessage(shown, { threadId: T, senderUserId: "bora" }), {})
  assert.equal(clearTypingForMessage(shown, { threadId: T, senderUserId: "ada" }), shown, "my own message keeps it")
  assert.equal(clearTypingForMessage(shown, { threadId: "other", senderUserId: "bora" }), shown)
  assert.deepEqual(clearTypingForUser(shown, "bora"), {})
  assert.equal(clearTypingForUser(shown, "cem"), shown)
})

test("screen readers hear a fresh start once per cooldown, never per renewal", () => {
  assert.equal(shouldAnnounceTyping({ isTyping: true, wasTyping: false, lastAnnouncedAt: null, now: 0 }), true)
  assert.equal(shouldAnnounceTyping({ isTyping: true, wasTyping: true, lastAnnouncedAt: 0, now: 100 }), false)
  assert.equal(shouldAnnounceTyping({ isTyping: true, wasTyping: false, lastAnnouncedAt: 0, now: 10_000 }), false)
  assert.equal(shouldAnnounceTyping({ isTyping: true, wasTyping: false, lastAnnouncedAt: 0, now: CHAT_TYPING_ANNOUNCE_COOLDOWN_MS }), true)
  assert.equal(shouldAnnounceTyping({ isTyping: false, wasTyping: true, lastAnnouncedAt: 0, now: 99_999 }), false)
})
