import assert from "node:assert/strict"
import test from "node:test"
import {
  EMPTY_MINI_ROOM_EMOTES,
  expireMiniRoomEmotes,
  MINI_ROOM_EMOTE_LIFETIME_MS,
  nextMiniRoomEmoteExpiry,
  showMiniRoomEmote
} from "./miniRoomEmoteModel"

test("an emote shows for its lifetime over its speaker, then leaves", () => {
  const shown = showMiniRoomEmote(EMPTY_MINI_ROOM_EMOTES, { key: "k1", speakerUserId: "a", emote: "heart" }, 1_000)
  assert.equal(shown.a?.emote, "heart")
  assert.equal(nextMiniRoomEmoteExpiry(shown), 1_000 + MINI_ROOM_EMOTE_LIFETIME_MS)
  assert.equal(expireMiniRoomEmotes(shown, 1_000 + MINI_ROOM_EMOTE_LIFETIME_MS - 1), shown)
  assert.deepEqual(expireMiniRoomEmotes(shown, 1_000 + MINI_ROOM_EMOTE_LIFETIME_MS), {})
  assert.equal(nextMiniRoomEmoteExpiry(EMPTY_MINI_ROOM_EMOTES), undefined)
})

test("each speaker has one emote; a newer one replaces theirs and leaves the other speaker's alone", () => {
  let state = showMiniRoomEmote(EMPTY_MINI_ROOM_EMOTES, { key: "k1", speakerUserId: "a", emote: "wave" }, 0)
  state = showMiniRoomEmote(state, { key: "k2", speakerUserId: "b", emote: "laugh" }, 500)
  state = showMiniRoomEmote(state, { key: "k3", speakerUserId: "a", emote: "sparkle" }, 900)
  assert.deepEqual(Object.keys(state).sort(), ["a", "b"])
  assert.equal(state.a?.key, "k3")
  assert.equal(nextMiniRoomEmoteExpiry(state), 500 + MINI_ROOM_EMOTE_LIFETIME_MS)
  const later = expireMiniRoomEmotes(state, 500 + MINI_ROOM_EMOTE_LIFETIME_MS)
  assert.deepEqual(Object.keys(later), ["a"])
})

test("the model never changes a state in place", () => {
  const first = showMiniRoomEmote(EMPTY_MINI_ROOM_EMOTES, { key: "k1", speakerUserId: "a", emote: "think" }, 0)
  const snapshot = JSON.stringify(first)
  showMiniRoomEmote(first, { key: "k2", speakerUserId: "a", emote: "sleepy" }, 10)
  expireMiniRoomEmotes(first, 10_000)
  assert.equal(JSON.stringify(first), snapshot)
  assert.deepEqual(EMPTY_MINI_ROOM_EMOTES, {})
})
