import assert from "node:assert/strict"
import test from "node:test"
import { CHAT_TAP_LIST_WAIT_MS, createChatTapGate, resolveChatTapDecision } from "./notificationTapRouting"

test("a known conversation opens at once", () => {
  assert.deepEqual(resolveChatTapDecision({ hasThread: true, listVersion: 0, tapListVersion: 0, waitedMs: 0 }), { kind: "open" })
})

test("a conversation missing from a list that arrived after the tap goes to the Inbox", () => {
  assert.deepEqual(resolveChatTapDecision({ hasThread: false, listVersion: 3, tapListVersion: 2, waitedMs: 10 }), { kind: "inbox" })
})

test("an unknown conversation waits for a fresh list, then opens anyway after the bound", () => {
  assert.deepEqual(resolveChatTapDecision({ hasThread: false, listVersion: 2, tapListVersion: 2, waitedMs: 1_000 }),
    { kind: "wait", retryInMs: CHAT_TAP_LIST_WAIT_MS - 1_000 })
  assert.deepEqual(resolveChatTapDecision({ hasThread: false, listVersion: 2, tapListVersion: 2, waitedMs: CHAT_TAP_LIST_WAIT_MS }),
    { kind: "open" })
})

test("the gate measures from the first routing attempt and forgets decided taps", () => {
  let now = 1_000
  let version = 5
  const known = new Set<string>()
  const gate = createChatTapGate({ hasThread: (id) => known.has(id), now: () => now })
  assert.equal(gate.decide("new", version).kind, "wait", "cold start: the list has not arrived")
  now += 500
  assert.equal(gate.decide("new", version).kind, "wait")
  known.add("new")
  version += 1
  assert.equal(gate.decide("new", version).kind, "open", "the new thread was listed")
  assert.equal(gate.decide("deleted", version).kind, "wait")
  version += 1
  assert.equal(gate.decide("deleted", version).kind, "inbox", "a deleted or hidden thread never dead-ends")
  assert.equal(gate.decide("offline", version).kind, "wait")
  now += CHAT_TAP_LIST_WAIT_MS
  assert.equal(gate.decide("offline", version).kind, "open", "no list in time: the tap is not lost")
})

test("the gate stays bounded", () => {
  const gate = createChatTapGate({ hasThread: () => false, now: () => 0 })
  for (let index = 0; index < 40; index++) gate.decide(`thread-${index}`, 0)
  gate.reset()
  assert.equal(gate.decide("thread-0", 0).kind, "wait")
})
