import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage, ChatThread, ServerEvent } from "@blumi/contracts"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as Store from "./chatStore"
import type * as Sending from "./thread/useChatMessageSending"
import type { SessionActor } from "../session/sessionModel"
import { createChatCoordinator, type ChatCoordinatorDependencies } from "./chatCoordinator"
import { createGlobalRealtimeEventHandler } from "../realtime/globalRealtimeEventHandler"
import { createChatDeliveryAckBatcher } from "./chatDeliveryAckBatcher"

const THREAD = "synthetic-instant-thread"
const OWNER = "synthetic-instant-owner"
const PEER = "synthetic-instant-peer"
const actorFor = (userId: string): SessionActor => ({
  session: { mode: "production", userId, accountId: `synthetic-account-${userId}`,
    sessionId: `synthetic-session-${userId}`, sessionToken: `synthetic-token-${userId}` },
  profile: { userId, displayName: "Synthetic owner" }
}) as SessionActor

function mount() {
  const runtime = createFakeReactRuntime()
  const store = loadSourceWithFakeReact<typeof Store>("features/chat/chatStore.ts", runtime, {
    real: ["./chatErrorCopy", "./chatReceiptModel", "./chatMessageRenderKeys", "./chatReadHere", "./chatPartnerReceiptsState"]
  })
  const sending = loadSourceWithFakeReact<typeof Sending>("features/chat/thread/useChatMessageSending.ts", runtime, {
    modules: { "../../../analytics/productAnalytics": { captureProductEvent() {} }, "../../../ui/haptics": { hapticSelection() {} } },
    real: ["./chatThreadModel", "../chatHistoryPolicy"]
  })
  let actor = actorFor(OWNER)
  const warnings: unknown[] = []
  const requests: { threadId: string; body: string; clientMessageId: string | undefined;
    pendingShown: boolean; resolve(message: ChatMessage): void; reject(error: Error): void }[] = []
  const operations: Promise<void>[] = []
  const scheduled = new Map<number, () => void>()
  const deliveryAcks: unknown[] = []
  let timerId = 0
  const batcher = createChatDeliveryAckBatcher({
    send: (ack) => { deliveryAcks.push(ack); return true }, isActive: () => true,
    schedule: (callback) => { scheduled.set(++timerId, callback); return timerId },
    cancel: (id) => { scheduled.delete(id as number) }
  })
  const dependencies: ChatCoordinatorDependencies = {
    getSessionActor: () => actor, isCurrentSession: (expected) => expected === actor,
    hasMessageHistory: store.hasMessageHistory, baseHttpUrl: "https://synthetic.blumi.test",
    setRoomInvites() {}, fetchThreadRoomInvites: async () => [],
    sendThreadMessage: (_base, _token, threadId, body, options) => new Promise((resolve, reject) => {
      requests.push({ threadId, body, clientMessageId: options?.clientMessageId, resolve, reject,
        pendingShown: current().snapshot.messages.some((message) => message.body === body && store.getMessageDeliveryState(message.messageId) === "sending") })
    }),
    fetchThreadMessages: async () => ({ userId: actor.profile.userId, threadId: THREAD, messages: [] }),
    markThreadRead: async () => undefined,
    createThreadRoomInvite: async () => { throw new Error("Unexpected invite") },
    leaveActiveRoom: async () => ({ ended: true }),
    decideThreadRoomInvite: async () => { throw new Error("Unexpected invite") },
    cancelThreadRoomInvite: async () => { throw new Error("Unexpected invite") },
    joinRoomSession: async () => { throw new Error("Unexpected room") },
    applyChatMessageListed: store.applyChatMessageListed,
    applyChatMessageListLoading: store.applyChatMessageListLoading,
    applyChatMessageListFailed: store.applyChatMessageListFailed,
    confirmOptimisticMessage: store.confirmOptimisticMessage,
    markOptimisticMessageFailed: store.markOptimisticMessageFailed,
    markLocalThreadRead: store.markThreadRead,
    openReadyMiniRoom() {}, captureProductEvent() {}, showWarningToast: (warning) => warnings.push(warning), sendGlobal() {}
  }
  const coordinator = createChatCoordinator(dependencies)
  const eventHandler = createGlobalRealtimeEventHandler({
    currentUserId: OWNER, getMatchDeduplicationState: () => ({ handledMatchIds: new Set(), reconcilingMatchIds: new Set() }),
    normalizeRoomInviteRecord: () => { throw new Error("Unexpected invite") }, upsertRoomInvite() {},
    applyChatThreadListed: store.applyChatThreadListed, applyChatThreadCreated: store.applyChatThreadCreated,
    applyChatMessageListed: store.applyChatMessageListed, applyChatMessageReceived: store.applyChatMessageReceived,
    applyChatReceiptUpdated: store.applyChatReceiptUpdated,
    acknowledgeDelivery: batcher.note, openReadyMiniRoom() {}, onConnectionMatched() {}
  })
  const seed = () => {
    const thread: ChatThread = { threadId: THREAD, miniRoomId: "synthetic-instant-room",
      participantUserIds: [actor.profile.userId, PEER], participants: [{ userId: actor.profile.userId }, { userId: PEER }],
      createdAt: "2026-10-03T00:00:00Z" }
    store.applyChatThreadListed({ userId: actor.profile.userId, threads: [thread] })
    store.applyChatMessageListed({ userId: actor.profile.userId, threadId: THREAD, messages: [] })
  }
  type View = { snapshot: Store.ChatThreadSnapshot; handleSend: (draft: string) => boolean; handleRetry: (messageId: string) => void }
  const current = () => runtime.output as View
  seed()
  runtime.render(() => {
    const snapshot = store.useChatThreadStore(THREAD)
    const handlers = sending.useChatMessageSending({ ...snapshot, resolvedThreadId: THREAD, currentUserId: actor.profile.userId,
      sessionMode: "production",
      sendChatMessage: (threadId, body, clientMessageId) => {
        const operation = coordinator.sendChatMessage(threadId, body, clientMessageId)
        operations.push(operation)
        return operation
      }, requestMessages: coordinator.requestMessages })
    return { snapshot, ...handlers }
  })
  const receive = (message: ChatMessage) => eventHandler({ type: "chat.message_received", payload: message })
  const canonical = (index: number, body: string, senderUserId = actor.profile.userId): ChatMessage => ({
    messageId: `synthetic-canonical-${index}`, threadId: THREAD, senderUserId, body,
    sentAt: new Date(Date.now() + index).toISOString()
  })
  const switchAccount = () => { actor = actorFor("synthetic-next-owner"); store.resetChatStore(); seed(); runtime.rerender() }
  const dispose = () => { runtime.unmount(); batcher.dispose(); store.resetChatStore() }
  return { runtime, store, coordinator, current, requests, operations, scheduled, deliveryAcks, warnings, receive, canonical,
    switchAccount, dispose, event: (event: ServerEvent) => eventHandler(event) }
}

test("an optimistic row is visible before HTTP begins and partner realtime is visible before a delivery ACK timer", async () => {
  const f = mount()
  try {
    assert.equal(f.current().handleSend("Synthetic outgoing"), true)
    assert.equal(f.requests[0]?.pendingShown, true, "the send callback observes the already published local row")
    assert.equal(f.current().snapshot.messages.length, 1)
    const incoming = f.canonical(2, "Synthetic incoming", PEER)
    f.receive(incoming)
    assert.ok(f.current().snapshot.messages.some((message) => message.messageId === incoming.messageId), "the actual event handler publishes before returning")
    assert.deepEqual(f.deliveryAcks, [], "message presentation never waits for delivery receipt batching")
    assert.equal(f.scheduled.size, 1)
    f.requests[0]!.resolve(f.canonical(1, "Synthetic outgoing"))
    await f.operations[0]
    assert.equal(f.current().snapshot.messages.length, 2)
  } finally { f.dispose() }
})

for (const order of ["http-first", "realtime-first"] as const) {
  test(`${order}: HTTP and realtime acknowledgements leave one canonical row with its original render key`, async () => {
    const f = mount()
    try {
      f.current().handleSend("Synthetic ordered send")
      const local = f.current().snapshot.messages[0]!
      const committed = f.canonical(1, "Synthetic ordered send")
      if (order === "realtime-first") f.receive(committed)
      f.requests[0]!.resolve(committed)
      await f.operations[0]
      if (order === "http-first") f.receive(committed)
      assert.equal(f.current().snapshot.messages.length, 1)
      assert.equal(f.current().snapshot.messages[0]?.messageId, committed.messageId)
      assert.equal(f.store.getMessageRenderKey(committed.messageId), local.messageId)
      assert.equal(f.store.getRetryableMessage(local.messageId), null)
      assert.deepEqual(f.warnings, [])
    } finally { f.dispose() }
  })
}

test("rapid identical sends stay instantly visible while duplicate acknowledgements cannot settle the wrong tap", async () => {
  const f = mount()
  try {
    f.current().handleSend("Synthetic identical text")
    f.current().handleSend("Synthetic identical text")
    assert.equal(f.current().snapshot.messages.length, 2, "the queued HTTP send still has its optimistic row now")
    const secondLocal = f.current().snapshot.messages[1]!
    const first = f.canonical(1, "Synthetic identical text")
    f.receive(first)
    f.requests[0]!.resolve(first)
    await f.operations[0]
    await Promise.resolve()
    f.receive(first)
    assert.equal(f.store.getMessageDeliveryState(secondLocal.messageId), "sending")
    assert.ok(f.store.getRetryableMessage(secondLocal.messageId))
    const second = f.canonical(2, "Synthetic identical text")
    f.requests[1]!.resolve(second)
    await f.operations[1]
    f.receive(second)
    assert.deepEqual(f.current().snapshot.messages.map((message) => message.messageId), [first.messageId, second.messageId])
  } finally { f.dispose() }
})

test("a realtime-confirmed row survives an HTTP timeout without false failed UI, and the queued send still starts", async () => {
  const f = mount()
  try {
    f.current().handleSend("Synthetic committed before timeout")
    const local = f.current().snapshot.messages[0]!
    f.receive(f.canonical(1, "Synthetic committed before timeout"))
    f.current().handleSend("Synthetic queued next")
    const rejected = assert.rejects(f.operations[0]!, /Synthetic timeout/)
    f.requests[0]!.reject(new Error("Synthetic timeout"))
    await rejected
    await Promise.resolve()
    assert.equal(f.store.getRetryableMessage(local.messageId), null)
    assert.deepEqual(f.warnings, [], "no untrue message-not-sent warning for a row already settled by server realtime")
    assert.equal(f.requests[1]?.body, "Synthetic queued next")
    f.requests[1]!.resolve(f.canonical(2, "Synthetic queued next"))
    await f.operations[1]
    assert.equal(f.current().snapshot.messages.length, 2)
  } finally { f.dispose() }
})

test("failure and retry update the shown row immediately, preserve its key and retain the server idempotency key", async () => {
  const f = mount()
  try {
    f.current().handleSend("Synthetic retry")
    const local = f.current().snapshot.messages[0]!
    const clientMessageId = f.requests[0]!.clientMessageId
    const rejected = assert.rejects(f.operations[0]!, /Synthetic offline/)
    f.requests[0]!.reject(new Error("Synthetic offline"))
    await rejected
    assert.equal(f.store.getMessageDeliveryState(local.messageId), "failed")
    const failed = f.current().snapshot
    f.current().handleRetry(local.messageId)
    assert.equal(f.store.getMessageDeliveryState(local.messageId), "sending")
    assert.notEqual(f.current().snapshot.deliveryKey, failed.deliveryKey)
    assert.equal(f.requests[1]?.clientMessageId, clientMessageId)
    const committed = f.canonical(1, "Synthetic retry")
    f.requests[1]!.resolve(committed)
    await f.operations[1]
    assert.equal(f.store.getMessageRenderKey(committed.messageId), local.messageId)
    assert.equal(f.current().snapshot.messages.length, 1)
  } finally { f.dispose() }
})

test("late previous-account ACKs and queued sends cannot enter the next account's timeline", async () => {
  const f = mount()
  try {
    f.current().handleSend("Synthetic old in flight")
    f.current().handleSend("Synthetic old queued")
    f.switchAccount()
    f.current().handleSend("Synthetic next owner")
    assert.equal(f.requests[1]?.body, "Synthetic next owner", "the new account's send does not wait on the previous account's queue")
    f.requests[0]!.resolve(f.canonical(1, "Synthetic old in flight", OWNER))
    await Promise.all(f.operations.slice(0, 2))
    assert.deepEqual(f.current().snapshot.messages.map((message) => message.body), ["Synthetic next owner"])
    f.requests[1]!.resolve(f.canonical(2, "Synthetic next owner"))
    await f.operations[2]
    assert.equal(f.current().snapshot.messages.length, 1)
    assert.deepEqual(f.warnings, [])
  } finally { f.dispose() }
})

test("receipt and delivery changes in another conversation leave the selected timeline idle", () => {
  const f = mount()
  try {
    const first = f.current().snapshot
    const renders = f.runtime.renderCount
    const pending = f.store.addOptimisticMessage({ threadId: "synthetic-other-thread", senderUserId: OWNER,
      body: "Synthetic elsewhere", clientMessageId: "synthetic-other-send" })
    f.store.markOptimisticMessageFailed(pending.clientMessageId)
    f.store.markOptimisticMessageSending(pending.clientMessageId)
    f.event({ type: "chat.receipt_updated", payload: { threadId: "synthetic-other-thread", userId: PEER,
      participantUserIds: [OWNER, PEER], readUpTo: { messageId: "synthetic-other-cursor", sentAt: "2026-10-03T00:00:00Z" } } })
    assert.equal(f.runtime.renderCount, renders)
    assert.equal(f.current().snapshot, first)
  } finally { f.dispose() }
})
