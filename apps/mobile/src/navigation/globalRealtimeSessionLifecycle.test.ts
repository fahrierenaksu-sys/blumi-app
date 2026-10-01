import assert from "node:assert/strict"
import test from "node:test"
import { chatTypingStore } from "../features/chat/typing/chatTypingStore"
import type { SessionActor } from "../features/session/sessionModel"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"

// Characterizes the global realtime socket lifecycle owned by
// useGlobalRealtimeSession: it restarts only for a new session identity,
// route access or restriction, and callbacks read their latest version.
type StatusListener = (status: string, meta?: { closeCode?: number }) => void

const actor = (token: string, displayName = "Ada") => ({
  session: { mode: "production", accountId: "account", sessionId: "session", userId: "user-a", sessionToken: token },
  profile: { userId: "user-a", displayName }
}) as unknown as SessionActor

function mount() {
  const runtime = createFakeReactRuntime()
  const events: string[] = []
  const statusListeners = new Set<StatusListener>()
  const sent: { type: string; payload: unknown }[] = []
  let handlerDependencies: Record<string, (...args: unknown[]) => unknown> = {}
  let refreshFailure: ((error: Error) => void) | undefined
  const handler: { dependencies?: Record<string, unknown> } = {}
  const { useGlobalRealtimeSession } = loadSourceWithFakeReact<{
    useGlobalRealtimeSession: (input: Record<string, unknown>) => void
  }>("navigation/useGlobalRealtimeSession.ts", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid", MOBILE_WS_BASE_URL: "wss://fixture.invalid" },
      "../features/chat/chatRoomInviteApi": { normalizeRoomInviteRecord: () => null },
      "../features/chat/chatStore": {
        applyChatMessageListed: () => undefined,
        applyChatMessageReceived: () => undefined,
        applyChatReceiptUpdated: () => undefined,
        applyChatThreadListed: () => undefined,
        applyChatThreadRead: () => undefined,
        getThreads: () => [],
        noteRealtimeThreadListRequested: () => undefined
      },
      "../features/chat/inboxCopy": { getInboxCopy: () => ({ unknownPartner: "Someone" }) },
      "../features/session/accountRecoveryCopy": { resolveAccountRecoveryLocale: () => "en" },
      "../features/session/authLocale": { getNativeAppLocale: () => "en" },
      "../features/demo/demoStore": { isDemoMode: () => false, setDemoMode: () => undefined },
      "../features/realtime/globalRealtimeEventHandler": {
        createGlobalRealtimeEventHandler: (dependencies: Record<string, (...args: unknown[]) => unknown>) => {
          handler.dependencies = dependencies
          handlerDependencies = dependencies
          return () => undefined
        }
      },
      "../features/notifications/foregroundNotificationState": { shouldShowIncomingMessageAlert: () => true },
      "../features/realtime/globalRealtimeProvider": {
        connectGlobal: (_ws: string, _http: string, token: string) => { events.push(`connect:${token}`) },
        disconnectGlobal: () => { events.push("disconnect") },
        sendGlobal: (event: { type: string; payload: unknown }) => { sent.push(event); return true },
        setGlobalRealtimeAppState: () => undefined,
        subscribeToStatus: (listener: StatusListener) => {
          statusListeners.add(listener)
          return () => statusListeners.delete(listener)
        },
        useGlobalRealtimeEvents: () => undefined
      },
      "@blumi/realtime-client": { isRealtimeAuthInvalidClose: (code?: number) => code === 4401 },
      "../features/safety/blockStore": { hydrateBlockedUsersFromServer: async () => undefined },
      "../ui/toast": { showToast: (toast: { title: string }) => { events.push(`toast:${toast.title}`) } },
      "./rootNavigationRef": { navigationRef: {
        getCurrentRoute: () => undefined,
        isReady: () => true,
        navigate: (route: string, params: { threadId?: string }) => { events.push(`navigate:${route}:${params.threadId}`) }
      } }
    },
    real: ["../features/realtime/globalRealtimeLifecycle", "../features/chat/chatDeliveryAckBatcher", "../features/chat/typing/chatTypingStore"]
  })
  const resetInactiveSessionState = () => { events.push("reset") }
  const refreshProductionThreads = () => new Promise<void>((_resolve, reject) => { refreshFailure = reject })
  let props: Record<string, unknown> = {
    sessionActor: actor("token-1"),
    sessionEntryRoute: "Main",
    isAccountRestricted: false,
    isCurrentSession: () => true,
    resetInactiveSessionState,
    clearSessionActor: async () => { events.push("clear:first") },
    refreshAccountModeration: async () => undefined,
    refreshProductionThreads,
    resynchronizeMessages: async () => undefined,
    upsertRoomInvite: () => undefined,
    applyRealtimeThreadList: () => undefined,
    applyNewThread: () => undefined,
    openReadyMiniRoom: () => undefined,
    getMatchDeduplicationState: () => undefined,
    onConnectionMatched: () => undefined,
    onPartnerBlocked: () => undefined,
    receiptsEnabled: false,
    typingEnabled: false
  }
  const render = (next: Record<string, unknown> = {}) => {
    props = { ...props, ...next }
    runtime.render(() => useGlobalRealtimeSession(props))
  }
  return {
    runtime,
    events,
    handler,
    sent,
    acknowledge: (messageId: string) => handlerDependencies.acknowledgeDelivery?.({
      messageId, threadId: "thread-1", senderUserId: "user-b", body: "hi", sentAt: "2026-10-01T10:00:00.000Z"
    }),
    render,
    emitStatus: (status: string, meta?: { closeCode?: number }) => {
      for (const listener of [...statusListeners]) listener(status, meta)
    },
    failThreadRefresh: () => refreshFailure?.(new Error("offline"))
  }
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

test("the socket connects once per session identity; a new actor object with the same identity does not reconnect", () => {
  const f = mount()
  f.render()
  f.render({ sessionActor: actor("token-1", "Ada Lovelace") })
  f.render()
  assert.deepEqual(f.events, ["connect:token-1"])
})

test("a rotated session token reconnects with the new credentials", () => {
  const f = mount()
  f.render()
  f.render({ sessionActor: actor("token-2") })
  assert.deepEqual(f.events, ["connect:token-1", "disconnect", "connect:token-2"])
  f.runtime.unmount()
  assert.deepEqual(f.events.slice(3), ["disconnect"])
})

test("leaving the main route or a restriction tears the socket down", () => {
  const f = mount()
  f.render()
  f.render({ isAccountRestricted: true })
  assert.deepEqual(f.events, ["connect:token-1", "disconnect", "reset"])
})

test("partner messages are acknowledged over the socket only while receipts are rolled out", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const f = mount()
  f.render()
  f.acknowledge("m1")
  context.mock.timers.tick(1_000)
  assert.deepEqual(f.sent.filter((event) => event.type === "chat.ack_delivered"), [], "capability off")

  f.render({ receiptsEnabled: true })
  f.acknowledge("m2")
  f.acknowledge("m3")
  context.mock.timers.tick(1_000)
  assert.deepEqual(f.sent.filter((event) => event.type === "chat.ack_delivered"), [
    { type: "chat.ack_delivered", payload: { threadId: "thread-1", upToMessageId: "m3" } }
  ])
  f.runtime.unmount()
})

test("a reconnect re-sends the delivery ack sent just before the socket dropped", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  const f = mount()
  f.render({ receiptsEnabled: true })
  f.emitStatus("connected")
  f.acknowledge("m1")
  context.mock.timers.tick(1_000)
  f.emitStatus("reconnecting")
  f.emitStatus("connected")
  context.mock.timers.tick(1_000)
  assert.deepEqual(f.sent.filter((event) => event.type === "chat.ack_delivered"), [
    { type: "chat.ack_delivered", payload: { threadId: "thread-1", upToMessageId: "m1" } },
    { type: "chat.ack_delivered", payload: { threadId: "thread-1", upToMessageId: "m1" } }
  ])
  f.runtime.unmount()
})

test("typing signals go out over the socket only while chat_typing is rolled out, per account", () => {
  const f = mount()
  f.render()
  const command = { threadId: "thread-1", state: "start" as const }
  assert.equal(chatTypingStore.send(command), false, "capability off")
  f.render({ typingEnabled: true })
  assert.equal(chatTypingStore.send(command), true)
  assert.deepEqual(f.sent.filter((event) => event.type === "chat.typing"), [{ type: "chat.typing", payload: command }])
  f.runtime.unmount()
  assert.equal(chatTypingStore.getSnapshot().ownerUserId, undefined, "signing out resets typing")
  assert.equal(chatTypingStore.send(command), false)
})

test("session callbacks are read at call time without reconnecting", async () => {
  const f = mount()
  f.render()
  f.render({
    clearSessionActor: async () => { f.events.push("clear:latest") },
    isCurrentSession: () => false
  })
  // A stale session guard would still report the refresh failure.
  f.failThreadRefresh()
  await settle()
  f.emitStatus("disconnected", { closeCode: 4401 })
  assert.deepEqual(f.events, ["connect:token-1", "disconnect", "clear:latest"])
})

test("incoming message alerts go through the one foreground alert gate and open the chat", () => {
  const f = mount()
  f.render()
  const dependencies = f.handler.dependencies!
  assert.equal(typeof dependencies.shouldShowIncomingMessageAlert, "function")
  assert.equal(dependencies.unknownSenderName, "Someone")
  ;(dependencies.openConversation as (threadId: string) => void)("thread-1")
  assert.deepEqual(f.events.slice(-1), ["navigate:ChatThread:thread-1"])
})
