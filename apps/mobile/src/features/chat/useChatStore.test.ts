import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as ChatStore from "./chatStore"
import type { ChatThread } from "@blumi/contracts"

// Characterizes useChatStore's invalidation: one view object per store
// notification, stable across unrelated re-renders.
function mount() {
  const runtime = createFakeReactRuntime()
  const store = loadSourceWithFakeReact<typeof ChatStore>("features/chat/chatStore.ts", runtime, {
    real: ["./chatErrorCopy", "./chatReceiptModel", "./chatMessageRenderKeys", "./chatReadHere", "./chatPartnerReceiptsState"]
  })
  return { runtime, store }
}

test("the chat store view keeps its identity across re-renders without a store change", () => {
  const { runtime, store } = mount()
  const first = runtime.render(() => store.useChatStore())
  const second = runtime.rerender()
  assert.equal(second, first)
  assert.deepEqual(first.threadListState, { status: "idle" })
})

test("a store notification re-renders with a new view carrying the new state", () => {
  const { runtime, store } = mount()
  const first = runtime.render(() => store.useChatStore())
  const renders = runtime.renderCount
  store.applyChatThreadListLoading()
  const next = runtime.output as ChatStore.ChatStoreView
  assert.equal(runtime.renderCount, renders + 1)
  assert.notEqual(next, first)
  assert.deepEqual(next.threadListState, { status: "loading" })
  runtime.unmount()
  store.applyChatThreadListFailed("We could not refresh your chats yet.")
  assert.equal(runtime.renderCount, renders + 1, "no update after unmount")
})

test("a change made after render but before the subscription is not lost", () => {
  const { runtime, store } = mount()
  const react = runtime.react as { useEffect: (run: () => void, deps: unknown[]) => void }
  runtime.render(() => {
    // Declared first, so it runs before the store subscribes.
    react.useEffect(() => { store.applyChatThreadListLoading() }, [])
    return store.useChatStore()
  })
  assert.deepEqual((runtime.output as ChatStore.ChatStoreView).threadListState, { status: "loading" })
})

const inboxThread = (): ChatThread => ({
  threadId: "synthetic-thread", miniRoomId: "synthetic-room",
  participantUserIds: ["synthetic-viewer", "synthetic-partner"],
  participants: [{ userId: "synthetic-viewer" }, { userId: "synthetic-partner", displayName: "Partner" }],
  createdAt: "2026-10-03T00:00:00Z", unreadCount: 0,
  lastMessage: { messageId: "synthetic-last", threadId: "synthetic-thread", senderUserId: "synthetic-partner",
    body: "Synthetic message", sentAt: "2026-10-03T00:01:00Z" }
})

test("history warmup, delivery and receipt changes leave an unchanged Inbox subscriber idle", () => {
  const { runtime, store } = mount()
  const thread = inboxThread()
  store.applyChatThreadListed({ userId: "synthetic-viewer", threads: [thread] })
  const first = runtime.render(() => store.useChatInboxStore())
  const renders = runtime.renderCount
  for (let n = 0; n < 6; n += 1) {
    store.applyChatMessageListLoading(`synthetic-warm-${n}`)
    store.applyChatMessageListed({ userId: "synthetic-viewer", threadId: `synthetic-warm-${n}`, messages: [] })
  }
  store.applyChatMessageListed({ userId: "synthetic-viewer", threadId: thread.threadId, messages: [thread.lastMessage!] })
  store.applyChatReceiptUpdated({ threadId: thread.threadId, userId: "synthetic-partner",
    participantUserIds: thread.participantUserIds, readUpTo: { sentAt: thread.lastMessage!.sentAt, messageId: thread.lastMessage!.messageId } })
  store.setActiveThread(thread.threadId)
  store.setActiveThread(null)
  const pending = store.addOptimisticMessage({ threadId: "synthetic-other", senderUserId: "synthetic-viewer",
    body: "Synthetic draft", clientMessageId: "synthetic-send" })
  store.markOptimisticMessageFailed(pending.clientMessageId)
  store.markOptimisticMessageSending(pending.clientMessageId)
  assert.equal(runtime.renderCount, renders, "nothing the Inbox draws changed")
  assert.equal(runtime.output, first)
  runtime.unmount()
  store.resetChatStore()
})

test("Inbox observes unread, last-message, participant, loading and reset changes immediately", () => {
  const { runtime, store } = mount()
  const thread = inboxThread()
  store.applyChatThreadListed({ userId: "synthetic-viewer", threads: [{ ...thread, unreadCount: 2 }] })
  runtime.render(() => store.useChatInboxStore())
  const snapshot = () => runtime.output as ChatStore.ChatInboxSnapshot
  assert.equal(snapshot().unreadCounts.get(thread.threadId), 2)
  store.setActiveThread(thread.threadId)
  assert.equal(snapshot().unreadCounts.get(thread.threadId), 0)
  store.setActiveThread(null)
  store.applyChatMessageReceived({ ...thread.lastMessage!, messageId: "synthetic-new", body: "Changed synthetic message",
    sentAt: "2026-10-03T00:02:00Z" }, { localUserId: "synthetic-viewer" })
  assert.equal(snapshot().threads[0]?.lastMessage?.messageId, "synthetic-new")
  assert.equal(snapshot().unreadCounts.get(thread.threadId), 1)
  store.applyChatParticipantUpdated({ userId: "synthetic-partner", displayName: "Updated partner" })
  assert.equal(snapshot().threads[0]?.participants[1].displayName, "Updated partner")
  store.applyChatThreadListLoading()
  assert.equal(snapshot().threadListState.status, "loading")
  store.applyChatThreadListFailed("Refresh failed")
  assert.equal(snapshot().threadListState.status, "failed")
  store.resetChatStore()
  assert.deepEqual(snapshot().threads, [])
  assert.equal(snapshot().unreadCounts.size, 0)
  assert.equal(snapshot().threadListState.status, "idle")
  store.applyChatThreadListed({ userId: "synthetic-viewer", threads: [inboxThread()] })
  assert.equal(snapshot().threads[0]?.participants[1].displayName, "Partner", "an account reset cannot retain old participant data")
  runtime.unmount()
  store.resetChatStore()
})
