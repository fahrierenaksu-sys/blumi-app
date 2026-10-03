import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../testing/hookHarness"

// Push registration belongs to the unrestricted main session only: a
// restricted account or a session outside Main registers nothing, a tap on
// AuthEntry is discarded, the app icon badge is production-only, and every
// navigation readiness replays pending taps. The root never subscribes to chat
// store traffic: a waiting conversation tap is replayed only when a new thread
// list arrives, and the badge runs in a leaf component.

type Handler = (data: unknown, actor: unknown, action?: "enter_room") => boolean
interface Registration { actor: unknown; generation: number; handler: Handler }
type Decision = { kind: "open" } | { kind: "inbox" } | { kind: "wait"; retryInMs: number }

function mount(input: {
  sessionEntryRoute: string
  isAccountRestricted?: boolean
  mode?: "production" | "demo"
  navigationReadyGeneration?: number
  decision?: Decision
}) {
  const runtime = createFakeReactRuntime()
  const registrations: Registration[] = []
  const badge: boolean[] = []
  const discard: boolean[] = []
  const navigations: unknown[][] = []
  const chatListeners = new Set<() => void>()
  let listVersion = 0
  const mocks = {
    decision: input.decision ?? ({ kind: "open" } as Decision)
  }
  const routing = loadSourceWithFakeReact<{
    useNotificationResponseRouting: (props: Record<string, unknown>) => unknown
    isAppIconBadgeEnabled: (actor: unknown, route: string, restricted: boolean) => boolean
    AppIconBadgeSync: (props: { enabled: boolean }) => null
  }>("navigation/useNotificationResponseRouting.ts", runtime, {
    modules: {
      "../features/chat/chatStore": {
        hasChatThread: () => true,
        getThreadListVersion: () => listVersion,
        subscribeToChatStore: (listener: () => void) => {
          chatListeners.add(listener)
          return () => { chatListeners.delete(listener) }
        }
      },
      "../features/notifications/notificationRouting": {
        resolveNotificationDestination: (data: { threadId?: string }) =>
          data.threadId ? { route: "ChatThread", params: { threadId: data.threadId } } : null
      },
      "../features/notifications/notificationTapRouting": {
        createChatTapGate: () => ({ reset: () => undefined, decide: () => mocks.decision })
      },
      "../features/notifications/usePushRegistration": {
        usePushRegistration: (actor: unknown, handler: Handler, generation: number) => {
          registrations.push({ actor, generation, handler })
          return {}
        }
      },
      "../features/notifications/useNotificationSessionSurfaces": {
        useAppIconBadge: (enabled: boolean) => { badge.push(enabled) },
        useSignedOutNotificationTapDiscard: (enabled: boolean) => { discard.push(enabled) }
      },
      "./rootNavigationRef": { navigationRef: { isReady: () => true, navigate: (...args: unknown[]) => { navigations.push(args) } } }
    }
  })
  const actor = {
    session: { mode: input.mode ?? "production", userId: "user-a", sessionToken: "token-a" },
    profile: { userId: "user-a" }
  }
  const isCurrentSession = () => true
  runtime.render(() => routing.useNotificationResponseRouting({
    sessionActor: actor,
    sessionEntryRoute: input.sessionEntryRoute,
    isAccountRestricted: input.isAccountRestricted ?? false,
    isCurrentSession,
    navigationReadyGeneration: input.navigationReadyGeneration ?? 0
  }))
  return {
    actor,
    routing,
    runtime,
    navigations,
    registrations,
    get last() { return registrations.at(-1)! },
    discard: discard.at(-1),
    badge,
    setDecision: (decision: Decision) => { mocks.decision = decision },
    publishThreadList: () => {
      listVersion += 1
      for (const listener of [...chatListeners]) listener()
    },
    publishOtherChatChange: () => { for (const listener of [...chatListeners]) listener() }
  }
}

test("the unrestricted main session registers push and replays on readiness", () => {
  const routing = mount({ sessionEntryRoute: "Main", navigationReadyGeneration: 3 })
  assert.equal(routing.last.actor, routing.actor)
  assert.equal(routing.last.generation, 3)
  assert.equal(routing.discard, false)
})

test("a restricted account never registers push", () => {
  const routing = mount({ sessionEntryRoute: "Main", isAccountRestricted: true })
  assert.equal(routing.last.actor, null)
})

test("sessions outside Main register no push", () => {
  for (const sessionEntryRoute of ["ProfileSetup", "AvatarSetup", "RoomSetup"]) {
    assert.equal(mount({ sessionEntryRoute }).last.actor, null, sessionEntryRoute)
  }
})

test("taps are discarded while signed out", () => {
  const routing = mount({ sessionEntryRoute: "AuthEntry" })
  assert.equal(routing.discard, true)
  assert.equal(routing.last.actor, null)
})

test("the app icon badge is production-only on the unrestricted main session", () => {
  const { routing, actor } = mount({ sessionEntryRoute: "Main" })
  const demoActor = { ...actor, session: { ...actor.session, mode: "demo" } }
  assert.equal(routing.isAppIconBadgeEnabled(actor, "Main", false), true)
  assert.equal(routing.isAppIconBadgeEnabled(demoActor, "Main", false), false)
  assert.equal(routing.isAppIconBadgeEnabled(actor, "Main", true), false)
  assert.equal(routing.isAppIconBadgeEnabled(actor, "AuthEntry", false), false)
  assert.equal(routing.isAppIconBadgeEnabled(null, "Main", false), false)
})

test("the badge leaf passes its flag to the badge sync and renders nothing", () => {
  const f = mount({ sessionEntryRoute: "Main" })
  let rendered: unknown = "unset"
  f.runtime.render(() => { rendered = f.routing.AppIconBadgeSync({ enabled: true }); return rendered })
  assert.equal(rendered, null)
  assert.equal(f.badge.at(-1), true)
})

test("the root subscribes to chat traffic only to replay a waiting conversation tap", () => {
  const f = mount({ sessionEntryRoute: "Main", decision: { kind: "wait", retryInMs: 4000 } })
  const renders = f.registrations.length
  // No tap waits yet: list and message traffic must not re-render the root.
  f.publishThreadList()
  f.publishOtherChatChange()
  assert.equal(f.registrations.length, renders)

  assert.equal(f.last.handler({ threadId: "thread-1" }, f.actor), false)
  const generationBefore = f.last.generation
  // Unrelated chat changes (no new thread list) still leave the tap waiting.
  f.publishOtherChatChange()
  assert.equal(f.last.generation, generationBefore)

  f.setDecision({ kind: "open" })
  f.publishThreadList()
  assert.ok(f.last.generation > generationBefore, "a new thread list replays the pending tap")
  assert.equal(f.last.handler({ threadId: "thread-1" }, f.actor), true)
  assert.deepEqual(f.navigations.at(-1), ["ChatThread", { threadId: "thread-1" }])

  const settled = f.registrations.length
  f.publishThreadList()
  assert.equal(f.registrations.length, settled, "nothing waits any more, so the root stays still")
})

test("the push handler keeps its identity while the thread list changes", () => {
  const f = mount({ sessionEntryRoute: "Main" })
  const handler = f.last.handler
  f.publishThreadList()
  f.runtime.rerender()
  assert.equal(f.last.handler, handler)
})
