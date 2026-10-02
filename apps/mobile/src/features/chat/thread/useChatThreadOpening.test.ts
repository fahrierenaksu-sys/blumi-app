import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as ChatStore from "../chatStore"
import type * as Hook from "./useChatThreadOpening"

const THREAD = "thread-open"

function message(messageId: string, minute: number): ChatMessage {
  return {
    messageId,
    threadId: THREAD,
    senderUserId: "partner",
    body: `body ${messageId}`,
    sentAt: new Date(Date.UTC(2026, 9, 2, 12, minute)).toISOString()
  }
}

const chatThread = (lastMessage?: ChatMessage): ChatThread => ({
  threadId: THREAD,
  miniRoomId: "room",
  participantUserIds: ["me", "partner"],
  participants: [{ userId: "me" }, { userId: "partner" }],
  createdAt: "2026-10-02T11:00:00Z",
  ...(lastMessage ? { lastMessage } : {})
} as ChatThread)

/**
 * Opens the conversation the way ChatThreadScreen does: the real chat store
 * snapshot for the thread feeds useChatThreadOpening in the same render.
 * Timers are manual so the skeleton delay is observable.
 */
function setup() {
  const runtime = createFakeReactRuntime()
  const store = loadSourceWithFakeReact<typeof ChatStore>("features/chat/chatStore.ts", runtime, {
    real: ["./chatErrorCopy", "./chatReceiptModel", "./chatMessageRenderKeys", "./chatReadHere", "./chatPartnerReceiptsState"]
  })
  const timers = new Map<number, { run: () => void; ms: number }>()
  let nextTimer = 0
  const hook = loadSourceWithFakeReact<typeof Hook>("features/chat/thread/useChatThreadOpening.ts", runtime, {
    modules: { "../chatStore": store },
    real: ["../chatRoomInviteModel", "./chatThreadOpeningModel"],
    globals: {
      setTimeout: (run: () => void, ms: number) => { timers.set(++nextTimer, { run, ms }); return nextTimer },
      clearTimeout: (id: number) => { timers.delete(id) }
    }
  })
  const frames: Hook.ChatThreadOpening[] = []
  const open = () => {
    runtime.render(() => {
      const snapshot = store.useChatThreadStore(THREAD)
      const opening = hook.useChatThreadOpening({
        threadId: snapshot.thread?.threadId ?? THREAD,
        messages: snapshot.messages,
        lastMessage: snapshot.thread?.lastMessage,
        historyReady: snapshot.historyReady,
        listStatus: snapshot.messageListState.status,
        roomInvites: [],
        waitsForServerHistory: true,
        isPendingThread: false
      })
      frames.push(opening)
      return opening
    })
    return frames[0]!
  }
  const elapse = (ms: number) => {
    for (const [id, timer] of [...timers]) {
      if (timer.ms > ms) continue
      timers.delete(id)
      timer.run()
    }
  }
  const latest = () => frames.at(-1)!
  const keys = (opening: Hook.ChatThreadOpening) =>
    opening.timeline.map((item) => item.kind === "message" ? item.message.messageId : item.inviteId)
  return { runtime, store, open, elapse, latest, keys, frames }
}

test("a thread with cached messages renders them on its first render, with no skeleton", () => {
  const { runtime, store, open, elapse, keys, frames } = setup()
  store.applyChatThreadListed({ userId: "me", threads: [chatThread(message("m3", 3))] })
  // The Inbox warmup already brought the first history page.
  store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [message("m1", 1), message("m2", 2), message("m3", 3)] })
  const first = open()
  assert.equal(first.body, "timeline")
  assert.deepEqual(keys(first), ["m1", "m2", "m3"])
  assert.equal(first.showsSkeleton, false)
  assert.equal(first.timelineReveal, "shown", "full opacity in the first frame, no fade")
  // The skeleton never comes later either, even while the opening refresh runs.
  store.applyChatMessageListLoading(THREAD)
  elapse(1_000)
  assert.ok(frames.every((frame) => !frame.showsSkeleton && !frame.skeletonWasShown))
  runtime.unmount()
  store.resetChatStore()
})

test("a thread whose history is not loaded yet opens on the message its Chats row showed", () => {
  const { runtime, store, open, elapse, latest, keys } = setup()
  store.applyChatThreadListed({ userId: "me", threads: [chatThread(message("m3", 3))] })
  const first = open()
  assert.equal(first.body, "timeline")
  assert.deepEqual(keys(first), ["m3"])
  assert.equal(first.showsSkeleton, false)
  // The first page fills in behind it; the shown message keeps its row.
  store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [message("m1", 1), message("m2", 2), message("m3", 3)] })
  assert.deepEqual(keys(latest()), ["m1", "m2", "m3"])
  assert.equal(latest().timelineReveal, "shown")
  elapse(1_000)
  assert.equal(latest().skeletonWasShown, false)
  runtime.unmount()
  store.resetChatStore()
})

test("with nothing to show, a fast load never flashes the skeleton and a slow one shows it only after the delay", () => {
  {
    const { runtime, store, open, elapse, latest } = setup()
    store.applyChatThreadListed({ userId: "me", threads: [chatThread()] })
    const first = open()
    assert.equal(first.body, "loading")
    assert.equal(first.showsSkeleton, false, "nothing is drawn over the first frames")
    elapse(100)
    store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [message("m1", 1)] })
    elapse(1_000)
    assert.equal(latest().body, "timeline")
    assert.equal(latest().timelineReveal, "shown", "a load that beat the delay appears without a fade")
    assert.equal(latest().skeletonWasShown, false)
    runtime.unmount()
    store.resetChatStore()
  }
  {
    const { runtime, store, open, elapse, latest } = setup()
    store.applyChatThreadListed({ userId: "me", threads: [chatThread()] })
    open()
    elapse(299)
    assert.equal(latest().showsSkeleton, false)
    elapse(300)
    assert.equal(latest().showsSkeleton, true, "a slow load shows the skeleton after the delay")
    store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [message("m1", 1)] })
    assert.equal(latest().showsSkeleton, false)
    assert.equal(latest().timelineReveal, "crossfade", "after a visible skeleton, a short fade")
    runtime.unmount()
    store.resetChatStore()
  }
})
