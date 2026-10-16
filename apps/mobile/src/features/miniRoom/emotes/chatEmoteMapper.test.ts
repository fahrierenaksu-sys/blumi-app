import assert from "node:assert/strict"
import test from "node:test"
import {
  CHAT_EMOTE_MAX_MESSAGE_AGE_MS,
  CHAT_EMOTE_MAX_MESSAGE_CHARS,
  CHAT_EMOTE_SENDER_COOLDOWN_MS,
  CHAT_EMOTES,
  decideChatEmote,
  detectChatEmote,
  EMPTY_CHAT_EMOTE_GATE,
  type ChatEmote
} from "./chatEmoteMapper"

function expectEmote(emote: ChatEmote | null, lines: readonly string[]): void {
  for (const line of lines) assert.equal(detectChatEmote(line), emote, line)
}

test("Turkish and English words trigger each emote, whatever the case or Turkish letters", () => {
  expectEmote("heart", ["seni seviyorum", "Seni SEVİYORUM", "özledim", "ozledim", "aşkım", "teşekkürler", "tşk",
    "love you", "sağol"])
  expectEmote("laugh", ["hahahaha", "HAHA", "ahahah", "hehe", "sjsjsjsj", "lol", "XDDD", "koptum", "çok komik"])
  expectEmote("think", ["hmm", "hımmm", "acaba?", "bilmiyorum", "düşünüyorum", "emin değilim", "idk", "?", "???"])
  expectEmote("wave", ["selam", "Selaaam", "slm", "merhaba", "mrb", "naber", "günaydın", "hey", "hi", "hello",
    "bye", "görüşürüz", "hoşça kal"])
  expectEmote("sparkle", ["harika", "muhteşem", "süper", "wow", "yaşasın", "tebrikler", "iyi ki doğdun", "omg"])
  expectEmote("sleepy", ["iyi geceler", "uykum geldi", "uykuluyum", "yorgunum", "good night", "gn", "zzz",
    "tatlı rüyalar"])
})

test("emoji trigger their emote, with or without presentation selectors and skin tones", () => {
  expectEmote("heart", ["❤️", "❤", "🥰", "💕💕", "<3"])
  expectEmote("laugh", ["😂", "🤣🤣"])
  expectEmote("think", ["🤔"])
  expectEmote("wave", ["👋", "👋🏽", "🙋‍♀️"])
  expectEmote("sparkle", ["✨", "🎉", "🥳"])
  expectEmote("sleepy", ["😴", "💤", "🥱"])
})

test("ordinary lines and look-alike words do not emote", () => {
  expectEmote(null, ["", "   ", "nasılsın", "bugün okula gittim", "him", "ha", "aha", "ask me later", "bay Ahmet",
    "what is this", "ne?", "tamam"])
})

test("one line asks for at most one emote, by a fixed priority", () => {
  assert.equal(detectChatEmote("iyi geceler aşkım"), "sleepy")
  assert.equal(detectChatEmote("selam ❤️"), "heart")
  assert.equal(detectChatEmote("hahaha selam"), "laugh")
  assert.equal(detectChatEmote("selam ✨"), "wave")
  for (const line of ["seni seviyorum", "😂", "selam", "hmm"]) {
    assert.ok(CHAT_EMOTES.includes(detectChatEmote(line)!))
  }
})

test("a line longer than the limit never emotes", () => {
  const atLimit = `selam ${"a".repeat(CHAT_EMOTE_MAX_MESSAGE_CHARS - "selam ".length)}`
  assert.equal(Array.from(atLimit).length, CHAT_EMOTE_MAX_MESSAGE_CHARS)
  assert.equal(detectChatEmote(atLimit), "wave")
  assert.equal(detectChatEmote(`${atLimit}a`), null)
  assert.equal(detectChatEmote(`❤️ ${"çok uzun bir mesaj ".repeat(6)}`), null)
})

test("each sender emotes at most once per cooldown; other senders and quiet lines are not held back", () => {
  let state = EMPTY_CHAT_EMOTE_GATE
  const step = (senderUserId: string, body: string, nowMs: number): ChatEmote | null => {
    const decision = decideChatEmote(state, { senderUserId, body, nowMs })
    state = decision.state
    return decision.emote
  }
  assert.equal(step("a", "selam", 1_000), "wave")
  assert.equal(step("a", "hahaha", 1_000 + CHAT_EMOTE_SENDER_COOLDOWN_MS - 1), null)
  assert.equal(step("b", "hahaha", 1_500), "laugh")
  assert.equal(step("a", "hahaha", 1_000 + CHAT_EMOTE_SENDER_COOLDOWN_MS), "laugh")
  // A line without an emote does not start the cooldown.
  assert.equal(step("c", "tamam", 10_000), null)
  assert.equal(step("c", "❤️", 10_001), "heart")
})

test("the gate never changes its state in place", () => {
  const before = decideChatEmote(EMPTY_CHAT_EMOTE_GATE, { senderUserId: "a", body: "selam", nowMs: 5 }).state
  const snapshot = JSON.stringify(before)
  const after = decideChatEmote(before, { senderUserId: "b", body: "selam", nowMs: 6 }).state
  assert.notEqual(after, before)
  assert.equal(JSON.stringify(before), snapshot)
  assert.deepEqual(EMPTY_CHAT_EMOTE_GATE.lastEmoteAtBySender, {})
  const quiet = decideChatEmote(after, { senderUserId: "c", body: "tamam", nowMs: 7 })
  assert.equal(quiet.state, after)
})

test("a line delivered long after it was sent does not emote; a fresh or future-dated one does", () => {
  const now = 100_000
  const late = decideChatEmote(EMPTY_CHAT_EMOTE_GATE, {
    senderUserId: "a", body: "selam", nowMs: now, sentAtMs: now - CHAT_EMOTE_MAX_MESSAGE_AGE_MS - 1
  })
  assert.equal(late.emote, null)
  assert.equal(late.state, EMPTY_CHAT_EMOTE_GATE)
  const fresh = decideChatEmote(EMPTY_CHAT_EMOTE_GATE, { senderUserId: "a", body: "selam", nowMs: now, sentAtMs: now - 500 })
  assert.equal(fresh.emote, "wave")
  // A phone clock behind the server's must not lose the emote.
  const skewed = decideChatEmote(EMPTY_CHAT_EMOTE_GATE, { senderUserId: "a", body: "selam", nowMs: now, sentAtMs: now + 9_000 })
  assert.equal(skewed.emote, "wave")
})

test("no part of the message text is kept or returned", () => {
  const privateLine = "selam kanka gizli plan"
  const decision = decideChatEmote(EMPTY_CHAT_EMOTE_GATE, { senderUserId: "sender", body: privateLine, nowMs: 1 })
  assert.equal(decision.emote, "wave")
  const serialised = JSON.stringify(decision)
  for (const fragment of ["kanka", "gizli", "plan", privateLine]) assert.equal(serialised.includes(fragment), false)
  assert.deepEqual(Object.keys(decision).sort(), ["emote", "state"])
  assert.deepEqual(Object.keys(decision.state), ["lastEmoteAtBySender"])
  assert.equal(typeof detectChatEmote(privateLine), "string")
  assert.ok(CHAT_EMOTES.includes(detectChatEmote(privateLine)!))
})
