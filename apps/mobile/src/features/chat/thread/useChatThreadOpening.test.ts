import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import type { SessionActor } from "../../session/sessionModel"
import { buildChatTimeline, getChatTimelineItemKey, type ChatRoomInviteTimelineItem } from "../chatRoomInviteModel"
import { getOldestConfirmedChatMessageId } from "./chatThreadOpeningModel"
import { planChatTimelineEntrances } from "./chatTimelineEntranceModel"
import { resolveChatNewestEdgeChange } from "./chatScrollToLatestModel"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as ChatStore from "../chatStore"
import type * as Hook from "./useChatThreadOpening"
import type * as Sending from "./useChatMessageSending"
import type * as InvitePaging from "../chatRoomInvitePagingStore"
import type * as Coordinator from "../chatCoordinator"
import { getCompactRoomInviteIds } from "./chatInvitePresentationModel"

type ChatCoordinatorDependencies = Coordinator.ChatCoordinatorDependencies

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
  const invitePaging = loadSourceWithFakeReact<typeof InvitePaging>("features/chat/chatRoomInvitePagingStore.ts", runtime)
  const coordinatorModule = loadSourceWithFakeReact<typeof Coordinator>("features/chat/chatCoordinator.ts", runtime, {
    modules: { "./chatRoomInvitePagingStore": invitePaging },
    real: ["./chatRoomInviteModel", "./chatRoomInviteApi", "./chatErrorCopy", "./chatHistoryPolicy", "./roomInviteListEquality"]
  })
  const store = loadSourceWithFakeReact<typeof ChatStore>("features/chat/chatStore.ts", runtime, {
    real: ["./chatErrorCopy", "./chatReceiptModel", "./chatMessageRenderKeys", "./chatReadHere", "./chatPartnerReceiptsState"]
  })
  const timers = new Map<number, { run: () => void; ms: number }>()
  let nextTimer = 0
  const hook = loadSourceWithFakeReact<typeof Hook>("features/chat/thread/useChatThreadOpening.ts", runtime, {
    modules: { "../chatStore": store },
    real: ["../chatRoomInviteModel", "./chatThreadOpeningModel", "../chatHistoryPolicy"],
    globals: {
      setTimeout: (run: () => void, ms: number) => { timers.set(++nextTimer, { run, ms }); return nextTimer },
      clearTimeout: (id: number) => { timers.delete(id) }
    }
  })
  const frames: Hook.ChatThreadOpening[] = []
  const input = { threadId: THREAD, currentUserId: "me", roomInvites: [] as ChatRoomInviteTimelineItem[] }
  const sendingHook = loadSourceWithFakeReact<typeof Sending>("features/chat/thread/useChatMessageSending.ts", runtime, {
    modules: { "../../../analytics/productAnalytics": { captureProductEvent() {} }, "../../../ui/haptics": { hapticSelection() {} } },
    real: ["./chatThreadModel", "../chatHistoryPolicy"]
  })
  let requestMessages: Parameters<typeof sendingHook.useChatMessageSending>[0]["requestMessages"]
  let requestOlderRoomInvites: Parameters<typeof sendingHook.useChatMessageSending>[0]["requestOlderRoomInvites"]
  let usesInvitePaging = false
  let sending: ReturnType<typeof sendingHook.useChatMessageSending>
  const open = () => {
    runtime.render(() => {
      const snapshot = store.useChatThreadStore(input.threadId)
      const inviteHistory = invitePaging.useChatRoomInviteHistory(input.threadId, input.currentUserId)
      const opening = hook.useChatThreadOpening({
        threadId: snapshot.thread?.threadId ?? input.threadId,
        currentUserId: input.currentUserId,
        messages: snapshot.messages,
        lastMessage: snapshot.thread?.lastMessage,
        historyReady: snapshot.historyReady,
        latestHistoryMessageIds: snapshot.latestHistoryMessageIds,
        listStatus: snapshot.messageListState.status,
        roomInvites: input.roomInvites,
        inviteHistory: usesInvitePaging ? inviteHistory : undefined,
        waitsForServerHistory: true,
        isPendingThread: false
      })
      sending = sendingHook.useChatMessageSending({
        resolvedThreadId: input.threadId, currentUserId: input.currentUserId, sessionMode: "production",
        messages: snapshot.messages,
        oldestVisibleMessageId: opening.oldestVisibleMessageId,
        hasOlderCachedRows: opening.hasOlderCachedRows, canLoadEarlier: opening.body === "timeline",
        invitePagingCursor: usesInvitePaging ? inviteHistory.nextCursor : null,
        requestOlderRoomInvites, cachedEarlierInviteIds: opening.cachedEarlierInviteIds,
        onEarlierLoaded: opening.revealEarlier, getHistoryPageMessageIds: store.getHistoryPageMessageIds,
        requestMessages, sendChatMessage: undefined,
        addOptimisticMessage: store.addOptimisticMessage, getRetryableMessage: store.getRetryableMessage,
        markOptimisticMessageSending: store.markOptimisticMessageSending
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
  const useServer = (messages: readonly ChatMessage[], { failEarlier = false, invites, activeInvites = [], failInvites = false }: {
    failEarlier?: boolean; invites?: readonly ChatRoomInviteTimelineItem[]; activeInvites?: ChatRoomInviteTimelineItem[]; failInvites?: boolean
  } = {}) => {
    const requests: { before?: string; limit?: number }[] = []
    const inviteRequests: { before?: string; limit?: number; inviteId?: string }[] = []
    usesInvitePaging = invites !== undefined
    const actor = { profile: { userId: "me" }, session: { mode: "production", sessionToken: "test-session", sessionId: "test-session" } } as SessionActor
    const unexpected = (): never => { throw new Error("unexpected non-history operation") }
    const dependencies: ChatCoordinatorDependencies = {
      getSessionActor: () => actor, isCurrentSession: () => true, hasMessageHistory: store.hasMessageHistory,
      baseHttpUrl: "https://example.invalid", setRoomInvites: update => {
        input.roomInvites = update(input.roomInvites)
        if (frames.length) runtime.rerender()
      }, fetchThreadRoomInvites: async () => [],
      ...(invites ? { fetchThreadRoomInvitePage: async (_base: string, _session: string, _thread: string, options: { before?: string; limit?: number; inviteId?: string } = {}) => {
        inviteRequests.push(options)
        if (options.before && failInvites) throw new Error("offline")
        if (options.inviteId) return { invites: invites.filter(invite => invite.inviteId === options.inviteId), activeInvites: [], nextCursor: null, paged: true }
        const end = options.before ? invites.findIndex(item => item.inviteId === options.before) : invites.length
        const page = invites.slice(Math.max(0, end - (options.limit ?? 20)), Math.max(0, end))
        return { invites: page, activeInvites, nextCursor: end > (options.limit ?? 20) ? page[0]!.inviteId : null, paged: true }
      } } : {}),
      fetchThreadMessages: async (_base, _session, threadId, options = {}) => {
        requests.push(options)
        if (options.before && failEarlier) throw new Error("offline")
        const index = options.before ? messages.findIndex(item => item.messageId === options.before) : messages.length
        return { userId: "me", threadId, messages: messages.slice(Math.max(0, index - (options.limit ?? 50)), Math.max(0, index)) }
      },
      applyChatMessageListed: store.applyChatMessageListed, applyChatMessageListLoading: store.applyChatMessageListLoading,
      applyChatMessageListFailed: store.applyChatMessageListFailed,
      showWarningToast: () => undefined, captureProductEvent: () => undefined,
      sendThreadMessage: unexpected, markThreadRead: unexpected, createThreadRoomInvite: unexpected,
      leaveActiveRoom: unexpected, decideThreadRoomInvite: unexpected, cancelThreadRoomInvite: unexpected,
      joinRoomSession: unexpected, confirmOptimisticMessage: store.confirmOptimisticMessage,
      markOptimisticMessageFailed: store.markOptimisticMessageFailed, markLocalThreadRead: store.markThreadRead,
      openReadyMiniRoom: unexpected, sendGlobal: unexpected
    }
    const coordinator = coordinatorModule.createChatCoordinator(dependencies)
    requestMessages = coordinator.requestMessages
    requestOlderRoomInvites = coordinator.requestOlderRoomInvites
    return { coordinator, requests, inviteRequests }
  }
  return { runtime, store, invitePaging, open, elapse, latest, keys, frames, input, useServer, sending: () => sending }
}

const archivedInvite = (index: number): ChatRoomInviteTimelineItem => ({
  kind: "room_invite", inviteId: `archived-${String(index).padStart(3, "0")}`, threadId: THREAD,
  senderUserId: "partner", recipientUserId: "me", createdAt: message("date", index).sentAt, status: "declined"
})

test("two ancient authoritative live invitations remain full and reachable beside a bounded recent invitation-only page", async () => {
  const s = setup()
  const invites = Array.from({ length: 200 }, (_, index) => archivedInvite(index + 10))
  const activeInvites: ChatRoomInviteTimelineItem[] = [
    { ...archivedInvite(0), status: "pending" },
    { ...archivedInvite(1), status: "accepted", roomSessionId: "live-fixture" }
  ]
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread()] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [] })
  const server = s.useServer([], { invites, activeInvites })
  await server.coordinator.refreshThreadRoomInvites(THREAD)
  const first = s.open()
  assert.equal(s.input.roomInvites.length, 22)
  assert.equal(first.timeline.length, 22)
  assert.ok(s.keys(first).includes(activeInvites[0]!.inviteId))
  assert.ok(s.keys(first).includes(activeInvites[1]!.inviteId))
  assert.equal(first.oldestVisibleMessageId, null)
  const metadata = s.invitePaging.getChatRoomInviteHistory(THREAD, "me")
  assert.equal(metadata.nextCursor, invites[180]!.inviteId)
  const compact = getCompactRoomInviteIds(s.input.roomInvites, metadata.activeInviteIds)
  assert.ok(!compact.has(activeInvites[0]!.inviteId) && !compact.has(activeInvites[1]!.inviteId))
  const firstKeys = new Set(first.timeline.map(getChatTimelineItemKey))
  await s.sending().handleLoadEarlier()
  assert.equal(s.latest().timeline.length, 42)
  assert.equal(server.requests.length, 0)
  assert.deepEqual(server.inviteRequests[1], { before: invites[180]!.inviteId, limit: 20 })
  assert.equal(s.invitePaging.getChatRoomInviteHistory(THREAD, "me").nextCursor, invites[160]!.inviteId)
  const plan = planChatTimelineEntrances({ knownKeys: firstKeys, items: first.timeline,
    nextItems: s.latest().timeline, isInitialLoad: false, reduceMotion: false })
  assert.deepEqual([...plan.enteringKeys].filter(key => !s.latest().absorbedHistoryKeys.has(key)), [])
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("invite paging succeeds independently of empty/failed message history without exposing a disconnected message cache", async () => {
  for (const failEarlier of [false, true]) {
    const s = setup()
    const stale = Array.from({ length: 20 }, (_, index) => message(`stale-${index}`, index))
    const messages = Array.from({ length: 20 }, (_, index) => message(`current-${index}`, index + 400))
    const invites = Array.from({ length: 200 }, (_, index) => archivedInvite(index))
    s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(messages.at(-1))] })
    s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: stale })
    const server = s.useServer(messages, { failEarlier, invites })
    s.open()
    // A previously fetched old page can exist even when its reveal callback
    // was dropped while covered. It does not validate the new server segment.
    s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [message("stale-earlier", -1)] }, { before: "stale-0" })
    await server.coordinator.requestMessages(THREAD)
    await server.coordinator.refreshThreadRoomInvites(THREAD)
    const cursor = s.latest().oldestVisibleMessageId
    await s.sending().handleLoadEarlier()
    assert.ok(s.latest().timeline.some(row => row.kind === "room_invite"))
    assert.ok(!s.keys(s.latest()).some(key => key.startsWith("stale-")))
    assert.equal(server.requests.at(-1)!.before, cursor)
    assert.equal(s.invitePaging.getChatRoomInviteHistory(THREAD, "me").nextCursor, invites[160]!.inviteId)
    s.runtime.unmount()
    s.store.resetChatStore()
  }
})

test("message paging succeeds when invitation paging fails, while targeted old cache never advances invite history", async () => {
  const s = setup()
  const messages = Array.from({ length: 60 }, (_, index) => message(`current-${index}`, index + 400))
  const invites = Array.from({ length: 200 }, (_, index) => archivedInvite(index))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(messages.at(-1))] })
  const server = s.useServer(messages, { invites, failInvites: true })
  await server.coordinator.requestMessages(THREAD)
  await server.coordinator.refreshThreadRoomInvites(THREAD)
  assert.equal(await server.coordinator.ensureRoomInvite(THREAD, invites[0]!.inviteId), true)
  s.open()
  const cursor = s.invitePaging.getChatRoomInviteHistory(THREAD, "me").nextCursor
  await s.sending().handleLoadEarlier()
  assert.equal(s.latest().timeline.filter(row => row.kind === "message").length, 40)
  assert.equal(s.invitePaging.getChatRoomInviteHistory(THREAD, "me").nextCursor, cursor)
  assert.ok(!s.keys(s.latest()).includes(invites[0]!.inviteId))
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("a future-clock realtime invite joins the window without resetting older server cursor or replaying previous keys", async () => {
  const s = setup()
  const invites = Array.from({ length: 200 }, (_, index) => archivedInvite(index))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread()] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [] })
  const server = s.useServer([], { invites })
  await server.coordinator.refreshThreadRoomInvites(THREAD)
  s.open()
  const before = s.latest()
  server.coordinator.upsertRoomInvite(archivedInvite(500))
  assert.equal(s.latest().timeline.length, 21)
  assert.equal(s.invitePaging.getChatRoomInviteHistory(THREAD, "me").nextCursor, invites[180]!.inviteId)
  assert.ok(s.keys(s.latest()).includes(s.keys(before)[0]!))
  const plan = planChatTimelineEntrances({ knownKeys: new Set(before.timeline.map(getChatTimelineItemKey)), items: before.timeline,
    nextItems: s.latest().timeline, isInitialLoad: false, reduceMotion: false })
  assert.deepEqual([...plan.enteringKeys], [`room-invite:${archivedInvite(500).inviteId}`])
  s.runtime.unmount()
  s.store.resetChatStore()
})

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

test("a long cached conversation opens on its recent window; explicit paging reveals history without dropping new arrivals", () => {
  const { runtime, store, open, latest, keys } = setup()
  const history = Array.from({ length: 200 }, (_, index) => message(`m${index + 1}`, index + 1))
  store.applyChatThreadListed({ userId: "me", threads: [chatThread(history.at(-1))] })
  store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: history })
  const first = open()
  assert.deepEqual(keys(first), history.slice(-20).map(item => item.messageId))
  assert.equal(first.timelineReveal, "shown")
  first.revealEarlier()
  assert.deepEqual(keys(latest()), history.slice(-40).map(item => item.messageId))
  store.applyChatMessageReceived(message("new", 201), { localUserId: "me" })
  assert.deepEqual(keys(latest()), [...history.slice(-40).map(item => item.messageId), "new"])
  assert.equal(store.getMessages(THREAD).length, 201, "history remains intact in the account-scoped store")
  runtime.unmount()
  store.resetChatStore()
})

test("invitation-only history exposes all cached cards without a message request or row entrances", async () => {
  const s = setup()
  s.input.roomInvites = Array.from({ length: 25 }, (_, index) => ({
    kind: "room_invite", inviteId: `invite-${index}`, threadId: THREAD,
    senderUserId: "partner", recipientUserId: "me", createdAt: message("date", index).sentAt, status: "expired"
  }))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread()] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [] })
  const server = s.useServer([])
  const first = s.open()
  assert.equal(first.timeline.length, 20)
  assert.equal(first.hasOlderCachedRows, true)
  assert.equal(getOldestConfirmedChatMessageId(first.timeline, s.store.getMessageDeliveryState), null)
  await s.sending().handleLoadEarlier()
  const next = s.latest()
  assert.equal(next.timeline.length, 25)
  assert.equal(next.hasOlderCachedRows, false)
  assert.equal(server.requests.length, 0)
  const plan = planChatTimelineEntrances({
    knownKeys: new Set(first.timeline.map(getChatTimelineItemKey)), items: first.timeline,
    nextItems: next.timeline, isInitialLoad: false, reduceMotion: false
  })
  assert.deepEqual([...plan.enteringKeys].filter(key => !next.absorbedHistoryKeys.has(key)), [])
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("a retained old-clock local row does not hide the cached invitation-only reveal path", async () => {
  const s = setup()
  s.input.roomInvites = Array.from({ length: 25 }, (_, index) => ({
    kind: "room_invite", inviteId: `invite-${index}`, threadId: THREAD,
    senderUserId: "partner", recipientUserId: "me", createdAt: message("date", index + 1).sentAt, status: "expired"
  }))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread()] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [] })
  s.store.applyChatMessageReceived({ ...message("__local_old", 0), senderUserId: "me" }, { localUserId: "me" })
  const server = s.useServer([])
  const first = s.open()
  assert.equal(first.timeline.length, 20)
  assert.equal(first.oldestVisibleMessageId, null)
  assert.equal(first.hasOlderCachedRows, true)
  await s.sending().handleLoadEarlier()
  assert.equal(s.latest().timeline.length, 26)
  assert.equal(s.latest().hasOlderCachedRows, false)
  assert.equal(server.requests.length, 0)
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("a future optimistic clock and a late message in the visible middle preserve the oldest row; ACK keeps its render key", () => {
  const s = setup()
  const history = Array.from({ length: 25 }, (_, index) => message(`m${index + 1}`, index + 1))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(history.at(-1))] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: history })
  const first = s.open()
  const pending = s.store.addOptimisticMessage({ threadId: THREAD, senderUserId: "me", body: "synthetic draft", now: Date.parse(message("date", 35).sentAt) })
  const pendingRow = s.latest().timeline.find(item => item.kind === "message" && item.message.messageId === pending.localMessageId)!
  assert.equal(s.latest().timeline.length, 21)
  s.store.applyChatMessageReceived(message("incoming-middle", 30), { localUserId: "me" })
  s.store.applyChatMessageReceived(message("late-middle", 15.5), { localUserId: "me" })
  assert.equal(s.latest().timeline.length, 23)
  assert.ok(s.keys(s.latest()).includes(s.keys(first)[0]!))
  const beforeAck = s.latest().timeline
  s.store.confirmOptimisticMessage(pending.clientMessageId, { ...message("ack", 32), senderUserId: "me", body: "synthetic draft" }, "me")
  assert.equal(s.latest().timeline.length, 23)
  const ackRow = s.latest().timeline.find(item => item.kind === "message" && item.message.messageId === "ack")!
  assert.equal(getChatTimelineItemKey(ackRow), getChatTimelineItemKey(pendingRow))
  const plan = planChatTimelineEntrances({
    knownKeys: new Set(beforeAck.map(getChatTimelineItemKey)), items: beforeAck,
    nextItems: s.latest().timeline, isInitialLoad: false, reduceMotion: false
  })
  assert.equal(plan.enteringKeys.size, 0)
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("an existing backward-clock pending row and its ACK do not reopen hidden cached history on later arrivals", () => {
  const s = setup()
  const history = Array.from({ length: 25 }, (_, index) => message(`m${index + 1}`, index + 1))
  const local = { ...message("__local_old_clock", 0), senderUserId: "me" }
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(history.at(-1))] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: history })
  s.open()
  s.store.applyChatMessageReceived(local, { localUserId: "me" })
  assert.equal(s.latest().timeline.length, 21)
  assert.deepEqual(s.keys(s.latest()), [local.messageId, ...history.slice(-20).map(item => item.messageId)])
  s.store.applyChatMessageReceived(message("incoming", 26), { localUserId: "me" })
  assert.equal(s.latest().timeline.length, 22)
  assert.ok(!s.keys(s.latest()).includes("m1"))
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("an offline gap resets to the authoritative newest page, including a single live or ACK overlap, then pages from its shown boundary", async () => {
  for (const overlap of ["none", "live", "ack"]) {
    const s = setup()
    const all = Array.from({ length: 100 }, (_, index) => message(`m${index + 1}`, index + 1))
    s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(all.at(-1))] })
    s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: all.slice(0, 20) })
    if (overlap === "live") s.store.applyChatMessageReceived(all[99]!, { localUserId: "me" })
    if (overlap === "ack") {
      const pending = s.store.addOptimisticMessage({ threadId: THREAD, senderUserId: "me", body: "synthetic draft", now: Date.parse(all[99]!.sentAt) })
      s.store.confirmOptimisticMessage(pending.clientMessageId, { ...all[99]!, senderUserId: "me", body: "synthetic draft" }, "me")
    }
    const server = s.useServer(all)
    s.open()
    await server.coordinator.requestMessages(THREAD)
    assert.deepEqual(s.keys(s.latest()), all.slice(-20).map(item => item.messageId), overlap)
    assert.equal(getOldestConfirmedChatMessageId(s.latest().timeline, s.store.getMessageDeliveryState), "m81")
    assert.equal(s.store.getMessages(THREAD).length, 40, "disconnected cache stays stored without being shown")
    await s.sending().handleLoadEarlier()
    assert.deepEqual(server.requests, [{ limit: 20 }, { before: "m81", limit: 20 }])
    assert.deepEqual(s.keys(s.latest()), all.slice(-40).map(item => item.messageId))
    assert.ok(s.latest().absorbedHistoryKeys.size > 0)
    s.runtime.unmount()
    s.store.resetChatStore()
  }
})

test("empty and failed older server pages cannot expose an older disconnected cache segment", async () => {
  for (const failEarlier of [false, true]) {
    const s = setup()
    const stale = Array.from({ length: 20 }, (_, index) => message(`stale${index + 1}`, index + 1))
    const serverHistory = Array.from({ length: 20 }, (_, index) => message(`m${81 + index}`, 81 + index))
    s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(serverHistory.at(-1))] })
    s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: stale })
    const server = s.useServer(serverHistory, { failEarlier })
    s.open()
    await server.coordinator.requestMessages(THREAD)
    const before = s.keys(s.latest())
    await s.sending().handleLoadEarlier()
    assert.deepEqual(s.keys(s.latest()), before)
    assert.equal(s.latest().timeline.length, 20)
    assert.equal(s.sending().isLoadingEarlier, false)
    assert.deepEqual(s.store.getHistoryPageMessageIds(THREAD, "m81"), failEarlier ? undefined : [])
    s.runtime.unmount()
    s.store.resetChatStore()
  }
})

test("same-time reverse arrivals select the canonical recent window and confirmed cursor", () => {
  const s = setup()
  const history = Array.from({ length: 25 }, (_, index) => message(`tie-${String(25 - index).padStart(2, "0")}`, 1))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(history[0])] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: history })
  const first = s.open()
  assert.deepEqual(first.timeline, buildChatTimeline(s.store.getMessages(THREAD), [], s.store.getMessageRenderKey).slice(-20))
  assert.equal(getOldestConfirmedChatMessageId(first.timeline, s.store.getMessageDeliveryState), "tie-06")
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("account and thread switches reset the visible budget and stale expansion callbacks", () => {
  const s = setup()
  const history = Array.from({ length: 100 }, (_, index) => message(`m${index + 1}`, index + 1))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(history.at(-1))] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: history })
  const first = s.open()
  first.revealEarlier()
  assert.equal(s.latest().timeline.length, 40)
  s.input.currentUserId = "other-account"
  s.runtime.rerender()
  assert.equal(s.latest().timeline.length, 20)
  first.revealEarlier()
  assert.equal(s.latest().timeline.length, 20)
  s.input.threadId = "other-thread"
  s.runtime.rerender()
  assert.equal(s.latest().timeline.length, 0)
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("a backward device clock still puts a newly sent optimistic row at the visible newest edge", () => {
  const s = setup()
  const history = Array.from({ length: 25 }, (_, index) => message(`m${index + 1}`, index + 1))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(history.at(-1))] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: history })
  const previous = s.open()
  const pending = s.store.addOptimisticMessage({ threadId: THREAD, senderUserId: "me", body: "synthetic draft", now: Date.parse(message("date", 0).sentAt) })
  assert.equal(s.keys(s.latest()).at(-1), pending.localMessageId)
  assert.equal(s.latest().timeline.length, 21)
  assert.ok(s.keys(s.latest()).includes(s.keys(previous)[0]!))
  assert.deepEqual(resolveChatNewestEdgeChange({
    previousNewestKey: getChatTimelineItemKey(previous.timeline.at(-1)!), newestFirst: [...s.latest().timeline].reverse(),
    currentUserId: "me", isAway: true
  }), { follow: true, unseenIncoming: 0 })
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("an ACK retained before a confirmed timestamp-tie window does not become its older server cursor", async () => {
  const s = setup()
  const all = Array.from({ length: 26 }, (_, index) => message(String.fromCharCode(97 + index), 1))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(all.at(-1))] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: all.slice(1) })
  const server = s.useServer(all)
  const initial = s.open()
  const pending = s.store.addOptimisticMessage({ threadId: THREAD, senderUserId: "me", body: "synthetic draft", now: Date.parse(all[0]!.sentAt) })
  s.store.confirmOptimisticMessage(pending.clientMessageId, { ...all[0]!, senderUserId: "me", body: "synthetic draft" }, "me")
  assert.equal(s.latest().timeline.length, 21)
  assert.ok(s.keys(s.latest()).includes("a"))
  assert.equal(s.latest().oldestVisibleMessageId, "g", "retained a is not a connected history fence")
  await s.sending().handleLoadEarlier()
  assert.deepEqual(server.requests, [{ before: "g", limit: 20 }])
  assert.deepEqual(s.keys(s.latest()), all.map(item => item.messageId))
  assert.equal(s.latest().oldestVisibleMessageId, "a", "a can be the fence once its intervening page is shown")
  const plan = planChatTimelineEntrances({
    knownKeys: new Set(initial.timeline.map(getChatTimelineItemKey).concat(`message:${pending.localMessageId}`)),
    items: initial.timeline, nextItems: s.latest().timeline, isInitialLoad: false, reduceMotion: false
  })
  assert.deepEqual([...plan.enteringKeys].filter(key => !s.latest().absorbedHistoryKeys.has(key)), [])
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("resetting the account store also resets the opening history budget for the same route", () => {
  const s = setup()
  const history = Array.from({ length: 100 }, (_, index) => message(`m${index + 1}`, index + 1))
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(history.at(-1))] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: history })
  const first = s.open()
  first.revealEarlier()
  assert.equal(s.latest().timeline.length, 40)
  s.store.resetChatStore()
  assert.equal(s.latest().timeline.length, 0)
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread(history.at(-1))] })
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: history })
  assert.equal(s.latest().timeline.length, 20)
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("a partner arrival remains visible when the preceding history consists entirely of my acknowledged local keys", () => {
  const s = setup()
  s.store.applyChatThreadListed({ userId: "me", threads: [chatThread()] })
  for (let index = 1; index <= 25; index += 1) {
    const pending = s.store.addOptimisticMessage({ threadId: THREAD, senderUserId: "me", body: "synthetic draft", now: Date.parse(message("date", index).sentAt) })
    s.store.confirmOptimisticMessage(pending.clientMessageId, { ...message(`own${index}`, index), senderUserId: "me", body: "synthetic draft" }, "me")
  }
  s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: s.store.getMessages(THREAD) })
  const first = s.open()
  assert.equal(first.timeline.length, 20)
  s.store.applyChatMessageReceived(message("partner-arrival", 26), { localUserId: "me" })
  assert.equal(s.latest().timeline.length, 21)
  assert.equal(s.keys(s.latest()).at(-1), "partner-arrival")
  assert.ok(s.keys(s.latest()).includes(s.keys(first)[0]!))
  s.runtime.unmount()
  s.store.resetChatStore()
})

test("a full pending-only opening window shows new partner arrivals without counting hidden cached locals as new", () => {
  for (const [cachedCount, arrivesAsHistory] of [[20, false], [25, false], [20, true], [25, true]] as const) {
    const s = setup()
    s.store.applyChatThreadListed({ userId: "me", threads: [chatThread()] })
    for (let index = 1; index <= cachedCount; index += 1) {
      s.store.addOptimisticMessage({ threadId: THREAD, senderUserId: "me", body: "synthetic draft", now: Date.parse(message("date", index).sentAt) })
    }
    const first = s.open()
    assert.equal(first.timeline.length, 20)
    if (arrivesAsHistory) s.store.applyChatMessageListed({ userId: "me", threadId: THREAD, messages: [message("partner-arrival", cachedCount + 1)] })
    else s.store.applyChatMessageReceived(message("partner-arrival", cachedCount + 1), { localUserId: "me" })
    assert.equal(s.latest().timeline.length, 21)
    assert.ok(s.keys(s.latest()).includes("partner-arrival"))
    assert.ok(s.keys(s.latest()).includes(s.keys(first)[0]!))
    s.input.roomInvites = [...s.input.roomInvites]
    s.runtime.rerender()
    assert.equal(s.latest().timeline.length, 21, "a repeated render does not count the hidden local cache as arrivals")
    s.input.roomInvites = [{ kind: "room_invite", inviteId: "new-invite", threadId: THREAD,
      senderUserId: "partner", recipientUserId: "me", createdAt: message("date", cachedCount + 2).sentAt, status: "expired" }]
    s.runtime.rerender()
    assert.equal(s.latest().timeline.length, 22)
    assert.ok(s.keys(s.latest()).includes("new-invite"))
    s.runtime.unmount()
    s.store.resetChatStore()
  }
})
