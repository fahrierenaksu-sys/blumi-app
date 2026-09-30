import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThreadList } from "@blumi/contracts"
import type { SessionActor } from "../session/sessionModel"
import {
  createGlobalRealtimeLifecycle,
  getGlobalRealtimeLifecycleIdentity,
  type GlobalRealtimeLifecycleDependencies
} from "./globalRealtimeLifecycle"

type TestDependencies = GlobalRealtimeLifecycleDependencies & {
  statusListeners: ((
    status: "idle" | "connecting" | "reconnecting" | "connected" | "disconnected" | "error",
    meta?: { closeCode?: number }
  ) => void)[]
  calls: string[]
  sentEvents: unknown[]
  listedThreadLists: ChatThreadList[]
  toasts: { title: string; body: string }[]
}

const productionActor = {
  session: {
    mode: "production",
    sessionToken: "session-token",
    userId: "ada",
    accountId: "account-ada",
    sessionId: "session-ada",
    expiresAt: "2026-07-23T00:00:00.000Z",
    onboarding: { profile: "complete", avatar: "complete", room: "complete" }
  },
  profile: { userId: "ada", displayName: "Ada", avatar: { presetId: "dusk" } }
} as SessionActor

const demoActor = {
  ...productionActor,
  session: { ...productionActor.session, mode: "demo" }
} as SessionActor

test("realtime lifecycle identity ignores profile-only edits but changes with the session", () => {
  const renamed = {
    ...productionActor,
    profile: { ...productionActor.profile, displayName: "Ada Updated" }
  }
  assert.equal(
    getGlobalRealtimeLifecycleIdentity(renamed),
    getGlobalRealtimeLifecycleIdentity(productionActor)
  )
  assert.notEqual(
    getGlobalRealtimeLifecycleIdentity({
      ...productionActor,
      session: { ...productionActor.session, sessionToken: "refreshed-token" }
    }),
    getGlobalRealtimeLifecycleIdentity(productionActor)
  )
  assert.notEqual(
    getGlobalRealtimeLifecycleIdentity(demoActor),
    getGlobalRealtimeLifecycleIdentity(productionActor)
  )
  assert.equal(getGlobalRealtimeLifecycleIdentity(null), null)
})

function createDependencies(
  overrides: Partial<TestDependencies> = {}
): TestDependencies {
  const dependencies = {
    sessionActor: productionActor,
    isMainRoute: true,
    isAccountRestricted: false,
    isCurrentSession: () => true,
    isDemoMode: () => false,
    setDemoMode: (enabled: boolean) => dependencies.calls.push(`demo:${enabled}`),
    resetInactiveSessionState: () => dependencies.calls.push("reset-inactive"),
    calls: [] as string[],
    statusListeners: [],
    sentEvents: [],
    listedThreadLists: [],
    toasts: [],
    refreshProductionThreads: async () => {
      dependencies.calls.push("refresh-threads")
    },
    hydrateBlockedUsersFromServer: async () => {
      dependencies.calls.push("hydrate-blocks")
    },
    connectGlobal: (wsBaseUrl: string, httpBaseUrl: string, sessionToken: string) => {
      dependencies.calls.push(`connect:${wsBaseUrl}:${httpBaseUrl}:${sessionToken}`)
    },
    disconnectGlobal: () => dependencies.calls.push("disconnect"),
    sendGlobal: (event: unknown) => dependencies.sentEvents.push(event),
    subscribeToStatus: (listener: TestDependencies["statusListeners"][number]) => {
      dependencies.statusListeners.push(listener)
      return () => {
        const index = dependencies.statusListeners.indexOf(listener)
        if (index >= 0) dependencies.statusListeners.splice(index, 1)
      }
    },
    applyChatThreadListed: (payload: ChatThreadList) => {
      dependencies.listedThreadLists.push(payload)
    },
    getThreads: () => [],
    isRealtimeAuthInvalidClose: (closeCode: number | undefined) => closeCode === 4401,
    clearSessionActor: async () => {
      dependencies.calls.push("clear-session")
    },
    refreshAccountModeration: async () => {
      dependencies.calls.push("refresh-moderation")
    },
    showWarningToast: (toast: { title: string; body: string }) => {
      dependencies.toasts.push(toast)
    },
    wsBaseUrl: "wss://realtime.blumi.test",
    httpBaseUrl: "https://api.blumi.test",
    ...overrides
  } as TestDependencies
  return dependencies
}

test("inactive sessions reset local realtime state and never connect", () => {
  const dependencies = createDependencies({ sessionActor: null })
  const cleanup = createGlobalRealtimeLifecycle(dependencies)()

  cleanup()

  assert.deepEqual(dependencies.calls, ["reset-inactive"])
  assert.deepEqual(dependencies.statusListeners, [])
})

test("demo sessions stay offline and hydrate the local demo thread list", () => {
  const dependencies = createDependencies({ sessionActor: demoActor })
  createGlobalRealtimeLifecycle(dependencies)()

  assert.deepEqual(dependencies.calls, ["reset-inactive", "demo:true", "disconnect"])
  assert.deepEqual(dependencies.listedThreadLists, [{ userId: "ada", threads: [] }])
  assert.deepEqual(dependencies.sentEvents, [])
})

test("production sessions connect, request threads, handle auth closes, and clean up", async () => {
  const dependencies = createDependencies()
  const cleanup = createGlobalRealtimeLifecycle(dependencies)()
  await Promise.resolve()

  assert.deepEqual(dependencies.calls, [
    "refresh-threads",
    "hydrate-blocks",
    "connect:wss://realtime.blumi.test:https://api.blumi.test:session-token"
  ])
  assert.equal(dependencies.statusListeners.length, 2)

  const [connectedListener, invalidSessionListener] = [...dependencies.statusListeners]
  connectedListener("connected")
  invalidSessionListener("error", { closeCode: 4403 })
  invalidSessionListener("error", { closeCode: 4401 })
  connectedListener("connected")
  invalidSessionListener("error", { closeCode: 4403 })
  assert.deepEqual(dependencies.sentEvents, [{ type: "chat.list_threads", payload: {} }])
  assert.deepEqual(dependencies.calls.slice(3), [
    "refresh-moderation",
    "disconnect",
    "clear-session"
  ])

  const callsAfterAuthClose = [...dependencies.calls]
  cleanup()
  assert.deepEqual(dependencies.calls, callsAfterAuthClose)
  assert.deepEqual(dependencies.statusListeners, [])
})

test("does not toast a late production refresh failure after cleanup", async () => {
  let rejectRefresh: ((error: Error) => void) | undefined
  const dependencies = createDependencies({
    refreshProductionThreads: () => new Promise<void>((_resolve, reject) => {
      rejectRefresh = reject
    })
  })
  const cleanup = createGlobalRealtimeLifecycle(dependencies)()

  cleanup()
  rejectRefresh?.(new Error("late failure"))
  await Promise.resolve()

  assert.deepEqual(dependencies.toasts, [])
})

test("reconnect refreshes safety and active history once without initial or duplicate work", async () => {
  let resyncs = 0
  const dependencies = createDependencies({
    resynchronizeActiveConversation: async () => { resyncs += 1 }
  })
  const cleanup = createGlobalRealtimeLifecycle(dependencies)()
  const listener = dependencies.statusListeners[0]
  listener("connected")
  listener("connected")
  assert.equal(resyncs, 0)
  listener("reconnecting", { closeCode: 1012 })
  listener("connected")
  listener("connected")
  await Promise.resolve()
  assert.equal(resyncs, 1)
  assert.equal(dependencies.calls.filter((call) => call === "hydrate-blocks").length, 2)
  assert.equal(dependencies.sentEvents.length, 2)
  cleanup()
  listener("reconnecting")
  listener("connected")
  assert.equal(resyncs, 1)
})

test("a superseded account does not resynchronize on reconnect", () => {
  let current = true
  let resyncs = 0
  const dependencies = createDependencies({
    isCurrentSession: () => current,
    resynchronizeActiveConversation: async () => { resyncs += 1 }
  })
  const cleanup = createGlobalRealtimeLifecycle(dependencies)()
  const listener = dependencies.statusListeners[0]
  listener("connected")
  current = false
  listener("reconnecting")
  listener("connected")
  assert.equal(resyncs, 0)
  assert.equal(dependencies.sentEvents.length, 1)
  cleanup()
})

test("a superseded reconnect failure cannot show a stale warning", async () => {
  const rejectSafety: ((error: Error) => void)[] = []
  const dependencies = createDependencies({
    hydrateBlockedUsersFromServer: () => new Promise<void>((_resolve, reject) => {
      rejectSafety.push(reject)
    }),
    resynchronizeActiveConversation: async () => undefined
  })
  const cleanup = createGlobalRealtimeLifecycle(dependencies)()
  const listener = dependencies.statusListeners[0]
  listener("connected")
  listener("reconnecting")
  listener("connected")
  listener("reconnecting")
  listener("connected")
  rejectSafety[1]?.(new Error("old reconnect"))
  await Promise.resolve()
  assert.deepEqual(dependencies.toasts, [])
  rejectSafety[2]?.(new Error("current reconnect"))
  await Promise.resolve()
  assert.equal(dependencies.toasts.length, 1)
  cleanup()
  rejectSafety[0]?.(new Error("initial connection"))
  await Promise.resolve()
})

test("a failed active chat resync leaves warning ownership with chat coordinator", async () => {
  const dependencies = createDependencies({
    resynchronizeActiveConversation: async () => {
      dependencies.showWarningToast({ title: "Chat not loaded", body: "Retry later" })
      throw new Error("network detail")
    }
  })
  const cleanup = createGlobalRealtimeLifecycle(dependencies)()
  const listener = dependencies.statusListeners[0]
  listener("connected")
  listener("reconnecting")
  listener("connected")
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(dependencies.toasts, [{ title: "Chat not loaded", body: "Retry later" }])
  cleanup()
})

test("uses safe copy instead of transport diagnostics for global refresh failures", async () => {
  let rejectThreads: ((error: Error) => void) | undefined
  let rejectBlockedUsers: ((error: Error) => void) | undefined
  const dependencies = createDependencies({
    refreshProductionThreads: () => new Promise<void>((_resolve, reject) => {
      rejectThreads = reject
    }),
    hydrateBlockedUsersFromServer: () => new Promise<void>((_resolve, reject) => {
      rejectBlockedUsers = reject
    })
  })

  createGlobalRealtimeLifecycle(dependencies)()
  rejectThreads?.(
    new Error("fetch failed: UnexpectedException: Could not connect to the server.")
  )
  rejectBlockedUsers?.(
    new Error("POST /v1/blocks returned 502 from upstream")
  )
  await Promise.resolve()

  assert.deepEqual(dependencies.toasts, [
    {
      title: "Chats offline",
      body: "We couldn't refresh your chats yet. Check your connection and try again later."
    },
    {
      title: "Safety list offline",
      body: "We couldn't refresh your safety list yet. It will try again later."
    }
  ])
})

test("restricted main sessions use the inactive reset path", () => {
  const dependencies = createDependencies({ isAccountRestricted: true })
  createGlobalRealtimeLifecycle(dependencies)()

  assert.deepEqual(dependencies.calls, ["reset-inactive"])
})

test("a hundred lifecycle restarts leave no status listener and pair every connect with a disconnect", async () => {
  const dependencies = createDependencies()
  for (let cycle = 0; cycle < 100; cycle += 1) {
    const cleanup = createGlobalRealtimeLifecycle(dependencies)()
    assert.equal(dependencies.statusListeners.length, 2, `cycle ${cycle} subscribes exactly twice`)
    for (const listener of [...dependencies.statusListeners]) listener(cycle % 2 ? "connected" : "reconnecting")
    cleanup()
    cleanup()
    assert.equal(dependencies.statusListeners.length, 0, `cycle ${cycle} leaked a listener`)
  }
  await Promise.resolve()
  const connects = dependencies.calls.filter((call) => call.startsWith("connect:")).length
  const disconnects = dependencies.calls.filter((call) => call === "disconnect").length
  assert.equal(connects, 100)
  assert.equal(disconnects, 100, "a repeated cleanup must not disconnect a newer lifecycle")
})

test("the connect-time thread list request is recorded only when the socket accepted it", () => {
  let accepted = false
  const noted: string[] = []
  const dependencies = createDependencies({
    sendGlobal: (event) => {
      dependencies.sentEvents.push(event)
      return accepted
    },
    noteThreadListRequested: () => { noted.push("noted") }
  })
  const cleanup = createGlobalRealtimeLifecycle(dependencies)()
  const [connectedListener] = [...dependencies.statusListeners]
  connectedListener("connected")
  assert.deepEqual(noted, [], "a refused send has no reply to match")
  connectedListener("disconnected")
  accepted = true
  connectedListener("connected")
  assert.deepEqual(noted, ["noted"])
  cleanup()
})
