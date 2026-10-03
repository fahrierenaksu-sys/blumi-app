import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createInertModule,
  createReactNativeStub,
  loadSourceWithFakeReact,
  type FakeReactRuntime
} from "../testing/hookHarness"
import { requestMainTabPagerPage } from "./mainTabPager/mainTabPagerController"
import { createChatCoordinator, type ChatCoordinatorDependencies } from "../features/chat/chatCoordinator"
import type { ChatRoomInviteTimelineItem } from "../features/chat/chatRoomInviteModel"

// Render-count evidence for SYS-2 / SYS-3 / PERF-1 (UX audit 2026-09-30).
// The hook harness renders one component function at a time, so these tests
// count renders of the root navigator and compare the props each memoised
// child (pager page, bottom bar) receives: a memoised child whose props are
// shallowly equal does not re-render.

type Element = { type: unknown; props: Record<string, unknown> & { children?: unknown }; key?: unknown }

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && "props" in value && "type" in value
}

function collectElements(node: unknown, predicate: (element: Element) => boolean, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, predicate, found)
    return found
  }
  if (!isElement(node)) return found
  if (predicate(node)) found.push(node)
  for (const value of Object.values(node.props ?? {})) {
    if (Array.isArray(value) || isElement(value)) collectElements(value, predicate, found)
  }
  return found
}

function typeName(element: Element): string | undefined {
  return typeof element.type === "function" ? element.type.name : undefined
}

function changedProps(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((key) => key !== "children" && !Object.is(before[key], after[key])).sort()
}

/** A shared value that keeps its identity across renders, like Reanimated's. */
function createReanimatedStub(runtime: FakeReactRuntime) {
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  const useSharedValue = <T>(initial: T) => {
    const ref = useRef<{ value: T } | null>(null)
    if (!ref.current) ref.current = { value: initial }
    return ref.current
  }
  return {
    __esModule: true,
    default: { View: "Animated.View" },
    cancelAnimation: () => undefined,
    useAnimatedReaction: () => undefined,
    useAnimatedStyle: () => ({}),
    useSharedValue,
    withSpring: (value: number) => value
  }
}

// ── Pager: a tab change reaches only the pages whose selection flips ──────

function mountPager(renderPage: (...args: unknown[]) => unknown) {
  const runtime = createFakeReactRuntime()
  const indicator = { progress: { value: 0 }, tracking: { value: false }, selection: { value: -1 } }
  const dispatched: unknown[] = []
  const exports = loadSourceWithFakeReact<{ MainTabPager: (props: Record<string, unknown>) => unknown }>(
    "navigation/mainTabPager/MainTabPager.tsx",
    runtime,
    {
      modules: {
        "@react-navigation/native": {
          NavigationContext: { Provider: "NavigationContext.Provider" },
          NavigationRouteContext: { Provider: "NavigationRouteContext.Provider" }
        },
        "react-native": createReactNativeStub({
          BackHandler: { addEventListener: () => ({ remove: () => undefined }) }
        }).module,
        "react-native-gesture-handler": createInertModule("gesture-handler"),
        "react-native-reanimated": createReanimatedStub(runtime),
        "react-native-worklets": {
          scheduleOnRN: (work: (...args: unknown[]) => void, ...args: unknown[]) => work(...args),
          scheduleOnUI: (work: (...args: unknown[]) => void, ...args: unknown[]) => work(...args)
        },
        "../../ui/animations": { useReducedMotion: () => false },
        "../../ui/errorBoundary": { ErrorBoundary: "ErrorBoundary" },
        "../../ui/mainTabPagerIndicator": { mainTabPagerIndicator: indicator },
        "../../ui/theme": { uiTheme: { colors: { background: "#fff" } } },
        "../../ui/MainTabPagerGestureOwnership": { MainTabPagerGestureProvider: "MainTabPagerGestureProvider" }
      },
      real: [
        "./mainTabPagerConfig",
        "./mainTabPagerModel",
        "./mainTabPageFocus",
        "./mainTabPagerController",
        "./mainTabPagerRouter",
        "../../ui/layout/bottomNavIndicatorModel"
      ],
      // Neighbour warm-up is idle work; keep it out of these counts.
      globals: { setTimeout: () => 0, clearTimeout: () => undefined }
    }
  )
  let route = { key: "slot", name: "Lobby" }
  const navigation = {
    isFocused: () => true,
    addListener: () => () => undefined,
    setParams: () => undefined,
    dispatch: (action: unknown) => { dispatched.push(action) },
    getState: () => ({ key: "stack", routes: [route] })
  }
  const pages = () => collectElements(runtime.output, (element) => typeName(element) === "MainTabPagerPage")
    .map((element) => element.props)
  runtime.render(() => exports.MainTabPager({ navigation, route, renderPage, bottomBar: null }))
  return {
    runtime,
    indicator,
    dispatched,
    pages,
    select(name: string) {
      route = { key: "slot", name }
      runtime.rerender()
    }
  }
}

test("a tab change re-renders only the two pages whose selection flips (was all four)", () => {
  const renderPage = () => null
  const pager = mountPager(renderPage)
  pager.select("Inbox")
  const before = pager.pages()
  pager.select("MyRoom")
  const after = pager.pages()
  const changed = before
    .map((props, index) => ({ routeName: props.routeName, changed: changedProps(props, after[index]!) }))
    .filter((entry) => entry.changed.length > 0)
  assert.deepEqual(changed.map((entry) => entry.routeName), ["Inbox", "MyRoom"])
  for (const entry of changed) assert.deepEqual(entry.changed.filter((key) => key !== "mounted"), ["isSelected"])
  assert.ok(after.every((props) => props.renderPage === renderPage), "the page renderer reaches pages unchanged")
})

test("a page whose selection did not change keeps every prop across an unrelated pager render", () => {
  const pager = mountPager(() => null)
  const before = pager.pages()
  pager.runtime.rerender()
  const after = pager.pages()
  assert.deepEqual(before.map((props, index) => changedProps(props, after[index]!)), [[], [], [], []])
})

test("a bottom-bar tap snaps the pager on the UI thread before navigation answers", () => {
  const pager = mountPager(() => null)
  // Inbox was never visited: it is not mounted, so the tap waits for the route.
  // Make it mounted first by visiting it, then return to Discover.
  pager.select("Inbox")
  pager.select("Lobby")
  assert.equal(requestMainTabPagerPage("chats"), true)
  // The UI thread already shows Chats (selection published to the bottom bar)
  // while the JS commit is the single navigation for the tap.
  assert.equal(pager.indicator.selection.value, 1)
  assert.equal(pager.dispatched.length, 1)
})

// ── Root navigator: unread and connection changes stay out of the root ────

/** What the stubbed model hands out as the detail (native push) options. */
const DETAIL_OPTIONS_STUB = Object.freeze({ stub: "detail push" })

function mountRoot(nativeIdle = true) {
  const runtime = createFakeReactRuntime()
  const unreadListeners = new Set<() => void>()
  let unread = 0
  const statusListeners = new Set<(status: string) => void>()
  const useState = runtime.react.useState as <T>(initial: T) => [T, (next: T) => void]
  const useEffect = runtime.react.useEffect as (run: () => void | (() => void), deps?: unknown[]) => void
  const useSyncExternalStore = runtime.react.useSyncExternalStore as <T>(
    subscribe: (listener: () => void) => () => void,
    read: () => T
  ) => T
  const stable = <T extends object>(value: T) => value
  const sessionActor = {
    session: { mode: "production", sessionToken: "token", onboarding: { completedAt: "x", avatar: "complete", room: "complete" } },
    profile: { userId: "user-a", displayName: "Ada", avatar: {} }
  }
  const capabilities = { chat_read_receipts: false }
  const sessionState = stable({
    sessionActor,
    hasSeenIntro: true,
    isHydrating: false,
    isBootstrapping: false,
    errorMessage: null,
    accountModeration: null,
    resolvedCapabilities: capabilities,
    clearSessionActor: async () => undefined,
    updateSessionProfile: async () => undefined,
    saveAvatarSelectionOutcome: async () => undefined
  })
  const chatSync = stable({
    applyRealtimeThreadList: () => undefined,
    applyNewThread: () => undefined,
    refreshProductionThreads: async () => undefined,
    resynchronizeMessages: async () => undefined,
    upsertRoomInvite: () => undefined,
    warmThreadMessagesForInbox: async () => undefined,
    chatThreadBindings: {}
  })
  const bottomNavChrome = stable({
    syncCurrentRouteName: () => undefined,
    handleBottomNavPress: () => undefined,
    screenListeners: () => ({})
  })
  const demoStore = stable({ roomInvites: [], matchedProfiles: [] })
  // Room invites live in the navigator's state, as in useRoomInviteRouting.
  let setRoomInvites: ((update: (current: ChatRoomInviteTimelineItem[]) => ChatRoomInviteTimelineItem[]) => void) | null = null
  const roomInviteRouting = {
    openReadyMiniRoom: () => undefined,
    handleDemoRoomInviteAction: () => undefined,
    resetRoomInviteRouting: () => undefined
  }
  const inventory = stable({ claimDailyRewardFromServer: async () => 0, hydrateFromServer: async () => ({ success: false }) })
  let navigationReady = false
  let currentRouteName = "Lobby"
  const navigationStateListeners = new Set<() => void>()
  const indicator = { tracking: { value: false } }
  const preloaded: string[] = []
  let nextTaskId = 1
  let timers = new Map<number, () => void>()
  let idleCallbacks = new Map<number, () => void>()
  const screenBundles = Object.fromEntries([
    "myRoom", "cosmeticShop", "wardrobeV2", "myRoomEditor", "settings", "legal"
  ].map((name) => [`${name}ScreenBundle`, {
    DeferredScreen: `${name}Screen`,
    preload: () => { preloaded.push(name) }
  }]))
  const exports = loadSourceWithFakeReact<{ RootNavigator: () => unknown }>("navigation/RootNavigator.tsx", runtime, {
    inertUnknown: true,
    modules: {
      "react-native": createReactNativeStub().module,
      "../features/chat/chatStore": {
        resetChatStore: () => undefined,
        useTotalUnreadCount: () => useSyncExternalStore((listener) => {
          unreadListeners.add(listener)
          return () => unreadListeners.delete(listener)
        }, () => unread)
      },
      "../features/realtime/globalRealtimeProvider": {
        disconnectGlobal: () => undefined,
        getGlobalStatus: () => "connected",
        subscribeToStatus: (listener: (status: string) => void) => {
          statusListeners.add(listener)
          return () => statusListeners.delete(listener)
        },
        useGlobalRealtime: () => {
          const [status, setStatus] = useState("connected")
          useEffect(() => {
            statusListeners.add(setStatus)
            return () => { statusListeners.delete(setStatus) }
          }, [])
          return { connectionStatus: status, send: () => true }
        }
      },
      "../features/demo/demoStore": { isDemoMode: () => false, setDemoMode: () => undefined, useDemoStore: () => demoStore },
      "../features/session/useSessionState": { useSessionState: () => sessionState },
      "../features/session/sessionRouting": { selectSessionEntryRoute: () => "Main" },
      "../features/session/onboardingFlowModel": {
        getOnboardingScreenMode: () => "create",
        shouldGateOnboardingBootPrelude: () => false,
        shouldWaitForPreAuthDraftHydration: () => false,
        getUnauthenticatedNavigatorInitialRoute: () => "AuthEntry",
        getSessionNavigatorKey: () => "main:user-a"
      },
      "../features/session/usePreAuthOnboardingDraft": {
        usePreAuthOnboardingDraft: () => stable({ preAuthDraftScopeId: "pre-auth", isPreAuthDraftHydrating: false })
      },
      "../features/inventory/inventoryStore": { useInventoryStore: () => inventory },
      "../features/inventory/inventoryHydrationPolicy": { shouldHydrateProductionInventory: () => false },
      "../config/env": { IS_BLUMI_PAID_COINS_ENABLED: false, BLUMI_DEV_ENTRY_ROUTE: undefined },
      "./rootNavigationModel": {
        getChatLocale: () => "en",
        getChatThreadScreenOptions: () => ({}),
        getDetailScreenOptions: () => DETAIL_OPTIONS_STUB,
        getReducedMotionScreenOptions: () => ({}),
        getOnboardingEntryRoute: () => null,
        MAIN_TAB_SCREEN_OPTIONS: {},
        ROOT_STACK_SCREEN_OPTIONS: {}
      },
      "./useRootChatSync": { useRootChatSync: () => chatSync },
      "./useRoomInviteRouting": {
        useRoomInviteRouting: () => {
          const [roomInvites, setState] = useState<ChatRoomInviteTimelineItem[]>([])
          setRoomInvites = setState as never
          return { ...roomInviteRouting, visibleRoomInvites: roomInvites, setRoomInvites: setState }
        }
      },
      "./useBottomNavChrome": { useBottomNavChrome: () => bottomNavChrome },
      "./RootNavigationChrome": { MainTabBottomBar: "MainTabBottomBar", RootNavigationChrome: "RootNavigationChrome" },
      "./rootNavigationRef": {
        navigationRef: {
          isReady: () => navigationReady,
          getCurrentRoute: () => ({ name: currentRouteName }),
          addListener: (_type: string, listener: () => void) => {
            navigationStateListeners.add(listener)
            return () => { navigationStateListeners.delete(listener) }
          }
        }
      },
      "./deferredScreenBundles": screenBundles,
      "../ui/mainTabPagerIndicator": { mainTabPagerIndicator: indicator },
      "../ui/animations": { useReducedMotion: () => false },
      "./mainTabPager/renderMainTabPage": { renderMainTabPage: () => null }
    },
    real: ["./mainTabPager/mainTabPagerConfig"],
    globals: {
      setTimeout: (run: () => void) => {
        const id = nextTaskId++
        timers.set(id, run)
        return id
      },
      clearTimeout: (id: number) => { timers.delete(id) },
      globalThis: {
        requestIdleCallback: nativeIdle ? (run: () => void) => {
          const id = nextTaskId++
          idleCallbacks.set(id, run)
          return id
        } : undefined,
        cancelIdleCallback: (id: number) => { idleCallbacks.delete(id) }
      }
    }
  })
  runtime.render(() => exports.RootNavigator())
  const slotScreen = (routeName = "Lobby") => {
    const [screen] = collectElements(runtime.output, (element) =>
      element.props.name === routeName && typeof element.props.children === "function")
    assert.ok(screen, "the main tab slot screen is declared")
    return (screen.props.children as (props: unknown) => Element)({ navigation: {}, route: { key: "slot", name: routeName } })
  }
  const screenOptions = (name: string) => {
    const [screen] = collectElements(runtime.output, (element) => element.props.name === name)
    assert.ok(screen, `${name} is declared`)
    return screen.props.options
  }
  return {
    runtime,
    slotScreen,
    screenOptions,
    preloaded,
    ready() {
      navigationReady = true
      const [container] = collectElements(runtime.output, (element) => typeof element.props.onStateChange === "function")
      assert.ok(container)
      ;(container.props.onReady as () => void)()
    },
    setRoute(name: string) {
      currentRouteName = name
      for (const listener of navigationStateListeners) listener()
    },
    setMoving(moving: boolean) { indicator.tracking.value = moving },
    runTimers() {
      const due = timers
      timers = new Map()
      for (const run of due.values()) run()
    },
    runIdleCallbacks() {
      const due = idleCallbacks
      idleCallbacks = new Map()
      for (const run of due.values()) run()
    },
    setUnread(next: number) {
      unread = next
      for (const listener of [...unreadListeners]) listener()
    },
    setStatus(next: string) {
      for (const listener of [...statusListeners]) listener(next)
    },
    /** The chat coordinator wired to the navigator's invite state, as useRootChatSync wires it. */
    createCoordinator(fetchThreadRoomInvites: () => Promise<ChatRoomInviteTimelineItem[]>) {
      return createChatCoordinator({
        getSessionActor: () => sessionActor,
        isCurrentSession: () => true,
        setRoomInvites: (update: (current: readonly ChatRoomInviteTimelineItem[]) => ChatRoomInviteTimelineItem[]) => setRoomInvites?.((current) => update(current)),
        fetchThreadRoomInvites,
        baseHttpUrl: "https://api.blumi.test"
      } as unknown as ChatCoordinatorDependencies)
    }
  }
}

test("an unread-count change does not re-render the root navigator (was one root render per change)", () => {
  const root = mountRoot()
  const renders = root.runtime.renderCount
  root.setUnread(3)
  root.setUnread(4)
  assert.equal(root.runtime.renderCount - renders, 0)
})

test("a connection-state change does not re-render the root navigator (was one root render per change)", () => {
  const root = mountRoot()
  const renders = root.runtime.renderCount
  root.setStatus("reconnecting")
  root.setStatus("connected")
  assert.equal(root.runtime.renderCount - renders, 0)
})

test("an unchanged room-invite refresh does not re-render the root navigator (was one per refresh)", async () => {
  const root = mountRoot()
  const invite: ChatRoomInviteTimelineItem = {
    kind: "room_invite",
    inviteId: "invite-1",
    threadId: "thread-1",
    senderUserId: "user-a",
    recipientUserId: "user-b",
    createdAt: "2026-10-01T00:00:00.000Z",
    status: "pending"
  }
  // Every refresh answers with fresh objects, as the HTTP client does.
  const coordinator = root.createCoordinator(async () => [{ ...invite }])
  await coordinator.refreshThreadRoomInvites("thread-1")
  const renders = root.runtime.renderCount
  await coordinator.refreshThreadRoomInvites("thread-1")
  await coordinator.refreshThreadRoomInvites("thread-1")
  assert.equal(root.runtime.renderCount - renders, 0)
})

test("a root render hands the pager the same page renderer and bottom-bar props", () => {
  const root = mountRoot()
  const before = root.slotScreen()
  root.runtime.rerender()
  const after = root.slotScreen()
  assert.equal(after.props.renderPage, before.props.renderPage, "pages keep their props, so memoised pages skip")
  const beforeBar = before.props.bottomBar as Element
  const afterBar = after.props.bottomBar as Element
  assert.deepEqual(changedProps(beforeBar.props, afterBar.props), [])
  assert.equal("chatCount" in afterBar.props, false, "the bar reads the unread count itself")
})

test("main-tab changes preserve the bottom bar's React identity and its mounted animation state", () => {
  const root = mountRoot()
  const firstBar = root.slotScreen().props.bottomBar as Element
  for (const routeName of ["Inbox", "MyRoom", "CosmeticShop", "Lobby"]) {
    const nextBar = root.slotScreen(routeName).props.bottomBar as Element
    assert.equal(nextBar.type, firstBar.type)
    assert.equal(nextBar.key, firstBar.key, "React retains the same bar instead of rebuilding its shared values")
    assert.equal(nextBar.props.routeName, routeName)
  }
})

for (const nativeIdle of [true, false]) {
  test(`deferred main screens yield between modules and pause behind detail routes (${nativeIdle ? "idle callback" : "timer fallback"})`, () => {
    const root = mountRoot(nativeIdle)
    const idleSlot = () => {
      root.runTimers()
      root.runIdleCallbacks()
    }
    idleSlot()
    assert.deepEqual(root.preloaded, [], "the navigator must be ready before warming destinations")
    root.ready()
    idleSlot()
    assert.deepEqual(root.preloaded, ["myRoom"], "the first module yields before the next one")
    root.setMoving(true)
    idleSlot()
    assert.deepEqual(root.preloaded, ["myRoom"], "a drag or settle defers module evaluation")
    root.setMoving(false)
    idleSlot()
    assert.deepEqual(root.preloaded, ["myRoom", "cosmeticShop"])
    // In the native-idle path the timeout already queued its idle callback.
    if (nativeIdle) root.runTimers()
    root.setRoute("ChatThread")
    for (let slot = 0; slot < 4; slot += 1) idleSlot()
    assert.deepEqual(root.preloaded, ["myRoom", "cosmeticShop"], "a detail push cancels the pending slot")
    root.setRoute("Inbox")
    idleSlot()
    assert.deepEqual(root.preloaded, ["myRoom", "cosmeticShop", "wardrobeV2"], "returning resumes, without restarting earlier modules")
    root.runtime.unmount()
    idleSlot()
    assert.deepEqual(root.preloaded, ["myRoom", "cosmeticShop", "wardrobeV2"], "unmount cancels the remaining work")
  })
}

test("the avatar wardrobe and the room editor are pushed from the right like every detail screen", () => {
  // Owner decision 2026-10-02: both open with the native push, and the Back
  // button and the edge swipe close them with the matching native pop.
  const root = mountRoot()
  assert.equal(root.screenOptions("WardrobeV2"), DETAIL_OPTIONS_STUB)
  assert.equal(root.screenOptions("MyRoomEditor"), DETAIL_OPTIONS_STUB)
  assert.equal(root.screenOptions("ProfileEdit"), DETAIL_OPTIONS_STUB, "the same options as a drill-in detail")
})
