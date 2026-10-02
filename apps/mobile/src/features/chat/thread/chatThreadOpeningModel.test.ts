import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import { buildChatTimeline, type ChatTimelineItem } from "../chatRoomInviteModel"
import {
  CHAT_THREAD_SKELETON_DELAY_MS,
  getChatTimelineInitialOpacity,
  resolveChatThreadBody,
  resolveChatTimelineReveal,
  selectChatThreadOpeningMessages,
  type ChatThreadBodyInput
} from "./chatThreadOpeningModel"
import {
  EMPTY_CHAT_TIMELINE_ENTRANCE_STATE,
  planChatTimelineEntrances,
  type ChatTimelineEntranceState
} from "./chatTimelineEntranceModel"

function message(messageId: string, minute: number): ChatMessage {
  return {
    messageId,
    threadId: "thread-1",
    senderUserId: "partner",
    body: `body ${messageId}`,
    sentAt: new Date(Date.UTC(2026, 9, 2, 12, minute)).toISOString()
  }
}

function timeline(...messages: ChatMessage[]): ChatTimelineItem[] {
  return buildChatTimeline(messages, [])
}

function production(overrides: Partial<ChatThreadBodyInput>): ChatThreadBodyInput {
  const timelineLength = overrides.timelineLength ?? 0
  return {
    waitsForServerHistory: true,
    historyReady: false,
    timelineLength,
    messageCount: timelineLength,
    isPendingThread: false,
    listStatus: "idle",
    ...overrides
  }
}

/**
 * The screen's own sequence: the body for each store snapshot, the timeline
 * reveal (the skeleton counts as shown only once its delay has passed,
 * `waited`), and the entrance plan made only while the timeline is
 * presented, committed after each render.
 */
function openThread(snapshots: readonly { input: ChatThreadBodyInput; items: readonly ChatTimelineItem[]; waited?: boolean }[]) {
  let skeletonWasShown = false
  let entrance: ChatTimelineEntranceState = EMPTY_CHAT_TIMELINE_ENTRANCE_STATE
  let hasPresentedList = false
  return snapshots.map(({ input, items, waited = false }) => {
    const body = resolveChatThreadBody(input)
    const skeleton = body === "loading" && waited
    if (skeleton) skeletonWasShown = true
    const reveal = resolveChatTimelineReveal({ body, skeletonWasShown })
    let entering: string[] = []
    if (body === "timeline") {
      const plan = planChatTimelineEntrances({
        ...entrance,
        nextItems: items,
        isInitialLoad: !hasPresentedList,
        reduceMotion: false
      })
      entrance = plan.state
      hasPresentedList = true
      entering = [...plan.enteringKeys]
    }
    return { body, skeleton, reveal, entering }
  })
}

const history = timeline(message("m1", 1), message("m2", 2), message("m3", 3))

test("cached history opens on the full timeline in its first frame, with no skeleton and no entrance", () => {
  const cached = production({ historyReady: true, timelineLength: history.length, listStatus: "ready" })
  const [first] = openThread([{ input: cached, items: history }])
  assert.deepEqual(first, { body: "timeline", skeleton: false, reveal: "shown", entering: [] })
  assert.equal(getChatTimelineInitialOpacity(first.body), 1)
})

test("a background refresh of cached history keeps the timeline shown", () => {
  const frames = openThread([
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history },
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "loading" }), items: history, waited: true },
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history }
  ])
  assert.deepEqual(frames.map((frame) => frame.body), ["timeline", "timeline", "timeline"])
  assert.deepEqual(frames.map((frame) => frame.reveal), ["shown", "shown", "shown"])
  assert.deepEqual(frames.flatMap((frame) => frame.entering), [])
})

test("a first page that beats the skeleton delay appears at once, with no placeholder and no fade", () => {
  const frames = openThread([
    { input: production({ listStatus: "loading" }), items: [] },
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history }
  ])
  assert.deepEqual(frames[0], { body: "loading", skeleton: false, reveal: "hidden", entering: [] })
  assert.deepEqual(frames[1], { body: "timeline", skeleton: false, reveal: "shown", entering: [] })
})

test("a slow first page shows the skeleton after the delay, then a short fade without row entrances", () => {
  assert.ok(CHAT_THREAD_SKELETON_DELAY_MS >= 200 && CHAT_THREAD_SKELETON_DELAY_MS <= 500)
  const frames = openThread([
    { input: production({ listStatus: "loading" }), items: [] },
    { input: production({ listStatus: "loading" }), items: [], waited: true },
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history }
  ])
  assert.equal(frames[0].skeleton, false)
  assert.equal(frames[1].skeleton, true)
  assert.equal(getChatTimelineInitialOpacity(frames[1].body), 0)
  assert.deepEqual(frames[2], { body: "timeline", skeleton: false, reveal: "crossfade", entering: [] })
})

test("a message the store holds before the first page opens the timeline at once; the page fills in behind it", () => {
  const partial = timeline(message("m3", 3))
  const frames = openThread([
    { input: production({ timelineLength: 1, listStatus: "loading" }), items: partial },
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history }
  ])
  assert.deepEqual(frames[0], { body: "timeline", skeleton: false, reveal: "shown", entering: [] })
  assert.deepEqual(frames[1], { body: "timeline", skeleton: false, reveal: "shown", entering: [] },
    "older messages land behind the shown one without entrances")
})

test("an invitation alone does not stand in for unknown history", () => {
  assert.equal(resolveChatThreadBody(production({ timelineLength: 1, messageCount: 0, listStatus: "loading" })), "loading")
  assert.equal(resolveChatThreadBody(production({ historyReady: true, timelineLength: 1, messageCount: 0 })), "timeline")
})

test("a thread with nothing cached opens on the message its Chats row showed", () => {
  const last = message("m3", 3)
  const cached = [message("m1", 1)]
  assert.deepEqual(selectChatThreadOpeningMessages({ messages: [], historyReady: false, threadId: "thread-1", lastMessage: last }), [last])
  assert.equal(selectChatThreadOpeningMessages({ messages: cached, historyReady: false, threadId: "thread-1", lastMessage: last }), cached,
    "cached messages win over the row's last message")
  const none: ChatMessage[] = []
  assert.equal(selectChatThreadOpeningMessages({ messages: none, historyReady: true, threadId: "thread-1", lastMessage: last }), none,
    "known history is authoritative (a chat deleted for me stays empty)")
  assert.equal(selectChatThreadOpeningMessages({ messages: none, historyReady: false, threadId: "thread-2", lastMessage: last }), none,
    "another thread's message is never shown")
  assert.equal(selectChatThreadOpeningMessages({ messages: none, historyReady: false, threadId: undefined, lastMessage: last }), none)
})

test("only a row that arrives after the first presentation enters", () => {
  const withNew = timeline(message("m1", 1), message("m2", 2), message("m3", 3), message("m4", 4))
  const frames = openThread([
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history },
    { input: production({ historyReady: true, timelineLength: 4, listStatus: "ready" }), items: withNew }
  ])
  assert.deepEqual(frames[0].entering, [])
  assert.deepEqual(frames[1].entering, ["message:m4"])
  assert.equal(frames[1].reveal, "shown")
})

test("a cached chat without messages opens on its empty state, even while it refreshes", () => {
  assert.equal(resolveChatThreadBody(production({ historyReady: true, listStatus: "loading" })), "empty")
  assert.equal(resolveChatThreadBody(production({ historyReady: true, listStatus: "ready" })), "empty")
})

test("a failed first page shows the empty state with its retry, not an endless skeleton", () => {
  assert.equal(resolveChatThreadBody(production({ listStatus: "failed" })), "empty")
  assert.equal(resolveChatThreadBody(production({ timelineLength: 2, messageCount: 0, listStatus: "failed" })), "empty")
  assert.equal(resolveChatThreadBody(production({ timelineLength: 2, listStatus: "failed" })), "timeline",
    "messages already on this phone stay readable when the refresh fails")
})

test("a matched chat that is still being created shows the empty state", () => {
  assert.equal(resolveChatThreadBody(production({ isPendingThread: true, listStatus: "loading" })), "empty")
})

test("demo threads show their local messages at once and wait only until they list", () => {
  const demo = (overrides: Partial<ChatThreadBodyInput>) =>
    resolveChatThreadBody(production({ waitsForServerHistory: false, ...overrides }))
  assert.equal(demo({ timelineLength: 2, listStatus: "idle" }), "timeline")
  assert.equal(demo({ listStatus: "idle" }), "loading")
  assert.equal(demo({ listStatus: "ready" }), "empty")
})
