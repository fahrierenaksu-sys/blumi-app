import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import {
  findLastCanonicalRoomChatMessage,
  findCanonicalRoomChatThread,
  findMissedCanonicalRoomChatMessages,
  shouldRenderIncomingRoomChatMessage
} from "./inRoomChatThread"
import { createRoomEntryReplayGate, advanceRoomEntryReplayGate } from "./roomEntryReplayGate"
import { createReconnectTransitionTracker, type RealtimeConnectionStatus } from "@blumi/realtime-client"

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

function createHookFixture() {
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
  let listStatus: "idle" | "loading" | "ready" | "failed" = "idle"
  let listCompletionVersion = 0
  let messages: ChatMessage[] = []
  let eventHandler: ((event: any) => void) | undefined
  const statusListeners = new Set<(status: RealtimeConnectionStatus) => void>()
  const sends: unknown[] = []
  const optimistic: unknown[] = []
  const failed: string[] = []
  const markedSending: string[] = []
  const confirmed: { clientMessageId: string; messageId: string }[] = []
  const timers: { run: () => void; delay: number; cleared: boolean }[] = []
  let sendAccepted = true
  const thread: ChatThread = {
    threadId,
    miniRoomId: "mini-room",
    participantUserIds: [localUserId, partnerUserId],
    participants: [
      { userId: localUserId, displayName: "You" },
      { userId: partnerUserId, displayName: "Partner" }
    ],
    createdAt: "2026-07-21T12:00:00.000Z"
  }
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
  const getMessages = (requestedThreadId: string) => requestedThreadId === threadId ? messages : []
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
      useChatStore: () => ({
        threads: [thread],
        getMessages,
        getMessageListState,
        addOptimisticMessage: (entry: unknown) => { optimistic.push(entry) }
      })
    },
    "../realtime/globalRealtimeProvider": {
      getGlobalStatus: () => realtimeStatus,
      subscribeToStatus: (listener: (status: RealtimeConnectionStatus) => void) => {
        statusListeners.add(listener)
        return () => statusListeners.delete(listener)
      },
      useGlobalRealtime: () => ({
        connectionStatus: realtimeStatus,
        send: (event: unknown) => { sends.push(event); return sendAccepted }
      }),
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
      sourceThreadId: threadId,
      localUserId,
      partnerUserId
    })
    const pendingEffects = effects.splice(0)
    for (const effect of pendingEffects) effect.slot.cleanup?.()
    for (const effect of pendingEffects) effect.slot.cleanup = effect.run() || undefined
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
    sends,
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
    output: () => output as {
      newMessages: { messageId: string }[]
      sendRoomMessage: (body: string) => boolean
      failedRoomMessage: { clientMessageId: string; body: string } | null
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
      if (status === "ready") listCompletionVersion += 1
      dirty = true
    },
    applyFastReadyHistory: (nextMessages: ChatMessage[]) => {
      // Simulates the coordinator starting and completing a refresh before
      // React commits the intermediate loading snapshot.
      listStatus = "loading"
      listStatus = "ready"
      listCompletionVersion += 1
      messages = nextMessages
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
  assert.equal(f.sends.length, 1, "room entry asks the existing realtime client for history once")

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
  assert.equal(f.sends.length, 1, "the hook must not duplicate the coordinator's reconnect history fetch")

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
  assert.equal(f.output().sendRoomMessage(" brb "), true)
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
