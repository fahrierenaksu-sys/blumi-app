import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import { buildChatTimeline, type ChatTimelineItem } from "../chatRoomInviteModel"
import {
  getChatTimelineInitialOpacity,
  resolveChatThreadBody,
  resolveChatTimelineReveal,
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
  return {
    waitsForServerHistory: true,
    historyReady: false,
    timelineLength: 0,
    isPendingThread: false,
    listStatus: "idle",
    ...overrides
  }
}

/**
 * The screen's own sequence: the body for each store snapshot, the timeline
 * reveal (with the sticky "skeleton was shown"), and the entrance plan made
 * only while the timeline is presented, committed after each render.
 */
function openThread(snapshots: readonly { input: ChatThreadBodyInput; items: readonly ChatTimelineItem[] }[]) {
  let skeletonWasShown = false
  let entrance: ChatTimelineEntranceState = EMPTY_CHAT_TIMELINE_ENTRANCE_STATE
  let hasPresentedList = false
  return snapshots.map(({ input, items }) => {
    const body = resolveChatThreadBody(input)
    if (body === "skeleton") skeletonWasShown = true
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
    return { body, reveal, entering }
  })
}

const history = timeline(message("m1", 1), message("m2", 2), message("m3", 3))

test("cached history opens on the full timeline in its first frame, with no skeleton and no entrance", () => {
  const cached = production({ historyReady: true, timelineLength: history.length, listStatus: "ready" })
  const [first] = openThread([{ input: cached, items: history }])
  assert.deepEqual(first, { body: "timeline", reveal: "shown", entering: [] })
  assert.equal(getChatTimelineInitialOpacity(first.body), 1)
})

test("a background refresh of cached history keeps the timeline shown", () => {
  const frames = openThread([
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history },
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "loading" }), items: history },
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history }
  ])
  assert.deepEqual(frames.map((frame) => frame.body), ["timeline", "timeline", "timeline"])
  assert.deepEqual(frames.map((frame) => frame.reveal), ["shown", "shown", "shown"])
  assert.deepEqual(frames.flatMap((frame) => frame.entering), [])
})

test("unknown history shows the skeleton, then crossfades the whole first page in without row entrances", () => {
  const frames = openThread([
    { input: production({ listStatus: "loading" }), items: [] },
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history }
  ])
  assert.deepEqual(frames[0], { body: "skeleton", reveal: "hidden", entering: [] })
  assert.equal(getChatTimelineInitialOpacity(frames[0].body), 0)
  assert.deepEqual(frames[1], { body: "timeline", reveal: "crossfade", entering: [] })
})

test("a message realtime cached before the first page does not open a partial timeline", () => {
  const partial = timeline(message("m3", 3))
  const frames = openThread([
    { input: production({ timelineLength: 1, listStatus: "loading" }), items: partial },
    { input: production({ historyReady: true, timelineLength: 3, listStatus: "ready" }), items: history }
  ])
  assert.equal(frames[0].body, "skeleton")
  assert.deepEqual(frames[1], { body: "timeline", reveal: "crossfade", entering: [] })
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
  assert.equal(resolveChatThreadBody(production({ timelineLength: 2, listStatus: "failed" })), "empty")
})

test("a matched chat that is still being created shows the empty state", () => {
  assert.equal(resolveChatThreadBody(production({ isPendingThread: true, listStatus: "loading" })), "empty")
})

test("demo threads show their local messages at once and a skeleton only until they list", () => {
  const demo = (overrides: Partial<ChatThreadBodyInput>) =>
    resolveChatThreadBody(production({ waitsForServerHistory: false, ...overrides }))
  assert.equal(demo({ timelineLength: 2, listStatus: "idle" }), "timeline")
  assert.equal(demo({ listStatus: "idle" }), "skeleton")
  assert.equal(demo({ listStatus: "ready" }), "empty")
})
