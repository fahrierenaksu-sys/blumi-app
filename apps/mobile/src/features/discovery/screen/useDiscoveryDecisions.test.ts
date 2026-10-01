import assert from "node:assert/strict"
import Module, { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import type { DiscoveryDecisionQuota } from "@blumi/contracts"
import { getLobbyFeedbackCopy } from "../../lobby/lobbyFeedbackCopy"
import type { PendingInviteMemory } from "../../lobby/pendingInvitesStore"
import {
  createDiscoveryMatchCreatedReporter,
  type DiscoveryMatchCreatedReporter
} from "../../matches/discoveryMatchCreatedReporter"
import type { SessionActor } from "../../session/sessionModel"
import type { DiscoveryCandidate } from "../discoveryCandidateModel"
import type { DiscoveryDecisionResult } from "../discoveryApi"
import type { useDiscoveryDecisions as UseDiscoveryDecisions } from "./useDiscoveryDecisions"

// A minimal synchronous hooks runtime (state slots, memo/callback and effect
// dependencies, refs, cleanup) to drive the Discover decision hook the way
// LobbyScreen does, without a native renderer.
type Slot = {
  value?: unknown
  deps?: readonly unknown[]
  cleanup?: (() => void) | void
  current?: unknown
}

function depsChanged(previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) {
  if (!previous || !next) return true
  return next.length !== previous.length ||
    next.some((value, index) => !Object.is(value, previous[index]))
}

function createHookRuntime() {
  const slots: Slot[] = []
  let cursor = 0
  let effects: (() => void)[] = []
  const react = {
    useState<T>(initial: T | (() => T)) {
      const index = cursor++
      if (!slots[index]) {
        slots[index] = {
          value: typeof initial === "function" ? (initial as () => T)() : initial
        }
      }
      const slot = slots[index]
      const setState = (next: T | ((current: T) => T)) => {
        slot.value = typeof next === "function"
          ? (next as (current: T) => T)(slot.value as T)
          : next
      }
      return [slot.value as T, setState] as const
    },
    useRef<T>(initial: T) {
      const index = cursor++
      if (!slots[index]) slots[index] = { current: initial }
      return slots[index] as { current: T }
    },
    useMemo<T>(calculate: () => T, deps: readonly unknown[]) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || depsChanged(previous.deps, deps)) {
        slots[index] = { value: calculate(), deps }
      }
      return slots[index].value as T
    },
    useCallback<T>(callback: T, deps: readonly unknown[]) {
      return react.useMemo(() => callback, deps)
    },
    useEffect(effect: () => (() => void) | void, deps?: readonly unknown[]) {
      const index = cursor++
      const previous = slots[index]
      if (previous && !depsChanged(previous.deps, deps)) return
      slots[index] = { deps, cleanup: previous?.cleanup }
      effects.push(() => {
        slots[index].cleanup?.()
        slots[index].cleanup = effect()
      })
    }
  }

  function render<T>(hook: () => T): T {
    cursor = 0
    effects = []
    const result = hook()
    for (const effect of effects) effect()
    return result
  }

  function unmount() {
    for (const slot of slots) slot?.cleanup?.()
  }

  return { react, render, unmount }
}

interface Harness {
  decideCalls: { userId: string; decision: string }[]
  decide: (userId: string, decision: "like" | "pass") => Promise<DiscoveryDecisionResult>
  events: { name: string; properties: unknown }[]
  toasts: { title: string; body?: string }[]
  haptics: string[]
  swipeReturns: { cardId: string; direction: "left" | "right"; reduceMotion: boolean }[]
  reduceMotion: boolean
  skipped: { ownerUserId: string; userId: string }[]
  hydrations: string[]
  scheduledNavigations: { navigate: () => void; cancelled: boolean }[]
  matchCreatedReporter: DiscoveryMatchCreatedReporter
}

function loadHook(runtime: ReturnType<typeof createHookRuntime>, harness: Harness) {
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = loader._load
  const swipeValues = { x: { value: 12 }, ownerId: { value: "user-b" } }
  loader._load = function load(request, parent, isMain) {
    if (request === "react") return runtime.react
    if (request === "../useDiscoverSwipeValues") {
      // The card drag lives in Reanimated shared values; a plain holder stands in.
      return {
        useDiscoverSwipeValues: () => swipeValues,
        // The return spring runs on the UI thread; record it and land where it settles.
        returnDiscoverSwipeCard: (
          values: typeof swipeValues,
          input: Harness["swipeReturns"][number]
        ) => {
          harness.swipeReturns.push(input)
          values.ownerId.value = input.cardId
          values.x.value = 0
        }
      }
    }
    if (request === "../discoveryDecisionRetry") {
      // The real retry policy without its backoff waits.
      const real = originalLoad.call(this, request, parent, isMain) as Record<string, unknown>
      return { ...real, DISCOVERY_DECISION_RETRY_DELAYS_MS: [0, 0] }
    }
    if (request === "../../../ui/animations") {
      return { useReducedMotion: () => harness.reduceMotion }
    }
    if (request === "@react-navigation/native") {
      return {
        useFocusEffect: (callback: () => (() => void) | void) => {
          runtime.react.useEffect(callback, [callback])
        }
      }
    }
    if (request === "../../../config/env") return { MOBILE_HTTP_BASE_URL: "https://api.example.test" }
    if (request === "../../../analytics/productAnalytics") {
      return {
        captureProductEvent: (name: string, properties: unknown) => {
          harness.events.push({ name, properties })
        }
      }
    }
    if (request === "../../connections/savedConnectionsStore") {
      return {
        skipDiscoveryCandidate: async (input: { ownerUserId: string; userId: string }) => {
          harness.skipped.push(input)
        }
      }
    }
    if (request === "../../inventory/inventoryStore") {
      return {
        useInventoryStore: () => ({
          hydrateFromServer: async (token: string) => { harness.hydrations.push(token) }
        })
      }
    }
    if (request === "../../../ui/toast") {
      return {
        showToast: (toast: { title: string; body?: string }) => { harness.toasts.push(toast) }
      }
    }
    if (request === "../../../ui/haptics") {
      return {
        hapticLight: () => { harness.haptics.push("light") },
        hapticError: () => { harness.haptics.push("error") }
      }
    }
    if (request === "../matchResultNavigation") {
      return {
        scheduleMatchResultNavigation: (navigate: () => void) => {
          const entry = { navigate, cancelled: false }
          harness.scheduledNavigations.push(entry)
          return () => { entry.cancelled = true }
        }
      }
    }
    if (request === "../../matches/discoveryMatchCreatedRuntime") {
      return {
        reportDiscoveryMatchCreated: (input: Parameters<DiscoveryMatchCreatedReporter["report"]>[0]) =>
          harness.matchCreatedReporter.report(input)
      }
    }
    if (request === "../discoveryApi") {
      const real = originalLoad.call(this, request, parent, isMain) as Record<string, unknown>
      return {
        ...real,
        decideDiscoverProfile: (
          _baseHttpUrl: string,
          _token: string,
          userId: string,
          decision: "like" | "pass"
        ) => {
          harness.decideCalls.push({ userId, decision })
          return harness.decide(userId, decision)
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const requireFromHere = createRequire(resolve(import.meta.dirname, "index.ts"))
    const modulePath = requireFromHere.resolve("./useDiscoveryDecisions")
    delete requireFromHere.cache[modulePath]
    return (requireFromHere(modulePath) as {
      useDiscoveryDecisions: typeof UseDiscoveryDecisions
    }).useDiscoveryDecisions
  } finally {
    loader._load = originalLoad
  }
}

const copy = getLobbyFeedbackCopy("en")
const quota = (remaining: number) => ({ remaining }) as unknown as DiscoveryDecisionQuota

function candidate(userId: string): DiscoveryCandidate {
  return {
    userId,
    displayName: `${userId} name`,
    spotId: `backend:${userId}`,
    decisionCapability: "mutual-like",
    blocked: false
  }
}

function liveCandidate(userId: string): DiscoveryCandidate {
  return { ...candidate(userId), decisionCapability: "live-invite" }
}

function decisionResult(
  userId: string,
  decision: "like" | "pass",
  matched = false,
  options: { matchId?: string; fromUserId?: string } = {}
): DiscoveryDecisionResult {
  const fromUserId = options.fromUserId ?? "me"
  return {
    decision: { fromUserId, toUserId: userId, decision, decidedAt: "2026-09-30T10:00:00.000Z" },
    matched,
    match: matched
      ? {
          matchId: options.matchId ?? "match-1",
          participantUserIds: [fromUserId, userId],
          matchedAt: "2026-09-30T10:00:00.000Z"
        }
      : null,
    quota: quota(7)
  }
}

function mount(options: {
  mode?: "production" | "demo"
  featured?: DiscoveryCandidate | null
  sources?: DiscoveryCandidate[]
  params?: Record<string, unknown>
  sendInviteResult?: boolean
  decide?: Harness["decide"]
  userId?: string
  /** Shared across mounts to model the device's persisted analytics store over an app restart. */
  analyticsStorage?: Map<string, string>
  analyticsConsent?: () => boolean
  reduceMotion?: boolean
} = {}) {
  const runtime = createHookRuntime()
  const analyticsStorage = options.analyticsStorage ?? new Map<string, string>()
  const events: Harness["events"] = []
  const harness: Harness = {
    decideCalls: [],
    decide: options.decide ?? (async (userId, decision) => decisionResult(userId, decision)),
    events,
    toasts: [],
    haptics: [],
    swipeReturns: [],
    reduceMotion: options.reduceMotion ?? false,
    skipped: [],
    hydrations: [],
    scheduledNavigations: [],
    // Each mount is a fresh app process: in-memory state resets, storage persists.
    matchCreatedReporter: createDiscoveryMatchCreatedReporter({
      storage: {
        getItem: async (key) => analyticsStorage.get(key) ?? null,
        setItem: async (key, value) => { analyticsStorage.set(key, value) }
      },
      isCaptureEnabled: options.analyticsConsent ?? (() => true),
      captureMatchCreated: (properties) => { events.push({ name: "match_created", properties }) }
    })
  }
  const useDiscoveryDecisions = loadHook(runtime, harness)
  let seen = new Set<string>()
  const setSeen = (next: Set<string> | ((current: Set<string>) => Set<string>)) => {
    seen = typeof next === "function" ? next(seen) : next
  }
  const quotas: DiscoveryDecisionQuota[] = []
  const feedback: { text: string; tone: string }[] = []
  const navigations: { name: string; params?: unknown }[] = []
  const paramUpdates: Record<string, unknown>[] = []
  const invitesSent: string[] = []
  const pendingInvites: PendingInviteMemory[] = []
  const route = { key: "Lobby", name: "Lobby", params: options.params ?? {} }
  const navigation = {
    navigate: (name: string, params?: unknown) => { navigations.push({ name, params }) },
    isFocused: () => true,
    setParams: (params: Record<string, unknown>) => {
      paramUpdates.push(params)
      route.params = { ...route.params, ...params }
    }
  }
  const sessionActor = {
    session: { mode: options.mode ?? "production", sessionToken: "token-1" },
    profile: { userId: options.userId ?? "me", displayName: "Me", avatar: undefined }
  } as unknown as SessionActor
  const stable = {
    markCandidateSeen: (userId: string) => setSeen((current) => new Set([...current, userId])),
    setSeenThisSessionUserIds: setSeen,
    updateProductionQuota: (next: DiscoveryDecisionQuota) => { quotas.push(next) },
    showDiscoverFeedback: (text: string, tone: "soft" | "warm") => { feedback.push({ text, tone }) },
    sendInvite: (userId: string) => {
      invitesSent.push(userId)
      return options.sendInviteResult ?? true
    },
    addPendingInvite: (invite: PendingInviteMemory) => { pendingInvites.push(invite) }
  }
  const featured = options.featured === undefined ? candidate("user-a") : options.featured
  const sources = options.sources ?? (featured ? [featured] : [])
  const render = () => runtime.render(() => useDiscoveryDecisions({
    sessionActor,
    isProductionDiscovery: sessionActor.session.mode === "production",
    navigation: navigation as never,
    route: route as never,
    lobbyCopy: copy,
    featuredCandidate: featured,
    discoverSourceUsers: sources,
    ...stable
  }))
  let hook = render()
  const settle = async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolveTurn) => setImmediate(resolveTurn))
      hook = render()
    }
  }
  return {
    runtime,
    harness,
    get hook() { return hook },
    rerender: () => { hook = render() },
    settle,
    get seen() { return seen },
    quotas,
    feedback,
    navigations,
    paramUpdates,
    invitesSent,
    pendingInvites
  }
}

test("a production like advances optimistically, saves the quota and sends one activation event", async () => {
  let release: () => void = () => undefined
  const view = mount({
    decide: (userId, decision) => new Promise((resolveDecision) => {
      release = () => resolveDecision(decisionResult(userId, decision))
    })
  })

  view.hook.handlePrimaryLike()
  view.rerender()
  assert.deepEqual([...view.seen], ["user-a"], "the card leaves the deck before the server answers")
  assert.deepEqual([...view.hook.inFlightDecisionUserIds], ["user-a"])

  view.hook.handlePrimaryLike()
  view.hook.handleSkipFeatured()
  assert.equal(view.harness.decideCalls.length, 1, "an in-flight card cannot be decided twice")

  release()
  await view.settle()
  assert.deepEqual(view.harness.decideCalls, [{ userId: "user-a", decision: "like" }])
  assert.deepEqual(view.quotas, [quota(7)])
  assert.deepEqual(view.feedback, [{ text: copy.liked, tone: "warm" }])
  assert.deepEqual(view.harness.events.map((event) => event.name), [
    "discovery_decision",
    "activation_first_discovery_decision"
  ])
  assert.deepEqual(view.harness.events[0].properties, { decision: "like", mode: "production" })
  assert.equal(view.hook.inFlightDecisionUserIds.size, 0)
  assert.equal(view.navigations.length, 0)
})

test("a mutual production like refreshes inventory and schedules MatchResult, cancelled on blur", async () => {
  const view = mount({ decide: async (userId, decision) => decisionResult(userId, decision, true) })

  view.hook.handlePrimaryLike()
  await view.settle()

  assert.deepEqual(view.harness.hydrations, ["token-1"])
  assert.deepEqual(view.feedback, [{ text: copy.matched, tone: "warm" }])
  assert.equal(view.harness.scheduledNavigations.length, 1)
  view.harness.scheduledNavigations[0].navigate()
  assert.equal(view.navigations[0].name, "MatchResult")
  const match = (view.navigations[0].params as { match: { id: string; matchedUser: { userId: string } } }).match
  assert.equal(match.id, "match-1")
  assert.equal(match.matchedUser.userId, "user-a")

  view.runtime.unmount()
  assert.equal(view.harness.scheduledNavigations[0].cancelled, true)
})

test("a failed production decision restores the card and resets the drag", async () => {
  const view = mount({ decide: async () => { throw new Error("network down") } })

  view.hook.handleSkipFeatured()
  await view.settle()

  // A dropped connection is retried twice in the background before the card returns.
  assert.deepEqual(view.harness.decideCalls, Array.from({ length: 3 }, () => ({ userId: "user-a", decision: "pass" })))
  assert.equal(view.seen.size, 0)
  const drag = view.hook.cardDragX as unknown as { x: { value: number }; ownerId: { value: string } }
  assert.equal(drag.x.value, 0)
  // The restored card owns the drag, so it is the card that springs back.
  assert.equal(drag.ownerId.value, "user-a")
  assert.deepEqual(view.harness.swipeReturns, [{ cardId: "user-a", direction: "left", reduceMotion: false }])
  assert.deepEqual(view.harness.haptics, ["error"], "one error (the deck played the commit at release)")
  assert.deepEqual(view.harness.toasts, [{ title: "That choice wasn't saved. Check your connection and try again.", type: "warning" }])
  assert.deepEqual(view.feedback, [{ text: copy.retry, tone: "soft" }])
  assert.deepEqual(view.harness.events, [])
})

test("an exhausted quota keeps the server quota and says so", async () => {
  const view = mount()
  const { DiscoveryDecisionQuotaExhaustedError } = await import("../discoveryApi")
  view.harness.decide = async () => { throw new DiscoveryDecisionQuotaExhaustedError(quota(0)) }

  view.hook.handlePrimaryLike()
  await view.settle()

  assert.deepEqual(view.quotas, [quota(0)])
  assert.equal(view.harness.toasts[0].title, copy.quota)
  assert.equal(view.seen.size, 0)
})

test("a decision the server refuses as not eligible drops the card instead of springing it back", async () => {
  const view = mount()
  const { DiscoveryDecisionNotEligibleError } = await import("../discoveryApi")
  view.harness.decide = async () => { throw new DiscoveryDecisionNotEligibleError() }

  view.hook.handlePrimaryLike()
  await view.settle()

  // Retrying can never succeed (banned, matched elsewhere, filtered out or a
  // recent pass), so the card must not return to the deck to fail again.
  assert.deepEqual([...view.seen], ["user-a"])
  assert.deepEqual(view.harness.swipeReturns, [])
  assert.deepEqual(view.harness.haptics, [], "no error haptic for a card that simply left")
  assert.deepEqual(view.harness.toasts, [])
  assert.deepEqual(view.feedback, [{ text: copy.unavailable, tone: "soft" }])
  assert.deepEqual(view.harness.events, [], "nothing was decided")
  assert.equal(view.hook.inFlightDecisionUserIds.size, 0)
})

test("ProfilePreview bounces decide through the production API or report an unavailable profile", async () => {
  const known = mount({ params: { pendingPassUserId: "user-a" } })
  await known.settle()
  assert.deepEqual(known.harness.decideCalls, [{ userId: "user-a", decision: "pass" }])
  assert.deepEqual(known.paramUpdates, [{ pendingPassUserId: undefined }])

  const unknown = mount({ params: { pendingLikeUserId: "gone" } })
  await unknown.settle()
  assert.equal(unknown.harness.decideCalls.length, 0)
  assert.deepEqual(unknown.feedback, [{ text: copy.unavailable, tone: "soft" }])
  assert.deepEqual(unknown.paramUpdates, [{ pendingLikeUserId: undefined }])
  assert.deepEqual(unknown.invitesSent, [], "production never falls through to a lobby invite")
})

test("a completed ProfilePreview decision marks the card seen and records activation once", async () => {
  const view = mount({
    params: { completedProductionDecision: { decision: "like", userId: "user-b", quota: quota(3) } }
  })
  await view.settle()

  assert.deepEqual([...view.seen], ["user-b"])
  assert.deepEqual(view.quotas, [quota(3)])
  assert.deepEqual(view.harness.events, [{
    name: "activation_first_discovery_decision",
    properties: { decision: "like", mode: "production" }
  }])
  assert.deepEqual(view.paramUpdates, [{ completedProductionDecision: undefined }])
})

test("production card decisions add no haptic of their own: the deck plays the commit at release (DSC-10)", async () => {
  let release: () => void = () => undefined
  const production = mount({
    decide: (userId, decision) => new Promise((resolveDecision) => {
      release = () => resolveDecision(decisionResult(userId, decision))
    })
  })
  production.hook.handlePrimaryLike()
  production.rerender()
  production.hook.handlePrimaryLike()
  production.hook.handleSkipFeatured()
  release()
  await production.settle()
  assert.deepEqual(production.harness.haptics, [])

  const pass = mount()
  pass.hook.handleSkipFeatured()
  await pass.settle()
  assert.deepEqual(pass.harness.haptics, [])

  const refused = mount({ mode: "demo", featured: liveCandidate("user-c"), sendInviteResult: false })
  refused.hook.handlePrimaryLike()
  assert.deepEqual(refused.harness.haptics, [])

  const lobby = mount({ mode: "demo", featured: liveCandidate("user-c") })
  lobby.hook.handlePrimaryLike()
  lobby.hook.handleSkipFeatured()
  assert.deepEqual(lobby.harness.haptics, ["light", "light"])
})

test("a dropped connection is retried in the background; the card stays gone once the decision lands", async () => {
  let attempts = 0
  const view = mount({
    decide: async (userId, decision) => {
      attempts += 1
      if (attempts === 1) throw new TypeError("Network request failed")
      return decisionResult(userId, decision)
    }
  })
  view.hook.handlePrimaryLike()
  await view.settle()
  assert.equal(attempts, 2)
  assert.deepEqual([...view.seen], ["user-a"])
  assert.deepEqual(view.harness.swipeReturns, [])
  assert.deepEqual(view.harness.toasts, [])
  assert.deepEqual(view.feedback, [{ text: copy.liked, tone: "warm" }])
})

test("the swiper's answer decides the realtime match moment: matched suppresses it, not matched releases it once", async () => {
  const { discoveryMatchDelivery } = await import("../../matches/discoveryMatchDelivery")
  discoveryMatchDelivery.reset()
  const presented: string[] = []
  const present = () => { presented.push("modal") }
  const event = { miniRoomId: "match_match-1", partnerUserId: "user-a" }

  let releaseMatched: () => void = () => undefined
  const matched = mount({
    decide: (userId, decision) => new Promise((resolveDecision) => {
      releaseMatched = () => resolveDecision(decisionResult(userId, decision, true))
    })
  })
  matched.hook.handlePrimaryLike()
  // The realtime event can beat the HTTP answer.
  assert.equal(discoveryMatchDelivery.routeRealtimeMatch("me", event, present), "deferred")
  releaseMatched()
  await matched.settle()
  assert.equal(matched.harness.scheduledNavigations.length, 1, "the route shows the match")
  assert.deepEqual(presented, [], "no second moment")
  assert.equal(discoveryMatchDelivery.routeRealtimeMatch("me", event, present), "suppressed")

  discoveryMatchDelivery.reset()
  let releaseLate: () => void = () => undefined
  const simultaneous = mount({
    decide: (userId, decision) => new Promise((resolveDecision) => {
      releaseLate = () => resolveDecision(decisionResult(userId, decision))
    })
  })
  simultaneous.hook.handlePrimaryLike()
  assert.equal(discoveryMatchDelivery.routeRealtimeMatch("me", event, present), "deferred")
  releaseLate()
  await simultaneous.settle()
  assert.deepEqual(presented, ["modal"], "the partner's like created it: shown exactly once")
  discoveryMatchDelivery.reset()
})

test("outside production a refused lobby invite records nothing", () => {
  const view = mount({ mode: "demo", featured: liveCandidate("user-c"), sendInviteResult: false })

  view.hook.handlePrimaryLike()

  assert.deepEqual(view.invitesSent, ["user-c"])
  assert.deepEqual(view.harness.toasts, [{ title: copy.inviteTitle, body: copy.inviteBody, type: "warning" }])
  assert.deepEqual(view.feedback, [{ text: copy.inviteFeedback, tone: "soft" }])
  assert.deepEqual(view.pendingInvites, [])
  assert.equal(view.seen.size, 0)
  assert.deepEqual(view.harness.events, [])
})

test("outside production a delivered invite is pending and a skip is stored locally", () => {
  const view = mount({ mode: "demo", featured: liveCandidate("user-c") })

  view.hook.handlePrimaryLike()
  assert.deepEqual(view.pendingInvites.map((invite) => invite.userId), ["user-c"])
  assert.deepEqual([...view.seen], ["user-c"])
  assert.deepEqual(view.feedback, [{ text: copy.inviteSent, tone: "warm" }])
  assert.deepEqual(view.harness.events.map((event) => event.properties), [
    { decision: "like", mode: "demo" },
    { decision: "like", mode: "demo" }
  ])

  view.hook.handleSkipFeatured()
  assert.deepEqual(view.harness.skipped, [{ ownerUserId: "me", userId: "user-c" }])
  assert.equal(view.harness.decideCalls.length, 0)
  assert.equal(
    view.harness.events.filter((event) => event.name === "activation_first_discovery_decision").length,
    1,
    "activation is captured once per Discover session"
  )
})

const matchCreated = (events: Harness["events"]) =>
  events.filter((event) => event.name === "match_created")

test("a server-confirmed mutual like emits match_created once with source discovery", async () => {
  const view = mount({ decide: async (userId, decision) => decisionResult(userId, decision, true) })

  view.hook.handlePrimaryLike()
  await view.settle()

  assert.deepEqual(matchCreated(view.harness.events), [{
    name: "match_created",
    properties: { source: "discovery", mode: "production" }
  }])
  // Re-navigation to (and "View match" replays of) MatchResult never report.
  view.harness.scheduledNavigations[0].navigate()
  view.harness.scheduledNavigations[0].navigate()
  await view.settle()
  assert.equal(matchCreated(view.harness.events).length, 1)
})

test("a like without a server match and a pass never emit match_created", async () => {
  const liked = mount()
  liked.hook.handlePrimaryLike()
  await liked.settle()
  assert.deepEqual(matchCreated(liked.harness.events), [])

  const passed = mount({ decide: async (userId, decision) => decisionResult(userId, decision, true) })
  passed.hook.handleSkipFeatured()
  await passed.settle()
  assert.deepEqual(matchCreated(passed.harness.events), [], "only a like can create a match")
})

test("a retried decision and an app restart that return the same server match emit once", async () => {
  const analyticsStorage = new Map<string, string>()
  const mutual: Harness["decide"] = async (userId, decision) => decisionResult(userId, decision, true)

  const first = mount({ decide: mutual, analyticsStorage })
  first.hook.handlePrimaryLike()
  await first.settle()
  first.hook.handlePrimaryLike()
  await first.settle()
  assert.equal(first.harness.decideCalls.length, 2)
  assert.equal(matchCreated(first.harness.events).length, 1)

  const afterRestart = mount({ decide: mutual, analyticsStorage })
  afterRestart.hook.handlePrimaryLike()
  await afterRestart.settle()
  assert.deepEqual(matchCreated(afterRestart.harness.events), [])

  const newMatch = mount({
    decide: async (userId, decision) => decisionResult(userId, decision, true, { matchId: "match-2" }),
    analyticsStorage
  })
  newMatch.hook.handlePrimaryLike()
  await newMatch.settle()
  assert.equal(matchCreated(newMatch.harness.events).length, 1)
})

test("dedupe is scoped to the signed-in account", async () => {
  const analyticsStorage = new Map<string, string>()
  const mine = mount({ decide: async (userId, decision) => decisionResult(userId, decision, true), analyticsStorage })
  mine.hook.handlePrimaryLike()
  await mine.settle()

  const other = mount({
    userId: "other",
    decide: async (userId, decision) => decisionResult(userId, decision, true, { fromUserId: "other" }),
    analyticsStorage
  })
  other.hook.handlePrimaryLike()
  await other.settle()

  assert.equal(matchCreated(mine.harness.events).length, 1)
  assert.equal(matchCreated(other.harness.events).length, 1)
  for (const [key, value] of analyticsStorage) {
    assert.doesNotMatch(value, /name|user-a/, `${key} persists only match ids`)
  }
})

test("with analytics consent off a mutual like emits and stores nothing", async () => {
  const analyticsStorage = new Map<string, string>()
  const view = mount({
    decide: async (userId, decision) => decisionResult(userId, decision, true),
    analyticsStorage,
    analyticsConsent: () => false
  })

  view.hook.handlePrimaryLike()
  await view.settle()

  assert.deepEqual(matchCreated(view.harness.events), [])
  assert.equal(analyticsStorage.size, 0)
  assert.equal(view.harness.scheduledNavigations.length, 1, "the match itself is still shown")
})

test("a refused like springs back from the right with one error haptic; Reduce Motion lands at once", async () => {
  const liked = mount({ decide: async () => { throw new Error("network down") } })
  liked.hook.handlePrimaryLike()
  await liked.settle()
  assert.deepEqual(liked.harness.swipeReturns, [{ cardId: "user-a", direction: "right", reduceMotion: false }])
  assert.deepEqual(liked.harness.haptics, ["error"])

  const { DiscoveryDecisionQuotaExhaustedError } = await import("../discoveryApi")
  const exhausted = mount({ reduceMotion: true })
  exhausted.harness.decide = async () => { throw new DiscoveryDecisionQuotaExhaustedError(quota(0)) }
  exhausted.hook.handlePrimaryLike()
  await exhausted.settle()
  assert.deepEqual(exhausted.harness.swipeReturns, [{ cardId: "user-a", direction: "right", reduceMotion: true }])
  assert.deepEqual(exhausted.harness.haptics, ["error"])

  const saved = mount()
  saved.hook.handlePrimaryLike()
  await saved.settle()
  assert.deepEqual(saved.harness.swipeReturns, [], "a saved decision never brings the card back")
  assert.deepEqual(saved.harness.haptics, [])
})
