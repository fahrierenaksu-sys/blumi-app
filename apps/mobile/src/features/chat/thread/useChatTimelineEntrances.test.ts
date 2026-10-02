import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { buildChatTimeline, type ChatTimelineItem } from "../chatRoomInviteModel"
import type * as Hook from "./useChatTimelineEntrances"

function message(messageId: string, minute: number): ChatMessage {
  return {
    messageId,
    threadId: "thread-1",
    senderUserId: "partner",
    body: `body ${messageId}`,
    sentAt: new Date(Date.UTC(2026, 9, 2, 12, minute)).toISOString()
  }
}

function mount(initial: { timeline: readonly ChatTimelineItem[]; isListPresented: boolean }, reduceMotion = false) {
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<typeof Hook>("features/chat/thread/useChatTimelineEntrances.ts", runtime, {
    modules: { "../../../ui/animations": { useReducedMotion: () => reduceMotion } },
    real: ["./chatTimelineEntranceModel"]
  })
  let result: Hook.ChatTimelineEntrances | undefined
  const render = (input: { timeline: readonly ChatTimelineItem[]; isListPresented: boolean }) => {
    runtime.render(() => { result = hook.useChatTimelineEntrances(input) })
    return { entering: [...result!.enteringKeys], arrived: [...result!.arrivedKeys] }
  }
  return { first: render(initial), render, unmount: () => runtime.unmount() }
}

const history = buildChatTimeline([message("m1", 1), message("m2", 2), message("m3", 3)], [])
const withNewest = buildChatTimeline([message("m1", 1), message("m2", 2), message("m3", 3), message("m4", 4)], [])

test("a cached thread's first rows mount without an entrance", () => {
  const screen = mount({ timeline: history, isListPresented: true })
  assert.deepEqual(screen.first, { entering: [], arrived: [] })
  // The same rows rendered again (a store refresh) still do not enter.
  assert.deepEqual(screen.render({ timeline: [...history], isListPresented: true }), { entering: [], arrived: [] })
  screen.unmount()
})

test("the first page shown after the skeleton mounts without an entrance", () => {
  const screen = mount({ timeline: [], isListPresented: false })
  assert.deepEqual(screen.render({ timeline: history, isListPresented: true }), { entering: [], arrived: [] })
  screen.unmount()
})

test("a row that arrives once the timeline is on screen enters, once", () => {
  const screen = mount({ timeline: history, isListPresented: true })
  assert.deepEqual(screen.render({ timeline: withNewest, isListPresented: true }), {
    entering: ["message:m4"],
    arrived: ["message:m4"]
  })
  assert.deepEqual(screen.render({ timeline: [...withNewest], isListPresented: true }), { entering: [], arrived: [] })
  screen.unmount()
})

test("under Reduce Motion an arriving row does not animate but still counts as arrived", () => {
  const screen = mount({ timeline: history, isListPresented: true }, true)
  assert.deepEqual(screen.render({ timeline: withNewest, isListPresented: true }), {
    entering: [],
    arrived: ["message:m4"]
  })
  screen.unmount()
})
