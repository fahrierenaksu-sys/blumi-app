import assert from "node:assert/strict"
import test from "node:test"
import {
  EMPTY_MINI_ROOM_SPEECH_STACK,
  MINI_ROOM_SPEECH_STACK_LIMIT,
  dismissMiniRoomSpeech,
  expireMiniRoomSpeech,
  groupMiniRoomSpeechBySpeaker,
  hasMiniRoomSpeechFrom,
  nextMiniRoomSpeechExpiry,
  pushMiniRoomSpeech
} from "./miniRoomSpeechStack"

const say = (key: string, speakerUserId: string, lifetimeMs = 4_000) =>
  ({ key, speakerUserId, body: key, lifetimeMs })

test("a second line before the first ends stacks under it; each keeps its own lifetime", () => {
  let stack = EMPTY_MINI_ROOM_SPEECH_STACK
  stack = pushMiniRoomSpeech(stack, say("one", "a"), 1_000)
  stack = pushMiniRoomSpeech(stack, say("two", "a"), 2_500)

  // Oldest first: drawn top to bottom, so the newest sits next to the chibi.
  assert.deepEqual(groupMiniRoomSpeechBySpeaker(stack).a?.map(({ key }) => key), ["one", "two"])
  assert.deepEqual(stack.map(({ expiresAt }) => expiresAt), [5_000, 6_500])
  assert.equal(nextMiniRoomSpeechExpiry(stack), 5_000)

  stack = expireMiniRoomSpeech(stack, 4_999)
  assert.equal(stack.length, 2)
  stack = expireMiniRoomSpeech(stack, 5_000)
  assert.deepEqual(stack.map(({ key }) => key), ["two"], "the older line leaves alone")
  assert.equal(nextMiniRoomSpeechExpiry(stack), 6_500)
  stack = expireMiniRoomSpeech(stack, 6_500)
  assert.deepEqual(stack, [])
  assert.equal(nextMiniRoomSpeechExpiry(stack), undefined)
})

test("partners speaking at the same moment both keep their bubbles", () => {
  let stack = EMPTY_MINI_ROOM_SPEECH_STACK
  stack = pushMiniRoomSpeech(stack, say("mine", "local"), 1_000)
  stack = pushMiniRoomSpeech(stack, say("theirs", "partner"), 1_010)
  const groups = groupMiniRoomSpeechBySpeaker(stack)
  assert.deepEqual(groups.local?.map(({ key }) => key), ["mine"])
  assert.deepEqual(groups.partner?.map(({ key }) => key), ["theirs"])
  assert.ok(hasMiniRoomSpeechFrom(stack, "local") && hasMiniRoomSpeechFrom(stack, "partner"))
})

test("a burst keeps at most the stack limit per speaker, dropping that speaker's oldest", () => {
  let stack = pushMiniRoomSpeech(EMPTY_MINI_ROOM_SPEECH_STACK, say("partner-1", "partner"), 0)
  for (let index = 1; index <= MINI_ROOM_SPEECH_STACK_LIMIT + 1; index += 1) {
    stack = pushMiniRoomSpeech(stack, say(`local-${index}`, "local"), index)
  }
  const groups = groupMiniRoomSpeechBySpeaker(stack)
  assert.deepEqual(groups.local?.map(({ key }) => key), ["local-2", "local-3", "local-4"])
  assert.deepEqual(groups.partner?.map(({ key }) => key), ["partner-1"], "the other speaker is untouched")
})

test("a repeated key, a stale dismiss and nothing to expire keep the same stack", () => {
  let stack = pushMiniRoomSpeech(EMPTY_MINI_ROOM_SPEECH_STACK, say("one", "a"), 0)
  assert.equal(pushMiniRoomSpeech(stack, say("one", "a"), 50), stack)
  assert.equal(expireMiniRoomSpeech(stack, 10), stack)
  assert.equal(dismissMiniRoomSpeech(stack, "gone"), stack)
  stack = pushMiniRoomSpeech(stack, say("two", "a"), 100)
  stack = dismissMiniRoomSpeech(stack, "one")
  assert.deepEqual(stack.map(({ key }) => key), ["two"])
  assert.equal(stack[0]?.expiresAt, 4_100, "a dismiss does not restart the other line")
})
