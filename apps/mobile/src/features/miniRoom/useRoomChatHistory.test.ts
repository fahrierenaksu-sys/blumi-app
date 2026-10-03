import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as ChatStore from "../chat/chatStore"
import type * as InRoomChatHook from "./useInRoomChat"
import type * as RoomHistory from "./useRoomChatHistory"
import {
  findCanonicalRoomChatThread,
  findLastCanonicalRoomChatMessage,
  findMissedCanonicalRoomChatMessages,
  shouldRenderIncomingRoomChatMessage
} from "./inRoomChatThread"
import { advanceRoomEntryReplayGate, createRoomEntryReplayGate } from "./roomEntryReplayGate"
import { createReconnectTransitionTracker, type RealtimeConnectionStatus } from "@blumi/realtime-client"
import { ROOM_CHAT_HISTORY_LIMIT, resolveRoomChatHistoryStatus, selectRoomChatHistory } from "./roomChatHistoryModel"

const localUserId = "history-owner"
const partnerUserId = "history-partner"
const threadId = "history-room-thread"

function mount() {
  const runtime = createFakeReactRuntime()
  const store = loadSourceWithFakeReact<typeof ChatStore>("features/chat/chatStore.ts", runtime, {
    real: ["./chatErrorCopy", "./chatReceiptModel", "./chatMessageRenderKeys", "./chatReadHere", "./chatPartnerReceiptsState"]
  })
  const history = loadSourceWithFakeReact<typeof RoomHistory>("features/miniRoom/useRoomChatHistory.ts", runtime, {
    modules: {
      "../chat/chatStore": store,
      "./roomChatHistoryModel": { ROOM_CHAT_HISTORY_LIMIT, resolveRoomChatHistoryStatus, selectRoomChatHistory }
    }
  })
  return { runtime, store, history }
}

function chatThread(id: string, partner: string): ChatThread {
  return {
    threadId: id,
    miniRoomId: `room-${id}`,
    participantUserIds: [localUserId, partner],
    participants: [{ userId: localUserId }, { userId: partner, displayName: "Partner" }],
    createdAt: "2026-10-02T00:00:00.000Z"
  }
}

function message(id: string, targetThreadId: string, senderUserId: string, body: string, sentAt: string): ChatMessage {
  return { messageId: id, threadId: targetThreadId, senderUserId, body, sentAt }
}

test("MiniRoom history ignores unrelated chat updates and tracks its own messages and delivery within the 15-row window", () => {
  const { runtime, store, history } = mount()
  store.applyChatThreadListed({ userId: localUserId, threads: [
    chatThread(threadId, partnerUserId),
    chatThread("unrelated-thread", "unrelated-partner")
  ] })
  const initialMessages = Array.from({ length: 90 }, (_, index) => message(
    `history-${index}`,
    threadId,
    partnerUserId,
    `Message ${index}`,
    new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString()
  ))
  store.applyChatMessageListed({ userId: localUserId, threadId, messages: initialMessages })

  runtime.render(() => history.useRoomChatHistory({ threadId, localUserId }))
  const read = () => runtime.output as ReturnType<typeof history.useRoomChatHistory>
  assert.equal(read().items.length, 15)
  assert.equal(read().items[0]?.id, "history-89")
  assert.equal(read().items.at(-1)?.id, "history-75")
  assert.equal(store.getMessages(threadId).length, 90, "the MiniRoom window does not truncate shared chat history")
  assert.equal(read().status, "ready")

  store.applyChatMessageListed({
    userId: localUserId,
    threadId,
    messages: initialMessages.slice(-ROOM_CHAT_HISTORY_LIMIT)
  })
  assert.equal(store.getMessages(threadId).length, 90, "a short latest-page response merges without deleting older chat")
  // This own-thread response can update authoritative page membership even
  // when the visible messages stay the same. Start the isolation check here.
  const initialRenderCount = runtime.renderCount

  store.applyChatMessageReceived(
    message("unrelated-live", "unrelated-thread", "unrelated-partner", "Other conversation", "2026-10-03T00:01:00.000Z"),
    { localUserId }
  )
  assert.equal(runtime.renderCount, initialRenderCount, "another thread's message must not invalidate MiniRoom history")

  const liveMessage = message("room-live", threadId, partnerUserId, "Room conversation", "2026-10-03T00:02:00.000Z")
  store.applyChatMessageReceived(liveMessage, { localUserId })
  assert.equal(runtime.renderCount, initialRenderCount + 1)
  assert.equal(read().items[0]?.id, "room-live")
  assert.equal(store.getMessages(threadId).length, 91, "live messages append while the room view stays bounded")

  const pending = store.addOptimisticMessage({
    threadId,
    senderUserId: localUserId,
    body: "Sending from the room",
    clientMessageId: "room-send",
    trackDelivery: true
  })
  assert.equal(read().items[0]?.id, pending.localMessageId)
  assert.equal(read().items[0]?.delivery, "sending")
  store.markOptimisticMessageFailed(pending.clientMessageId)
  assert.equal(read().items[0]?.delivery, "failed")
  store.markOptimisticMessageSending(pending.clientMessageId)
  assert.equal(read().items[0]?.delivery, "sending")

  store.applyChatMessageReceived(message(
    "room-send-ack",
    threadId,
    localUserId,
    "Sending from the room",
    "2026-10-03T00:03:00.000Z"
  ), { localUserId })
  assert.equal(read().items[0]?.id, "room-send-ack")
  assert.equal(read().items[0]?.delivery, "sent")
  assert.equal(read().items.length, 15)

  runtime.unmount()
  store.resetChatStore()
})

test("MiniRoom live chat ignores other threads and preserves entry replay, request, and cleanup behavior", () => {
  const runtime = createFakeReactRuntime()
  const chatStore = loadSourceWithFakeReact<typeof ChatStore>("features/chat/chatStore.ts", runtime, {
    real: ["./chatErrorCopy", "./chatReceiptModel", "./chatMessageRenderKeys", "./chatReadHere", "./chatPartnerReceiptsState"]
  })
  const connectionStatus: RealtimeConnectionStatus = "connected"
  const realtimeSends: unknown[] = []
  const historyRequests: { threadId: string; options?: { before?: string; limit?: number } }[] = []
  const statusListeners = new Set<(status: RealtimeConnectionStatus) => void>()
  const realtimeEventListeners = new Set<(event: unknown) => void>()
  const send = (event: unknown) => { realtimeSends.push(event); return true }
  const realtime = {
    getGlobalStatus: () => connectionStatus,
    subscribeToStatus: (listener: (status: RealtimeConnectionStatus) => void) => {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    useGlobalRealtime: () => ({ connectionStatus, send }),
    useGlobalRealtimeEvents: (listener: (event: unknown) => void) => {
      const useEffect = runtime.react.useEffect as (effect: () => () => void, deps: readonly unknown[]) => void
      useEffect(() => {
        realtimeEventListeners.add(listener)
        return () => { realtimeEventListeners.delete(listener) }
      }, [listener])
    }
  }
  const inRoomChat = loadSourceWithFakeReact<typeof InRoomChatHook>("features/miniRoom/useInRoomChat.ts", runtime, {
    modules: {
      "../chat/chatStore": chatStore,
      "../realtime/globalRealtimeProvider": realtime,
      "@blumi/realtime-client": { createReconnectTransitionTracker },
      "../chat/thread/chatThreadModel": {
        normalizeOutgoingChatBody: (body: string) => body.trim().replace(/\s+/g, " ")
      },
      "./inRoomChatThread": {
        findLastCanonicalRoomChatMessage,
        findCanonicalRoomChatThread,
        findMissedCanonicalRoomChatMessages,
        shouldRenderIncomingRoomChatMessage
      },
      "./roomEntryReplayGate": { createRoomEntryReplayGate, advanceRoomEntryReplayGate },
      "./roomChatHistoryModel": { ROOM_CHAT_HISTORY_LIMIT }
    }
  })
  const canonicalThread = chatThread(threadId, partnerUserId)
  chatStore.applyChatThreadListed({ userId: localUserId, threads: [
    canonicalThread,
    { ...chatThread("unrelated-thread", "unrelated-partner"), miniRoomId: "unrelated-room" }
  ] })
  const entryMessage = message("before-room", threadId, partnerUserId, "Already in chat", new Date(Date.now() - 60_000).toISOString())
  chatStore.applyChatMessageListed({ userId: localUserId, threadId, messages: [entryMessage] })

  runtime.render(() => inRoomChat.useInRoomChat({
    miniRoomId: "room-history-room",
    sourceThreadId: threadId,
    localUserId,
    partnerUserId,
    requestMessages: async (requestedThreadId, options) => {
      historyRequests.push({ threadId: requestedThreadId, options })
    }
  }))
  const read = () => runtime.output as ReturnType<typeof inRoomChat.useInRoomChat>
  assert.equal(read().threadId, threadId)
  assert.equal(historyRequests.length, 0, "a current chat snapshot requires no history request on room entry")
  assert.equal(realtimeSends.length, 0, "entry reuses the server-confirmed recent history already in chat store")

  chatStore.applyChatMessageListed({ userId: localUserId, threadId, messages: [entryMessage] })
  assert.equal(read().newMessages.map((event) => event.messageId).join("|"), "before-room")
  const readyRenderCount = runtime.renderCount

  chatStore.applyChatMessageReceived(
    message("unrelated-live", "unrelated-thread", "unrelated-partner", "Other conversation", "2026-10-03T00:01:00.000Z"),
    { localUserId }
  )
  assert.equal(runtime.renderCount, readyRenderCount, "unrelated conversation events do not render MiniRoom")

  chatStore.applyChatMessageReceived(
    message("room-live", threadId, partnerUserId, "In this room", "2026-10-03T00:02:00.000Z"),
    { localUserId }
  )
  assert.equal(runtime.renderCount, readyRenderCount + 1, "canonical room thread messages remain reactive")
  assert.equal(realtimeSends.length, 0, "live thread updates keep the cached entry request-free")

  const beforeOwnMessage = runtime.renderCount
  const pending = chatStore.addOptimisticMessage({
    threadId,
    senderUserId: localUserId,
    body: "Sending from the room",
    clientMessageId: "room-client-id",
    trackDelivery: true
  })
  assert.equal(runtime.renderCount, beforeOwnMessage + 1)
  chatStore.markOptimisticMessageFailed(pending.clientMessageId)
  assert.equal(runtime.renderCount, beforeOwnMessage + 2, "delivery status for the selected thread remains reactive")

  runtime.unmount()
  assert.equal(statusListeners.size, 0, "realtime status listeners are removed on unmount")
  assert.equal(realtimeEventListeners.size, 0, "realtime event listeners are removed on unmount")
  const unmountedRenderCount = runtime.renderCount
  chatStore.applyChatMessageReceived(
    message("room-after-unmount", threadId, partnerUserId, "After exit", "2026-10-03T00:03:00.000Z"),
    { localUserId }
  )
  assert.equal(runtime.renderCount, unmountedRenderCount)
  chatStore.resetChatStore()
})
