import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../testing/hookHarness"

// Push registration belongs to the unrestricted main session only: a
// restricted account or a session outside Main registers nothing, a tap on
// AuthEntry is discarded, the app icon badge is production-only, and every
// navigation readiness replays pending taps.

interface Registration { actor: unknown; generation: number }

function mount(input: {
  sessionEntryRoute: string
  isAccountRestricted?: boolean
  mode?: "production" | "demo"
  navigationReadyGeneration?: number
}) {
  const runtime = createFakeReactRuntime()
  const registrations: Registration[] = []
  const badge: boolean[] = []
  const discard: boolean[] = []
  const { useNotificationResponseRouting } = loadSourceWithFakeReact<{
    useNotificationResponseRouting: (props: Record<string, unknown>) => unknown
  }>("navigation/useNotificationResponseRouting.ts", runtime, {
    modules: {
      "../features/chat/chatStore": { hasChatThread: () => true, useThreadListVersion: () => 0 },
      "../features/notifications/notificationRouting": { resolveNotificationDestination: () => null },
      "../features/notifications/notificationTapRouting": {
        createChatTapGate: () => ({ reset: () => undefined, decide: () => ({ kind: "open" }) })
      },
      "../features/notifications/usePushRegistration": {
        usePushRegistration: (actor: unknown, _callback: unknown, generation: number) => {
          registrations.push({ actor, generation })
          return {}
        }
      },
      "../features/notifications/useNotificationSessionSurfaces": {
        useAppIconBadge: (enabled: boolean) => { badge.push(enabled) },
        useSignedOutNotificationTapDiscard: (enabled: boolean) => { discard.push(enabled) }
      },
      "./rootNavigationRef": { navigationRef: { isReady: () => true, navigate: () => undefined } }
    }
  })
  const actor = {
    session: { mode: input.mode ?? "production", userId: "user-a", sessionToken: "token-a" },
    profile: { userId: "user-a" }
  }
  runtime.render(() => useNotificationResponseRouting({
    sessionActor: actor,
    sessionEntryRoute: input.sessionEntryRoute,
    isAccountRestricted: input.isAccountRestricted ?? false,
    isCurrentSession: () => true,
    navigationReadyGeneration: input.navigationReadyGeneration ?? 0
  }))
  return { actor, last: registrations.at(-1)!, badge: badge.at(-1), discard: discard.at(-1) }
}

test("the unrestricted main session registers push and replays on readiness", () => {
  const routing = mount({ sessionEntryRoute: "Main", navigationReadyGeneration: 3 })
  assert.equal(routing.last.actor, routing.actor)
  assert.equal(routing.last.generation, 3)
  assert.equal(routing.badge, true)
  assert.equal(routing.discard, false)
})

test("a restricted account never registers push or shows the badge", () => {
  const routing = mount({ sessionEntryRoute: "Main", isAccountRestricted: true })
  assert.equal(routing.last.actor, null)
  assert.equal(routing.badge, false)
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

test("demo sessions get no app icon badge", () => {
  assert.equal(mount({ sessionEntryRoute: "Main", mode: "demo" }).badge, false)
})
