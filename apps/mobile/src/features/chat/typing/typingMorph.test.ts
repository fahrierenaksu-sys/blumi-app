import assert from "node:assert/strict"
import test from "node:test"
import type { ChatTimelineItem } from "../chatRoomInviteModel"
import { shouldTapForIncomingArrival } from "../thread/chatArrivalHaptic"
import { createTypingMorphSources, TYPING_MORPH_GRACE_MS } from "./typingMorphSource"

// Typing dots become the partner's bubble only when they were really there,
// and the arrival tap never interrupts someone who is typing.

const dots = { x: 16, y: 640, width: 58, height: 30 }

test("an arriving message grows from the dots that are on screen", () => {
  const sources = createTypingMorphSources()
  const detach = sources.attach("chat-send:thread-a", () => dots)
  assert.deepEqual(sources.take("chat-send:thread-a"), dots)
  assert.equal(sources.take("chat-send:thread-b"), null, "another conversation has no dots")
  detach()
})

test("dots that left just before the message still morph; older ones do not", () => {
  const sources = createTypingMorphSources()
  let now = 1_000
  const detach = sources.attach("chat-send:thread-a", () => dots, () => now)
  detach()
  assert.deepEqual(sources.take("chat-send:thread-a", now + 300), dots)
  assert.equal(sources.take("chat-send:thread-a", now + 400), null, "one morph per bubble")

  now = 5_000
  sources.attach("chat-send:thread-a", () => dots, () => now)()
  assert.equal(sources.take("chat-send:thread-a", now + TYPING_MORPH_GRACE_MS + 1), null)
})

test("no measurable dots, no morph", () => {
  const sources = createTypingMorphSources()
  const detach = sources.attach("chat-send:thread-a", () => null)
  assert.equal(sources.take("chat-send:thread-a"), null)
  detach()
  assert.equal(sources.take("chat-send:thread-a"), null)
  assert.equal(sources.take("chat-send:never-typed"), null)
})

test("a replaced typing bubble keeps the newest one", () => {
  const sources = createTypingMorphSources()
  const first = sources.attach("chat-send:thread-a", () => ({ ...dots, y: 1 }))
  sources.attach("chat-send:thread-a", () => dots)
  first()
  assert.deepEqual(sources.take("chat-send:thread-a"), dots, "the old bubble leaving does not unhook the new one")
})

function message(senderUserId: string): ChatTimelineItem {
  return {
    kind: "message",
    createdAt: "2026-10-02T10:00:00.000Z",
    message: { messageId: `m-${senderUserId}`, senderUserId, body: "hi" }
  } as unknown as ChatTimelineItem
}

test("the partner's message taps softly only while I am reading, once per update", () => {
  const base = { currentUserId: "me", composerFocused: false, screenFocused: true }
  assert.equal(shouldTapForIncomingArrival({ ...base, arrivedItems: [message("partner"), message("partner")] }), true)
  assert.equal(shouldTapForIncomingArrival({ ...base, composerFocused: true, arrivedItems: [message("partner")] }), false, "typing: no tap")
  assert.equal(shouldTapForIncomingArrival({ ...base, screenFocused: false, arrivedItems: [message("partner")] }), false)
  assert.equal(shouldTapForIncomingArrival({ ...base, arrivedItems: [message("me")] }), false, "my own send has its own haptic")
  assert.equal(shouldTapForIncomingArrival({ ...base, arrivedItems: [] }), false)
})
