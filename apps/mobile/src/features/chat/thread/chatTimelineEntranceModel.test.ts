import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import {
  buildChatTimeline,
  type ChatRoomInviteTimelineItem,
  type ChatTimelineItem
} from "../chatRoomInviteModel"
import {
  EMPTY_CHAT_TIMELINE_ENTRANCE_STATE,
  planChatTimelineEntrances,
  type ChatTimelineEntranceState
} from "./chatTimelineEntranceModel"

function message(
  messageId: string,
  minute: number,
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    messageId,
    threadId: "thread-1",
    senderUserId: "partner",
    body: `body ${messageId}`,
    sentAt: new Date(Date.UTC(2026, 8, 30, 12, minute)).toISOString(),
    ...overrides
  }
}

function timeline(...messages: ChatMessage[]): ChatTimelineItem[] {
  return buildChatTimeline(messages, [])
}

function plan(
  state: ChatTimelineEntranceState,
  nextItems: readonly ChatTimelineItem[],
  options: { isInitialLoad?: boolean; reduceMotion?: boolean } = {}
) {
  return planChatTimelineEntrances({
    ...state,
    nextItems,
    isInitialLoad: options.isInitialLoad ?? false,
    reduceMotion: options.reduceMotion ?? false
  })
}

const history = timeline(message("m1", 1), message("m2", 2), message("m3", 3))

function afterInitialLoad(): ChatTimelineEntranceState {
  return plan(EMPTY_CHAT_TIMELINE_ENTRANCE_STATE, history, { isInitialLoad: true }).state
}

test("the first load (cached or fetched history) plays no entrance", () => {
  const result = plan(EMPTY_CHAT_TIMELINE_ENTRANCE_STATE, history, { isInitialLoad: true })
  assert.equal(result.enteringKeys.size, 0)
  assert.deepEqual(
    [...result.state.knownKeys].sort(),
    ["message:m1", "message:m2", "message:m3"]
  )
})

test("a message added at the newest edge while the screen is open enters", () => {
  const incoming = message("m4", 4)
  const result = plan(afterInitialLoad(), timeline(message("m1", 1), message("m2", 2), message("m3", 3), incoming))
  assert.deepEqual([...result.enteringKeys], ["message:m4"])
  assert.equal(result.state.knownKeys.has("message:m4"), true)
})

test("my optimistic message enters, and its server acknowledgement does not enter again", () => {
  const local = message("__local_1_1", 5, { senderUserId: "me", body: "hi there" })
  const sent = plan(afterInitialLoad(), timeline(message("m1", 1), message("m2", 2), message("m3", 3), local))
  assert.deepEqual([...sent.enteringKeys], ["message:__local_1_1"])

  // The server copy replaces the local bubble under a new id and may carry a
  // slightly different timestamp; it must not replay the entrance.
  const acknowledged = message("server-9", 6, { senderUserId: "me", body: "hi there" })
  const confirmed = plan(sent.state, timeline(message("m1", 1), message("m2", 2), message("m3", 3), acknowledged))
  assert.equal(confirmed.enteringKeys.size, 0)
  assert.equal(confirmed.state.knownKeys.has("message:server-9"), true)
})

test("a replacement only absorbs one new message with the same sender and body", () => {
  const local = message("__local_1_1", 5, { senderUserId: "me", body: "same" })
  const sent = plan(afterInitialLoad(), timeline(message("m1", 1), message("m2", 2), message("m3", 3), local))
  const acknowledged = message("server-9", 6, { senderUserId: "me", body: "same" })
  const reply = message("server-10", 7, { senderUserId: "partner", body: "same" })
  const result = plan(
    sent.state,
    timeline(message("m1", 1), message("m2", 2), message("m3", 3), acknowledged, reply)
  )
  assert.deepEqual([...result.enteringKeys], ["message:server-10"])
})

test("an earlier page loaded by pagination plays no entrance", () => {
  const olderPage = [message("m-2", -2), message("m-1", -1), message("m0", 0)]
  const result = plan(afterInitialLoad(), timeline(...olderPage, message("m1", 1), message("m2", 2), message("m3", 3)))
  assert.equal(result.enteringKeys.size, 0)
  assert.equal(result.state.knownKeys.has("message:m-2"), true)
})

test("Reduce Motion plays no entrance but still records the new keys", () => {
  const result = plan(
    afterInitialLoad(),
    timeline(message("m1", 1), message("m2", 2), message("m3", 3), message("m4", 4)),
    { reduceMotion: true }
  )
  assert.equal(result.enteringKeys.size, 0)
  assert.equal(result.state.knownKeys.has("message:m4"), true)
})

test("re-rendering the same timeline never replays an entrance", () => {
  const next = timeline(message("m1", 1), message("m2", 2), message("m3", 3), message("m4", 4))
  const first = plan(afterInitialLoad(), next)
  assert.equal(first.enteringKeys.size, 1)
  const again = plan(first.state, timeline(message("m1", 1), message("m2", 2), message("m3", 3), message("m4", 4)))
  assert.equal(again.enteringKeys.size, 0)
  // A key that scrolls away and back (or briefly leaves) stays known.
  const withoutNewest = plan(again.state, history)
  const back = plan(withoutNewest.state, next)
  assert.equal(back.enteringKeys.size, 0)
})

test("an unchanged timeline keeps the same state and an empty entering set", () => {
  const state = afterInitialLoad()
  const result = plan(state, history)
  assert.equal(result.state.knownKeys, state.knownKeys)
  assert.equal(result.enteringKeys, plan(state, history).enteringKeys)
})

test("a new room invitation at the newest edge enters; a status change does not", () => {
  const invite: ChatRoomInviteTimelineItem = {
    kind: "room_invite",
    inviteId: "invite-1",
    threadId: "thread-1",
    senderUserId: "partner",
    recipientUserId: "me",
    createdAt: new Date(Date.UTC(2026, 8, 30, 12, 10)).toISOString(),
    status: "pending"
  }
  const messages = [message("m1", 1), message("m2", 2), message("m3", 3)]
  const created = plan(afterInitialLoad(), buildChatTimeline(messages, [invite]))
  assert.deepEqual([...created.enteringKeys], ["room-invite:invite-1"])
  const accepted = plan(created.state, buildChatTimeline(messages, [{ ...invite, status: "accepted" }]))
  assert.equal(accepted.enteringKeys.size, 0)
})

test("messages absorbed while the list was hidden stay quiet once it appears", () => {
  const hidden = plan(EMPTY_CHAT_TIMELINE_ENTRANCE_STATE, timeline(message("m1", 1)), { isInitialLoad: true })
  const shown = plan(hidden.state, history, { isInitialLoad: true })
  assert.equal(shown.enteringKeys.size, 0)
  const live = plan(shown.state, timeline(message("m1", 1), message("m2", 2), message("m3", 3), message("m4", 4)))
  assert.deepEqual([...live.enteringKeys], ["message:m4"])
})
