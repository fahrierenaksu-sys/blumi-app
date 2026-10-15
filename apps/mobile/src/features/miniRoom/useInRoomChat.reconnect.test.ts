import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"
import type { ChatMessage, ChatThread, ServerEvent } from "@blumi/contracts"
import {
  findLastCanonicalRoomChatMessage,
  findCanonicalRoomChatThread,
  findMissedCanonicalRoomChatMessages,
  shouldRenderIncomingRoomChatMessage
} from "./inRoomChatThread"
import { createRoomEntryReplayGate, advanceRoomEntryReplayGate } from "./roomEntryReplayGate"
import { createReconnectTransitionTracker, type RealtimeConnectionStatus } from "@blumi/realtime-client"
import { ROOM_CHAT_HISTORY_LIMIT } from "./roomChatHistoryModel"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as ChatStore from "../chat/chatStore"
import type * as InRoomChatHook from "./useInRoomChat"
import { createGlobalRealtimeEventHandler } from "../realtime/globalRealtimeEventHandler"
import { normalizeOutgoingChatBody } from "../chat/thread/chatThreadModel"

const localUserId = "room-owner"
const partnerUserId = "room-partner"
const threadId = "source-thread"

function message(
  messageId: string,
  senderUserId: string,
  body: string,
  sentAt: string
): ChatMessage {
  return { messageId, threadId, senderUserId, body, sentAt }
}

function createHookFixture(options: {
  withoutThread?: boolean
  cachedHistory?: ChatMessage[]
  threadLastMessage?: ChatMessage
  initialListStatus?: "idle" | "loading" | "ready" | "failed"
  rejectHistoryRequest?: boolean
  deferHistoryFailure?: boolean
} = {}) {
  const sourceFile = resolve(
    process.cwd().endsWith("apps/mobile") ? "src" : "apps/mobile/src",
    "features/miniRoom/useInRoomChat.ts"
  )
  const source = ts.transpileModule(readFileSync(sourceFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  type Slot = { value?: any; deps?: readonly unknown[]; cleanup?: () => void }
  const slots: Slot[] = []
  let index = 0
  let dirty = false
  let mounted = true
  let output: any
  let realtimeStatus: RealtimeConnectionStatus = "connected"
  let listStatus: "idle" | "loading" | "ready" | "failed" = options.initialListStatus ??
    (options.cachedHistory === undefined ? "idle" : "ready")
  let listCompletionVersion = 0
  let historyReady = options.cachedHistory !== undefined
  let messages: ChatMessage[] = options.cachedHistory ?? []
  let latestHistoryMessageIds = options.cachedHistory?.map((entry) => entry.messageId)
  let eventHandler: ((event: any) => void) | undefined
  const statusListeners = new Set<(status: RealtimeConnectionStatus) => void>()
  const sends: unknown[] = []
  const requests: { threadId: string; options?: { before?: string; limit?: number } }[] = []
  const optimistic: unknown[] = []
  const failed: string[] = []
  const markedSending: string[] = []
  const confirmed: { clientMessageId: string; messageId: string }[] = []
  const timers: { run: () => void; delay: number; cleared: boolean }[] = []
  let sendAccepted = true
  let rejectHistory: (() => void) | undefined
  const thread: ChatThread = {
    threadId,
    miniRoomId: "mini-room",
    participantUserIds: [localUserId, partnerUserId],
    participants: [
      { userId: localUserId, displayName: "You" },
      { userId: partnerUserId, displayName: "Partner" }
    ],
    createdAt: "2026-07-21T12:00:00.000Z",
    ...(options.threadLastMessage ? { lastMessage: options.threadLastMessage } : {})
  }
  let selectedThread = thread
  const sameDeps = (left?: readonly unknown[], right?: readonly unknown[]) =>
    Boolean(left && right && left.length === right.length && left.every((entry, i) => Object.is(entry, right[i])))
  const slot = () => slots[index++] ?? (slots[index - 1] = {})
  const react = {
    useState: (initial: any) => {
      const current = slot()
      if (!("value" in current)) current.value = typeof initial === "function" ? initial() : initial
      return [current.value, (next: any) => {
        const value = typeof next === "function" ? next(current.value) : next
        if (!Object.is(value, current.value)) { current.value = value; dirty = true }
      }]
    },
    useRef: (initial: any) => { const current = slot(); return current.value ??= { current: initial } },
    useMemo: (work: () => any, deps: readonly unknown[]) => {
      const current = slot()
      if (!sameDeps(current.deps, deps)) { current.value = work(); current.deps = deps }
      return current.value
    },
    useCallback: (callback: any, deps: readonly unknown[]) => {
      const current = slot()
      if (!sameDeps(current.deps, deps)) { current.value = callback; current.deps = deps }
      return current.value
    },
    useEffect: (run: () => void | (() => void), deps: readonly unknown[]) => {
      const current = slot()
      if (!sameDeps(current.deps, deps)) {
        current.deps = deps
        effects.push({ slot: current, run })
      }
    }
  }
  const effects: { slot: Slot; run: () => void | (() => void) }[] = []
  const send = (event: unknown) => { sends.push(event); return sendAccepted }
  let effectRuns = 0
  const getMessageListState = (requestedThreadId: string) => ({
    status: requestedThreadId === threadId ? listStatus : "idle"
  })
  const applyLoading = (requestedThreadId: string) => {
    if (requestedThreadId !== threadId) return
    listStatus = "loading"
    dirty = true
  }
  const getMessageListCompletionVersion = (requestedThreadId: string) =>
    requestedThreadId === threadId ? listCompletionVersion : 0
  const addOptimisticMessage = (entry: unknown) => { optimistic.push(entry) }
  const requestMessages = (requestedThreadId: string, requestOptions?: { before?: string; limit?: number }) => {
    requests.push({ threadId: requestedThreadId, options: requestOptions })
    if (options.deferHistoryFailure) {
      return new Promise<void>((_resolve, reject) => {
        rejectHistory = () => {
          listStatus = "failed"
          listCompletionVersion += 1
          dirty = true
          reject(new Error("History fetch failed"))
        }
      })
    }
    if (options.rejectHistoryRequest) {
      listStatus = "failed"
      listCompletionVersion += 1
      dirty = true
      return Promise.reject(new Error("History fetch failed"))
    }
    return Promise.resolve()
  }
  const modules: Record<string, unknown> = {
    react,
    "../chat/chatStore": {
      applyChatMessageListLoading: applyLoading,
      getMessageListCompletionVersion,
      markOptimisticMessageFailed: (clientMessageId: string) => { failed.push(clientMessageId) },
      markOptimisticMessageSending: (clientMessageId: string) => { markedSending.push(clientMessageId) },
      confirmOptimisticMessage: (clientMessageId: string, chatMessage: ChatMessage) => {
        confirmed.push({ clientMessageId, messageId: chatMessage.messageId })
      },
      useChatThreadStore: () => ({
        thread: options.withoutThread ? undefined : selectedThread,
        messages: messages,
        messageListState: selectedThread.threadId === threadId ? getMessageListState(threadId) : { status: "ready" },
        historyReady,
        latestHistoryMessageIds,
        deliveryKey: "0",
        partnerReceipts: undefined,
        addOptimisticMessage,
        getMessageDeliveryState: () => "sent",
        getRetryableMessage: () => null,
        markOptimisticMessageSending: () => undefined,
        setActiveThread: () => undefined
      })
    },
    "../realtime/globalRealtimeProvider": {
      getGlobalStatus: () => realtimeStatus,
      subscribeToStatus: (listener: (status: RealtimeConnectionStatus) => void) => {
        statusListeners.add(listener)
        return () => statusListeners.delete(listener)
      },
      // Like production, `send` keeps its identity across renders.
      useGlobalRealtime: () => ({ connectionStatus: realtimeStatus, send }),
      useGlobalRealtimeEvents: (listener: (event: any) => void) => { eventHandler = listener }
    },
    "@blumi/realtime-client": { createReconnectTransitionTracker },
    // Same contract as chatThreadModel.normalizeOutgoingChatBody (tested there).
    "../chat/thread/chatThreadModel": {
      normalizeOutgoingChatBody: (body: string) => body.trim().replace(/\s+/g, " ")
    },
    "./inRoomChatThread": {
      findLastCanonicalRoomChatMessage,
      findCanonicalRoomChatThread,
      findMissedCanonicalRoomChatMessages,
      shouldRenderIncomingRoomChatMessage
    },
    "./roomChatHistoryModel": { ROOM_CHAT_HISTORY_LIMIT },
    "./roomEntryReplayGate": { createRoomEntryReplayGate, advanceRoomEntryReplayGate }
  }
  const module = { exports: {} as any }
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`)
      return modules[name]
    },
    Date,
    Set,
    Map,
    Math,
    setTimeout: (run: () => void, delay: number) => {
      const timer = { run, delay, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimeout: (timer: { cleared: boolean } | undefined) => { if (timer) timer.cleared = true }
  })

  function render() {
    if (!mounted) return
    dirty = false
    index = 0
    output = module.exports.useInRoomChat({
      miniRoomId: "mini-room",
      sourceThreadId: selectedThread.threadId,
      localUserId,
      partnerUserId,
      requestMessages
    })
    const pendingEffects = effects.splice(0)
    for (const effect of pendingEffects) effect.slot.cleanup?.()
    for (const effect of pendingEffects) effect.slot.cleanup = effect.run() || undefined
    effectRuns += pendingEffects.length
  }

  async function settle() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise))
      if (dirty && mounted) render()
    }
  }

  render()
  return {
    settle,
    rerender: render,
    effectRuns: () => effectRuns,
    sends,
    requests,
    optimistic,
    failed,
    markedSending,
    confirmed,
    runTimers: () => {
      for (const timer of timers.splice(0)) if (!timer.cleared) timer.run()
      dirty = true
    },
    emitEvent: (event: unknown) => { eventHandler?.(event) },
    setSendAccepted: (accepted: boolean) => { sendAccepted = accepted },
    rejectHistory: () => rejectHistory?.(),
    switchThread: (nextThreadId: string) => {
      selectedThread = { ...thread, threadId: nextThreadId }
      messages = []
      historyReady = true
      latestHistoryMessageIds = []
      dirty = true
    },
    output: () => output as {
      newMessages: { messageId: string }[]
      sendRoomMessage: (body: string, retryClientMessageId?: string) => boolean
      failedRoomMessage: { clientMessageId: string; body: string } | null
      failedRoomMessages: readonly { clientMessageId: string; body: string }[]
      consume: (messageId: string) => void
      consumeMany: (messageIds: readonly string[]) => void
    },
    emitStatus: (status: RealtimeConnectionStatus) => {
      realtimeStatus = status
      for (const listener of [...statusListeners]) listener(status)
      dirty = true
    },
    emitMessage: (chatMessage: ChatMessage) => {
      eventHandler?.({ type: "chat.message_received", payload: chatMessage })
    },
    applyHistory: (nextMessages: ChatMessage[], status: "loading" | "ready") => {
      messages = nextMessages
      listStatus = status
      if (status === "ready") {
        listCompletionVersion += 1
        historyReady = true
        latestHistoryMessageIds = nextMessages.map((entry) => entry.messageId)
      }
      dirty = true
    },
    applyFastReadyHistory: (nextMessages: ChatMessage[]) => {
      // Simulates the coordinator starting and completing a refresh before
      // React commits the intermediate loading snapshot.
      listStatus = "loading"
      listStatus = "ready"
      listCompletionVersion += 1
      historyReady = true
      messages = nextMessages
      latestHistoryMessageIds = nextMessages.map((entry) => entry.messageId)
      dirty = true
    },
    unmount: () => {
      mounted = false
      for (const current of slots) current.cleanup?.()
    }
  }
}

test("MiniRoom replays one entry message, then reconciles reconnect history without echo duplicates", async () => {
  const f = createHookFixture()
  await f.settle()
  assert.equal(f.requests.length, 1, "room entry asks the chat coordinator for history once")
  assert.deepEqual(plain(f.requests), [{ threadId, options: { limit: ROOM_CHAT_HISTORY_LIMIT } }])
  assert.equal(f.sends.length, 0, "history uses HTTP instead of the realtime endpoint's 50-message default")

  const buffered = message("buffered-at-entry", partnerUserId, "Buffered during entry", new Date(Date.now() + 500).toISOString())
  f.emitMessage(buffered)
  await f.settle()
  const entryLatest = message("entry-latest", partnerUserId, "Latest at entry", new Date(Date.now() - 60_000).toISOString())
  f.applyHistory([
    message("entry-older", partnerUserId, "Older at entry", new Date(Date.now() - 61_000).toISOString()),
    entryLatest,
    buffered
  ], "ready")
  await f.settle()
  assert.equal(f.output().newMessages.map((entry) => entry.messageId).join("|"), "entry-latest|buffered-at-entry")

  const liveDuringReconnect = message("live-during-reconnect", partnerUserId, "Delivered live", new Date(Date.now() + 1000).toISOString())
  f.emitStatus("reconnecting")
  f.emitMessage(liveDuringReconnect)
  f.emitStatus("connected")
  f.applyHistory([], "loading")
  await f.settle()

  f.applyHistory([
    message("entry-older", partnerUserId, "Older at entry", new Date(Date.now() - 61_000).toISOString()),
    entryLatest,
    buffered,
    liveDuringReconnect,
    message("missed-one", partnerUserId, "Missed while offline", new Date(Date.now() + 1500).toISOString()),
    message("__local_optimistic", partnerUserId, "Local echo", new Date(Date.now() + 1600).toISOString()),
    message("own-canonical", localUserId, "My own message", new Date(Date.now() + 1700).toISOString()),
    message("missed-two", partnerUserId, "Also missed", new Date(Date.now() + 1800).toISOString())
  ], "ready")
  await f.settle()

  assert.equal(
    f.output().newMessages.map((entry) => entry.messageId).join("|"),
    "entry-latest|buffered-at-entry|live-during-reconnect|missed-one|missed-two"
  )
  assert.equal(f.requests.length, 1, "the hook must not duplicate the root reconnect history fetch")

  f.emitStatus("disconnected")
  f.emitStatus("connected")
  f.applyHistory([], "loading")
  await f.settle()
  f.applyHistory([
    entryLatest,
    buffered,
    liveDuringReconnect,
    message("missed-one", partnerUserId, "Missed while offline", new Date(Date.now() + 1500).toISOString()),
    message("missed-two", partnerUserId, "Also missed", new Date(Date.now() + 1800).toISOString())
  ], "ready")
  await f.settle()
  assert.equal(f.output().newMessages.length, 5, "a repeated canonical snapshot must not replay any bubble twice")
  f.unmount()
})

test("MiniRoom reuses a cached latest history page and still replays its newest entry message", async () => {
  const latest = message("cached-latest", partnerUserId, "Recent in chat", new Date(Date.now() - 100).toISOString())
  const f = createHookFixture({ cachedHistory: [latest], threadLastMessage: latest })
  await f.settle()

  assert.equal(f.requests.length, 0, "a server-confirmed recent snapshot avoids a duplicate history request")
  assert.equal(f.output().newMessages.map((entry) => entry.messageId).join("|"), "cached-latest")
  f.unmount()
})

test("MiniRoom reuses a server-confirmed empty latest page", async () => {
  const f = createHookFixture({ cachedHistory: [] })
  await f.settle()

  assert.equal(f.requests.length, 0, "a confirmed empty page is a current snapshot too")
  assert.equal(f.output().newMessages.length, 0)
  f.unmount()
})

test("MiniRoom refreshes a cached page when it trails the thread's latest-message summary", async () => {
  const cached = message("cached-old", partnerUserId, "Older cached message", new Date(Date.now() - 60_000).toISOString())
  const summary = message("server-latest", partnerUserId, "Newer server message", new Date(Date.now() - 5_000).toISOString())
  const f = createHookFixture({ cachedHistory: [cached], threadLastMessage: summary })
  await f.settle()

  assert.equal(f.requests.length, 1, "a latest-page marker cannot hide a gap against the thread summary")
  assert.deepEqual(plain(f.requests), [{ threadId, options: { limit: ROOM_CHAT_HISTORY_LIMIT } }])
  f.unmount()
})

test("MiniRoom does not treat loading or failed history as a ready snapshot", async () => {
  const cached = message("cached", partnerUserId, "Cached message", new Date(Date.now() - 60_000).toISOString())
  for (const status of ["loading", "failed"] as const) {
    const f = createHookFixture({
      cachedHistory: [cached],
      threadLastMessage: cached,
      initialListStatus: status
    })
    await f.settle()
    assert.equal(f.requests.length, 1, `a ${status} history state must request a current snapshot`)
    assert.deepEqual(plain(f.requests), [{ threadId, options: { limit: ROOM_CHAT_HISTORY_LIMIT } }])
    f.unmount()
  }
})

test("a failed coordinator history request is swallowed after the coordinator marks the list failed", async () => {
  const f = createHookFixture({ rejectHistoryRequest: true })
  await assert.doesNotReject(f.settle())

  assert.equal(f.requests.length, 1)
  assert.deepEqual(plain(f.requests), [{ threadId, options: { limit: ROOM_CHAT_HISTORY_LIMIT } }])
  f.unmount()
})

test("MiniRoom reconciles reconnect history when loading and ready are batched into one render", async () => {
  const f = createHookFixture()
  await f.settle()
  const entry = message("entry-before-fast-reconnect", partnerUserId, "Entry", new Date(Date.now() - 60_000).toISOString())
  f.applyHistory([entry], "ready")
  await f.settle()

  f.emitStatus("reconnecting")
  f.emitStatus("connected")
  const missed = message("missed-fast-refresh", partnerUserId, "Recovered quickly", new Date(Date.now() + 500).toISOString())
  f.applyFastReadyHistory([entry, missed])
  await f.settle()

  assert.equal(f.output().newMessages.map((event) => event.messageId).join("|"), "entry-before-fast-reconnect|missed-fast-refresh")
  f.unmount()
})

test("a room message the socket refused is reported unsent and leaves no endless sending bubble", async () => {
  const f = createHookFixture()
  await f.settle()
  const historyRequests = f.sends.length
  // React still says "connected" but the socket has just closed.
  f.setSendAccepted(false)
  assert.equal(f.output().sendRoomMessage("  lost in the gap  "), false)
  assert.deepEqual(f.optimistic, [], "no optimistic bubble for a frame that was never sent")

  f.setSendAccepted(true)
  assert.equal(f.output().sendRoomMessage("  delivered  "), true)
  assert.equal(f.optimistic.length, 1)
  assert.deepEqual(f.sends.slice(historyRequests).map((event) => (event as { payload: { body: string } }).payload.body), [
    "lost in the gap",
    "delivered"
  ])
  f.unmount()
})

/** Objects built inside the vm realm have foreign prototypes; compare their data. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown
}

function lastSendPayload(f: ReturnType<typeof createHookFixture>) {
  return (f.sends.at(-1) as { payload: { body: string; clientMessageId?: string } }).payload
}

test("an in-room send carries a client id and stays sending until its acknowledgement", async () => {
  const f = createHookFixture()
  await f.settle()
  assert.equal(f.output().sendRoomMessage("hello room"), true)
  const { clientMessageId } = lastSendPayload(f)
  assert.match(clientMessageId ?? "", /^room_[A-Za-z0-9_-]{8,}$/)
  assert.deepEqual(plain(f.optimistic), [{ threadId, senderUserId: localUserId, body: "hello room", clientMessageId, trackDelivery: true }])
  f.emitEvent({ type: "chat.message_received", payload: { ...message("m-ack", localUserId, "hello room", new Date().toISOString()), clientMessageId } })
  assert.deepEqual(f.confirmed, [{ clientMessageId, messageId: "m-ack" }])
  f.runTimers()
  f.emitStatus("reconnecting")
  await f.settle()
  assert.deepEqual(f.failed, [], "an acknowledged message is never marked failed")
  f.unmount()
})

test("a socket close marks in-flight room messages failed and the retry reuses the same client id", async () => {
  const f = createHookFixture()
  await f.settle()
  f.output().sendRoomMessage("brb")
  const { clientMessageId } = lastSendPayload(f)
  f.emitStatus("reconnecting")
  await f.settle()
  assert.deepEqual(f.failed, [clientMessageId])
  assert.deepEqual(plain(f.output().failedRoomMessage), { clientMessageId, body: "brb" })
  f.emitStatus("connected")
  await f.settle()
  assert.equal(f.output().sendRoomMessage(" brb ", clientMessageId), true)
  assert.equal(lastSendPayload(f).clientMessageId, clientMessageId, "retry keeps the id so the server deduplicates")
  assert.deepEqual(f.markedSending, [clientMessageId])
  assert.equal(f.optimistic.length, 1, "the failed bubble is reused, not duplicated")
  await f.settle()
  assert.equal(f.output().failedRoomMessage, null)
  // A different text is a new message with a new id.
  f.output().sendRoomMessage("something else")
  assert.notEqual(lastSendPayload(f).clientMessageId, clientMessageId)
  f.unmount()
})

test("a missing acknowledgement times out as failed, and a server refusal fails only its own message", async () => {
  const f = createHookFixture()
  await f.settle()
  f.output().sendRoomMessage("first")
  const first = lastSendPayload(f).clientMessageId
  f.output().sendRoomMessage("second")
  const second = lastSendPayload(f).clientMessageId
  f.emitEvent({
    type: "realtime.error",
    payload: { code: "CHAT_MESSAGE_NOT_SENT", requestType: "chat.send_message", message: "Not sent", clientMessageId: second }
  })
  assert.deepEqual(f.failed, [second])
  f.runTimers()
  assert.deepEqual(f.failed, [second, first], "the unacknowledged message fails after the timeout")
  // A late acknowledgement still settles the bubble as sent.
  f.emitEvent({ type: "chat.message_received", payload: { ...message("m-late", localUserId, "first", new Date().toISOString()), clientMessageId: first } })
  assert.deepEqual(f.confirmed.map((entry) => entry.clientMessageId), [first])
  f.unmount()
})

test("re-rendering without a room thread re-runs no effects", () => {
  const f = createHookFixture({ withoutThread: true })
  assert.equal(f.output().newMessages.length, 0)
  const runs = f.effectRuns()
  f.rerender()
  f.rerender()
  assert.equal(f.effectRuns(), runs, "the thread-less message list must keep its identity")
})

test("failed entry history drains buffered live messages once and keeps new live messages flowing", async () => {
  const f = createHookFixture({ deferHistoryFailure: true })
  await f.settle()
  const before = message("live-before-failure", partnerUserId, "Before", new Date().toISOString())
  f.emitMessage(before)
  await f.settle()
  assert.equal(f.output().newMessages.length, 0)
  f.rejectHistory()
  await f.settle()
  assert.equal(f.output().newMessages.map((entry) => entry.messageId).join("|"), before.messageId)
  f.emitMessage(before)
  f.emitMessage(message("live-after-failure", partnerUserId, "After", new Date().toISOString()))
  await f.settle()
  assert.equal(f.output().newMessages.length, 2)
  f.applyFastReadyHistory([
    message("old-history", partnerUserId, "Old", new Date(Date.now() - 60_000).toISOString()), before
  ])
  await f.settle()
  assert.equal(f.output().newMessages.length, 2, "late history cannot replay an old entry bubble")
  f.emitStatus("reconnecting")
  f.emitStatus("connected")
  f.applyFastReadyHistory([
    message("old-history", partnerUserId, "Old", new Date(Date.now() - 60_000).toISOString()), before,
    message("missed-after-late-ready", partnerUserId, "Missed", new Date(Date.now() + 1000).toISOString())
  ])
  await f.settle()
  assert.equal(f.output().newMessages.map((entry) => entry.messageId).join("|"), "live-before-failure|live-after-failure|missed-after-late-ready")
  f.unmount()
})

test("server timestamps behind the device clock do not discard live or reconnect messages", async () => {
  const entry = message("clock-entry", partnerUserId, "Entry", new Date(Date.now() - 86_400_000).toISOString())
  const f = createHookFixture({ cachedHistory: [entry], threadLastMessage: entry })
  await f.settle()
  const live = message("clock-live", partnerUserId, "Live", new Date(Date.parse(entry.sentAt) + 1000).toISOString())
  f.emitMessage(live)
  await f.settle()
  f.emitStatus("reconnecting")
  f.emitStatus("connected")
  const missed = message("clock-missed", partnerUserId, "Missed", new Date(Date.parse(entry.sentAt) + 2000).toISOString())
  f.applyFastReadyHistory([
    message("clock-older", partnerUserId, "Older", new Date(Date.parse(entry.sentAt) - 60_000).toISOString()),
    entry, live, missed
  ])
  await f.settle()
  assert.equal(f.output().newMessages.map((entry) => entry.messageId).join("|"), "clock-entry|clock-live|clock-missed")
  f.unmount()
})

test("independent failed sends retain exact retry identities and late ACKs settle only their own failure", async () => {
  const f = createHookFixture()
  await f.settle()
  f.output().sendRoomMessage("first")
  const first = lastSendPayload(f).clientMessageId!
  f.emitEvent({ type: "realtime.error", payload: { code: "CHAT_MESSAGE_NOT_SENT", clientMessageId: first } })
  await f.settle()
  const restored = f.output().failedRoomMessage!
  f.output().sendRoomMessage("second")
  const second = lastSendPayload(f).clientMessageId!
  f.emitEvent({ type: "realtime.error", payload: { code: "CHAT_MESSAGE_NOT_SENT", clientMessageId: second } })
  await f.settle()
  assert.equal(f.output().failedRoomMessages.map((entry) => entry.clientMessageId).join("|"), `${first}|${second}`)
  assert.equal(f.output().failedRoomMessage?.clientMessageId, restored.clientMessageId)
  assert.equal(f.output().sendRoomMessage(restored.body, restored.clientMessageId), true)
  assert.equal(lastSendPayload(f).clientMessageId, first)
  await f.settle()
  assert.equal(f.output().failedRoomMessage?.clientMessageId, second)
  f.emitEvent({ type: "chat.message_received", payload: { ...message("second-ack", localUserId, "second", new Date().toISOString()), clientMessageId: second } })
  await f.settle()
  assert.equal(f.output().failedRoomMessages.length, 0)
  const sentCount = f.sends.length
  assert.equal(f.output().sendRoomMessage("second", second), false, "a stale restored draft cannot create a duplicate after its late ACK")
  assert.equal(f.sends.length, sentCount)
  f.unmount()
})

test("retry identity is explicit even for equal bodies and cannot send an edited body under an old identity", async () => {
  const f = createHookFixture()
  await f.settle()
  f.output().sendRoomMessage("same")
  const first = lastSendPayload(f).clientMessageId!
  f.output().sendRoomMessage("same")
  const second = lastSendPayload(f).clientMessageId!
  f.emitStatus("reconnecting")
  f.emitStatus("connected")
  await f.settle()
  assert.equal(f.output().failedRoomMessages.length, 2)
  assert.equal(f.output().sendRoomMessage("edited", first), false)
  assert.equal(f.output().sendRoomMessage("same", first), true)
  assert.equal(lastSendPayload(f).clientMessageId, first)
  assert.equal(f.output().sendRoomMessage("same", second), true)
  assert.equal(lastSendPayload(f).clientMessageId, second)
  assert.equal(f.optimistic.length, 2, "both retries reuse their original optimistic messages")
  f.unmount()
})

test("batch consumption removes only the supplied live message identities and single consume stays compatible", async () => {
  const f = createHookFixture({ cachedHistory: [] })
  await f.settle()
  for (const id of ["burst-one", "burst-two", "burst-three"]) {
    f.emitMessage(message(id, partnerUserId, "Burst", new Date().toISOString()))
  }
  await f.settle()
  f.output().consumeMany(["burst-one", "burst-three", "unknown"])
  await f.settle()
  assert.equal(f.output().newMessages.map((entry) => entry.messageId).join("|"), "burst-two")
  f.output().consume("burst-two")
  await f.settle()
  assert.equal(f.output().newMessages.length, 0)
  f.unmount()
})

test("an edited restored draft is a new send and does not discard its original retryable failure", async () => {
  const f = createHookFixture()
  await f.settle()
  f.output().sendRoomMessage("original")
  const original = lastSendPayload(f).clientMessageId!
  f.emitEvent({ type: "realtime.error", payload: { code: "CHAT_MESSAGE_NOT_SENT", clientMessageId: original } })
  await f.settle()
  assert.equal(f.output().sendRoomMessage("edited"), true)
  assert.notEqual(lastSendPayload(f).clientMessageId, original)
  await f.settle()
  assert.equal(f.output().failedRoomMessage?.clientMessageId, original)
  assert.equal(f.output().sendRoomMessage("original", ""), false, "an explicitly invalid retry cannot turn into a fresh send")
  f.unmount()
})

test("entry replay uses canonical server ordering when all timestamps are ahead of the device clock", async () => {
  const start = Date.now() + 86_400_000
  const entry = message("ahead-entry", partnerUserId, "Entry", new Date(start).toISOString())
  const live = message("ahead-live", partnerUserId, "Live", new Date(start + 1000).toISOString())
  const f = createHookFixture()
  await f.settle()
  f.emitMessage(live)
  f.applyFastReadyHistory([entry, live])
  await f.settle()
  assert.equal(f.output().newMessages.map((entry) => entry.messageId).join("|"), "ahead-entry|ahead-live")
  f.emitMessage(live)
  await f.settle()
  assert.equal(f.output().newMessages.length, 2)
  f.unmount()
})

test("after failed entry without a server boundary, the first reconnect page establishes history without replaying old bubbles", async () => {
  const f = createHookFixture({ rejectHistoryRequest: true })
  await f.settle()
  f.emitStatus("reconnecting")
  f.emitStatus("connected")
  const old = message("first-page-old", partnerUserId, "History", new Date(Date.now() - 60_000).toISOString())
  const initial = message("first-page-latest", partnerUserId, "Latest", new Date().toISOString())
  f.applyFastReadyHistory([old, initial])
  await f.settle()
  assert.equal(f.output().newMessages.length, 0, "without an entry cursor history is not mistaken for live delivery")
  f.emitStatus("reconnecting")
  f.emitStatus("connected")
  const missed = message("next-page-missed", partnerUserId, "Offline", new Date(Date.parse(initial.sentAt) + 1000).toISOString())
  f.applyFastReadyHistory([old, initial, missed])
  await f.settle()
  assert.equal(f.output().newMessages.map((entry) => entry.messageId).join("|"), "next-page-missed")
  f.unmount()
})

test("an acknowledgement from another thread cannot settle a room's failed draft identity", async () => {
  const f = createHookFixture()
  await f.settle()
  f.output().sendRoomMessage("room draft")
  const clientMessageId = lastSendPayload(f).clientMessageId!
  f.runTimers()
  await f.settle()
  f.emitEvent({ type: "chat.message_received", payload: {
    ...message("wrong-thread-ack", localUserId, "room draft", new Date().toISOString()),
    threadId: "another-thread", clientMessageId
  } })
  await f.settle()
  assert.equal(f.output().failedRoomMessage?.clientMessageId, clientMessageId)
  assert.equal(f.confirmed.length, 0)
  f.unmount()
})

test("unchanged failures keep their public occurrence identity while a retry failure creates a new occurrence", async () => {
  const f = createHookFixture()
  await f.settle()
  f.output().sendRoomMessage("first")
  const first = lastSendPayload(f).clientMessageId!
  f.emitEvent({ type: "realtime.error", payload: { code: "CHAT_MESSAGE_NOT_SENT", clientMessageId: first } })
  await f.settle()
  const firstOccurrence = f.output().failedRoomMessage!
  f.output().sendRoomMessage("second")
  const second = lastSendPayload(f).clientMessageId!
  f.emitEvent({ type: "realtime.error", payload: { code: "CHAT_MESSAGE_NOT_SENT", clientMessageId: second } })
  await f.settle()
  assert.equal(f.output().failedRoomMessages[0], firstOccurrence,
    "an unrelated failure must not offer a restored/edited failure as a new occurrence")
  f.emitEvent({ type: "chat.message_received", payload: { ...message("occurrence-second-ack", localUserId, "second", new Date().toISOString()), clientMessageId: second } })
  await f.settle()
  assert.equal(f.output().failedRoomMessage, firstOccurrence, "an unrelated ACK keeps the failure occurrence stable")
  assert.equal(f.output().sendRoomMessage("first", first), true)
  await f.settle()
  assert.equal(f.output().failedRoomMessage, null)
  f.emitEvent({ type: "realtime.error", payload: { code: "CHAT_MESSAGE_NOT_SENT", clientMessageId: first } })
  await f.settle()
  assert.notEqual(f.output().failedRoomMessage, firstOccurrence, "a failed retry can be offered again as a new occurrence")
  assert.deepEqual(plain(f.output().failedRoomMessage), plain(firstOccurrence), "public shape retains only identity and body")
  f.unmount()
})

test("switching room conversations isolates drafts and retires only an exactly acknowledged old failure", async () => {
  const f = createHookFixture({ cachedHistory: [] })
  await f.settle()
  f.output().sendRoomMessage("Previous failed draft")
  const failedId = lastSendPayload(f).clientMessageId!
  f.emitEvent({ type: "realtime.error", payload: { code: "CHAT_MESSAGE_NOT_SENT", clientMessageId: failedId } })
  await f.settle()
  f.output().sendRoomMessage("Previous in-flight draft")
  const inFlightId = lastSendPayload(f).clientMessageId!
  const previousFailure = f.output().failedRoomMessage!
  f.switchThread("another-source-thread")
  f.rerender()
  assert.equal(f.output().failedRoomMessages.length, 0, "the first changed-thread render cannot expose a prior draft")
  await f.settle()
  assert.equal(f.output().failedRoomMessage, null, "old effect cleanup cannot publish a draft into the new thread")
  assert.equal(f.output().sendRoomMessage("Previous failed draft", failedId), false)
  f.output().sendRoomMessage("Current failed draft")
  const currentId = lastSendPayload(f).clientMessageId!
  f.emitEvent({ type: "realtime.error", payload: { code: "CHAT_MESSAGE_NOT_SENT", clientMessageId: currentId } })
  await f.settle()
  const currentFailure = f.output().failedRoomMessage!
  f.emitEvent({ type: "chat.message_received", payload: {
    ...message("late-old-thread", localUserId, "Previous in-flight draft", new Date().toISOString()),
    clientMessageId: inFlightId
  } })
  await f.settle()
  assert.equal(f.output().failedRoomMessage, currentFailure, "old ACK leaves the current failed draft occurrence unchanged")
  assert.equal(f.output().newMessages.length, 0, "old ACK does not appear as a current conversation bubble")
  f.switchThread(threadId)
  f.rerender()
  await f.settle()
  assert.equal(f.output().failedRoomMessages.map((entry) => entry.clientMessageId).join("|"), failedId,
    "returning preserves only unresolved identities after an exact late ACK")
  assert.equal(f.output().failedRoomMessage, previousFailure)
  f.unmount()
})

test("an ACK with a known identity and mismatched body cannot settle its timer or failed draft", async () => {
  const f = createHookFixture({ cachedHistory: [] })
  await f.settle()
  f.output().sendRoomMessage("Expected body")
  const clientMessageId = lastSendPayload(f).clientMessageId!
  const mismatched = { type: "chat.message_received", payload: {
    ...message("mismatched-ack", localUserId, "Different body", new Date().toISOString()), clientMessageId
  } }
  f.emitEvent(mismatched)
  f.runTimers()
  await f.settle()
  assert.deepEqual(f.failed, [clientMessageId], "a mismatched ACK cannot cancel the real pending message's timeout")
  const failed = f.output().failedRoomMessage!
  f.emitEvent(mismatched)
  await f.settle()
  assert.equal(f.output().failedRoomMessage, failed, "a mismatched ACK cannot delete the failure identity")
  assert.equal(f.confirmed.length, 0)
  f.unmount()
})

test("real global reducer before room ACK listener preserves identical sends, late ACKs and existing canonical keys", () => {
  const runtime = createFakeReactRuntime()
  const store = loadSourceWithFakeReact<typeof ChatStore>("features/chat/chatStore.ts", runtime, {
    real: ["./chatErrorCopy", "./chatReceiptModel", "./chatMessageRenderKeys", "./chatReadHere", "./chatPartnerReceiptsState", "./chatComposerDraftStore"]
  })
  const sends: Extract<ServerEvent, { type: "chat.message_received" }>["payload"][] = []
  let roomListener: ((event: ServerEvent) => void) | undefined
  const timers = new Set<{ run: () => void }>()
  const send = (event: { payload: { threadId: string; body: string; clientMessageId: string } }) => {
    sends.push({ ...event.payload, messageId: "not-yet-canonical", senderUserId: localUserId, sentAt: new Date().toISOString() })
    return true
  }
  const hook = loadSourceWithFakeReact<typeof InRoomChatHook>("features/miniRoom/useInRoomChat.ts", runtime, {
    modules: {
      "../chat/chatStore": store,
      "../realtime/globalRealtimeProvider": {
        getGlobalStatus: () => "connected",
        subscribeToStatus: () => () => undefined,
        useGlobalRealtime: () => ({ connectionStatus: "connected", send }),
        useGlobalRealtimeEvents: (listener: (event: ServerEvent) => void) => { roomListener = listener }
      },
      "@blumi/realtime-client": { createReconnectTransitionTracker },
      "../chat/thread/chatThreadModel": { normalizeOutgoingChatBody },
      "./inRoomChatThread": {
        findLastCanonicalRoomChatMessage, findCanonicalRoomChatThread,
        findMissedCanonicalRoomChatMessages, shouldRenderIncomingRoomChatMessage
      },
      "./roomEntryReplayGate": { createRoomEntryReplayGate, advanceRoomEntryReplayGate },
      "./roomChatHistoryModel": { ROOM_CHAT_HISTORY_LIMIT }
    },
    globals: {
      setTimeout: (run: () => void) => { const timer = { run }; timers.add(timer); return timer },
      clearTimeout: (timer: { run: () => void }) => { timers.delete(timer) }
    }
  })
  const globalHandler = createGlobalRealtimeEventHandler({
    currentUserId: localUserId,
    getMatchDeduplicationState: () => ({ handledMatchIds: new Set(), reconcilingMatchIds: new Set() }),
    normalizeRoomInviteRecord: () => { throw new Error("Unused invitation path") },
    upsertRoomInvite: () => undefined,
    applyChatThreadListed: store.applyChatThreadListed,
    applyChatThreadCreated: store.applyChatThreadCreated,
    applyChatMessageListed: store.applyChatMessageListed,
    applyChatMessageReceived: store.applyChatMessageReceived,
    openReadyMiniRoom: () => undefined,
    onConnectionMatched: () => undefined
  })
  const deliver = (payload: Extract<ServerEvent, { type: "chat.message_received" }>["payload"]) => {
    const event: ServerEvent = { type: "chat.message_received", payload }
    globalHandler(event)
    roomListener?.(event)
  }
  store.resetChatStore()
  try {
    store.applyChatThreadListed({ userId: localUserId, threads: [{
      threadId, miniRoomId: "synthetic-room", participantUserIds: [localUserId, partnerUserId],
      participants: [{ userId: localUserId }, { userId: partnerUserId }], createdAt: new Date().toISOString()
    }] })
    store.applyChatMessageListed({ userId: localUserId, threadId, messages: [] })
    runtime.render(() => hook.useInRoomChat({
      miniRoomId: "synthetic-room", sourceThreadId: threadId, localUserId, partnerUserId,
      requestMessages: async () => undefined
    }))
    const read = () => runtime.output as ReturnType<typeof hook.useInRoomChat>
    assert.equal(read().sendRoomMessage("Synthetic equal body"), true)
    assert.equal(read().sendRoomMessage("Synthetic equal body"), true)
    const [firstLocal, secondLocal] = store.getMessages(threadId)
    const firstSend = sends[0]!
    const secondSend = sends[1]!
    const secondAck = { ...secondSend, messageId: "synthetic-exact-second" }
    deliver(secondAck)
    assert.equal(store.getMessageRenderKey(secondAck.messageId), secondLocal!.messageId)
    assert.ok(store.getRetryableMessage(firstLocal!.messageId), "first identical send stays pending after second ACK")
    assert.equal(store.getRetryableMessage(secondLocal!.messageId), null)
    deliver(secondAck)
    assert.ok(store.getRetryableMessage(firstLocal!.messageId), "duplicate reducer plus listener delivery cannot steal first send")
    for (const timer of [...timers]) timer.run()
    assert.equal(read().failedRoomMessage?.clientMessageId, firstSend.clientMessageId)
    const firstAck = { ...firstSend, messageId: "synthetic-exact-first" }
    deliver(firstAck)
    assert.equal(read().failedRoomMessage, null)
    assert.equal(store.getMessageRenderKey(firstAck.messageId), firstLocal!.messageId)
    assert.equal(read().sendRoomMessage(firstSend.body, firstSend.clientMessageId), false, "late ACK makes restored retry stale")
    assert.equal(store.getMessages(threadId).length, 2, "one canonical row per original send")
    assert.ok(store.getMessages(threadId).every((entry) => !("clientMessageId" in entry)), "ACK metadata never enters durable messages")

    assert.equal(read().sendRoomMessage("Synthetic ambiguous broadcast"), true)
    assert.equal(read().sendRoomMessage("Synthetic ambiguous broadcast"), true)
    const beforeBroadcast = store.getMessages(threadId).filter((entry) => entry.messageId.startsWith("__local_"))
    const broadcastSend = sends[2]!
    const { clientMessageId, ...withoutAckMetadata } = broadcastSend
    const broadcast = { ...withoutAckMetadata, messageId: "synthetic-visible-broadcast" }
    deliver(broadcast)
    assert.equal(store.getMessageRenderKey(broadcast.messageId), broadcast.messageId, "ambiguous untracked broadcast keeps its visible canonical key")
    deliver({ ...broadcast, clientMessageId })
    assert.equal(store.getMessageRenderKey(broadcast.messageId), broadcast.messageId, "later exact ACK never remounts an already-visible row")
    assert.equal(store.getRetryableMessage(beforeBroadcast[0]!.messageId), null)
    assert.ok(store.getRetryableMessage(beforeBroadcast[1]!.messageId), "other equal tracked send survives broadcast then exact ACK")
    deliver({ ...broadcast, clientMessageId })
    assert.ok(store.getRetryableMessage(beforeBroadcast[1]!.messageId), "duplicate exact ACK remains harmless")
    assert.equal(store.getMessages(threadId).length, 4)
  } finally {
    runtime.unmount()
    store.resetChatStore()
  }
})
