import assert from "node:assert/strict"
import test from "node:test"
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
        applyChatThreadListed: () => undefined,
        applyChatThreadRead: () => undefined,
        getThreads: () => [],
        isConversationOnScreen: () => false,
        noteMessageShownInApp: () => undefined,
        noteRealtimeThreadListRequested: () => undefined
      },
      "../features/chat/inboxCopy": { getInboxCopy: () => ({ unknownPartner: "Someone" }) },
      "../features/session/accountRecoveryCopy": { resolveAccountRecoveryLocale: () => "en" },
      "../features/session/authLocale": { getNativeAppLocale: () => "en" },
      "../features/demo/demoStore": { isDemoMode: () => false, setDemoMode: () => undefined },
      "../features/realtime/globalRealtimeEventHandler": {
        createGlobalRealtimeEventHandler: (dependencies: Record<string, unknown>) => {
          handler.dependencies = dependencies
          return () => undefined
        }
      },
      "../features/realtime/globalRealtimeProvider": {
        connectGlobal: (_ws: string, _http: string, token: string) => { events.push(`connect:${token}`) },
        disconnectGlobal: () => { events.push("disconnect") },
        sendGlobal: () => true,
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
    real: ["../features/realtime/globalRealtimeLifecycle"]
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
    onPartnerBlocked: () => undefined
  }
  const render = (next: Record<string, unknown> = {}) => {
    props = { ...props, ...next }
    runtime.render(() => useGlobalRealtimeSession(props))
  }
  return {
    runtime,
    events,
    handler,
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

test("incoming message alerts know the conversation on screen, record in-app alerts and open the chat", () => {
  const f = mount()
  f.render()
  const dependencies = f.handler.dependencies!
  assert.equal(typeof dependencies.isConversationOnScreen, "function")
  assert.equal(typeof dependencies.noteMessageShownInApp, "function")
  assert.equal(dependencies.unknownSenderName, "Someone")
  ;(dependencies.openConversation as (threadId: string) => void)("thread-1")
  assert.deepEqual(f.events.slice(-1), ["navigate:ChatThread:thread-1"])
})
