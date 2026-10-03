import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  loadSourceWithFakeReact,
  type FakeReactRuntime
} from "../../testing/hookHarness"
import { getMainTabPageAccessibility } from "./mainTabPagerModel"

// Regression (owner, iPhone, 2026-10-02): after a swipe between main pages
// the new page ignored taps for a while; a bottom-bar tap did not. The page
// took touches only once navigation selected it. Touch no longer depends on
// the route, and the route is committed when the settle ends (energy
// threshold, ~0.25 s). Deferred focus checks motion before admission; work
// already admitted cannot be preempted by a new gesture. These tests drive the
// real pager's pan handlers and read what navigation and the pages receive.

const W = 390

type Handler = (...args: unknown[]) => void
interface Spring {
  target: number
  config: Record<string, number>
  done: (finished: boolean) => void
}

function createGestureStub() {
  let handlers: Record<string, Handler> = {}
  const pan = () => {
    const recorded: Record<string, Handler> = {}
    handlers = recorded
    const builder: Record<string, unknown> = {}
    for (const method of ["withRef", "enabled", "activeOffsetX", "failOffsetY"]) {
      builder[method] = () => builder
    }
    for (const event of ["onBegin", "onStart", "onUpdate", "onEnd", "onFinalize"]) {
      builder[event] = (handler: Handler) => {
        recorded[event] = handler
        return builder
      }
    }
    return builder
  }
  return {
    module: { Gesture: { Pan: pan }, GestureDetector: "GestureDetector" },
    pan: () => handlers
  }
}

function createReanimatedStub(runtime: FakeReactRuntime) {
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  const springs: Spring[] = []
  const cancelled: unknown[] = []
  // Where the pages are when the test next touches them: by default the
  // spring has carried them onto its target.
  let visible: (target: number) => number = (target) => target
  return {
    springs,
    cancelled,
    setVisiblePosition(next: (target: number) => number) {
      visible = next
    },
    module: {
      __esModule: true,
      default: { View: "Animated.View" },
      cancelAnimation: (value: unknown) => { cancelled.push(value) },
      useAnimatedReaction: () => undefined,
      useAnimatedStyle: () => ({}),
      useSharedValue: <T>(initial: T) => {
        const ref = useRef<{ value: T } | null>(null)
        if (!ref.current) ref.current = { value: initial }
        return ref.current
      },
      withSpring: (target: number, config: Record<string, number>, done: (finished: boolean) => void) => {
        springs.push({ target, config, done })
        return visible(target)
      }
    }
  }
}

function mountPager(initialRoute: string, initiallyFocused = true, reduceMotion = false, deferRN = false) {
  const runtime = createFakeReactRuntime()
  const gesture = createGestureStub()
  const reanimated = createReanimatedStub(runtime)
  const native = createReactNativeStub({
    BackHandler: { addEventListener: () => ({ remove: () => undefined }) }
  })
  const rnTasks: (() => void)[] = []
  const indicator = { progress: { value: 0 }, tracking: { value: false }, selection: { value: -1 } }
  const dispatched: { payload?: { name?: string } }[] = []
  // Timers run only when a test flushes them (idle mounts, deferred focus).
  let timers: { id: number; delay: number; run: () => void }[] = []
  let nextTimerId = 1
  let slotFocused = initiallyFocused
  const slotListeners = new Map<string, Set<() => void>>()
  const exports = loadSourceWithFakeReact<{ MainTabPager: (props: Record<string, unknown>) => unknown }>(
    "navigation/mainTabPager/MainTabPager.tsx",
    runtime,
    {
      modules: {
        "@react-navigation/native": {
          NavigationContext: { Provider: "NavigationContext.Provider" },
          NavigationRouteContext: { Provider: "NavigationRouteContext.Provider" }
        },
        "react-native": native.module,
        "react-native-gesture-handler": gesture.module,
        "react-native-reanimated": reanimated.module,
        "react-native-worklets": {
          scheduleOnRN: (work: (...args: unknown[]) => void, ...args: unknown[]) => {
            if (deferRN) rnTasks.push(() => work(...args))
            else work(...args)
          },
          scheduleOnUI: (work: (...args: unknown[]) => void, ...args: unknown[]) => work(...args)
        },
        "../../ui/animations": { useReducedMotion: () => reduceMotion },
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
      globals: {
        setTimeout: (run: () => void, delay = 0) => {
          const id = nextTimerId++
          timers.push({ id, delay, run })
          return id
        },
        clearTimeout: (id: number) => {
          timers = timers.filter((timer) => timer.id !== id)
        }
      }
    }
  )
  let route = { key: "slot", name: initialRoute }
  const navigation = {
    isFocused: () => slotFocused,
    addListener: (type: string, listener: () => void) => {
      let listeners = slotListeners.get(type)
      if (!listeners) slotListeners.set(type, listeners = new Set())
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setParams: () => undefined,
    dispatch: (action: { payload?: { name?: string } }) => { dispatched.push(action) },
    getState: () => ({ key: "stack", routes: [route] })
  }
  const renderPage = () => null
  runtime.render(() => exports.MainTabPager({ navigation, route, renderPage, bottomBar: null }))
  const pageProps = () => {
    const found: Record<string, unknown>[] = []
    const visit = (node: unknown) => {
      if (Array.isArray(node)) {
        for (const child of node) visit(child)
        return
      }
      if (typeof node !== "object" || node === null || !("props" in node)) return
      const element = node as { type: unknown; props: Record<string, unknown> }
      if (typeof element.type === "function" && element.type.name === "MainTabPagerPage") found.push(element.props)
      for (const value of Object.values(element.props ?? {})) visit(value)
    }
    visit(runtime.output)
    return found
  }
  const pageNavigation = (routeName: string) =>
    pageProps().find((props) => props.routeName === routeName)?.navigation as {
      addListener: (type: string, listener: () => void) => () => void
      isFocused: () => boolean
    }
  return {
    runtime,
    reanimated,
    dispatched,
    pageProps,
    pageNavigation,
    native,
    flushRN(index = 0) { rnTasks.splice(index, 1)[0]?.() },
    pendingRNCount: () => rnTasks.length,
    flushAllRN() { while (rnTasks.length > 0) rnTasks.shift()!() },
    timerCallbacks(delay: number) { return timers.filter((timer) => timer.delay === delay).map((timer) => timer.run) },
    setFocused(focused: boolean) {
      slotFocused = focused
      for (const listener of slotListeners.get(focused ? "focus" : "blur") ?? []) listener()
    },
    /** Runs timers due within `ms` (frame and idle callbacks fall back to timers here). */
    advance(ms: number) {
      for (let guard = 0; guard < 20; guard += 1) {
        const due = timers.filter((timer) => timer.delay <= ms)
        if (due.length === 0) return
        timers = timers.filter((timer) => timer.delay > ms)
        for (const timer of due) timer.run()
      }
    },
    /** Runs the timers queued right now (one idle slot), not the ones they queue. */
    idleSlot() {
      const due = timers
      timers = []
      for (const timer of due) timer.run()
    },
    pan: () => gesture.pan(),
    mountedPages: () => pageProps().filter((props) => props.mounted === true).map((props) => props.routeName),
    /** Navigation answers the pager's commit (the slot route changes). */
    navigate(name: string) {
      route = { key: "slot", name }
      runtime.rerender()
    },
    selectedPage: () => pageProps().find((props) => props.isSelected === true)?.routeName,
    /** A horizontal drag of `dx` px released at `velocityX` px/s (negative = toward the next page). */
    swipe(dx: number, velocityX: number) {
      const pan = gesture.pan()
      pan.onBegin!()
      pan.onStart!({ translationX: 0 })
      pan.onUpdate!({ translationX: dx })
      pan.onEnd!({ translationX: dx, velocityX }, true)
      pan.onFinalize!()
    },
    /** A finger that touches and lifts without dragging (a tap on the page). */
    tap() {
      const pan = gesture.pan()
      pan.onBegin!()
      pan.onFinalize!()
    }
  }
}


/** Whether a page view takes touches, from the props the pager hands it. */
function isTouchable(props: Record<string, unknown> | undefined): boolean {
  return props !== undefined && getMainTabPageAccessibility(props.isSelected === true).pointerEvents === "auto"
}

test("a swipe commits its page when the settle ends, and the page takes touches before that", () => {
  const pager = mountPager("Inbox")
  pager.swipe(-0.6 * W, -300)
  assert.equal(pager.reanimated.springs.length, 1, "the pages are settling")
  assert.equal(pager.dispatched.length, 0, "nothing reaches navigation while the pages move")
  assert.equal(
    isTouchable(pager.pageProps().find((props) => props.routeName === "MyRoom")),
    true,
    "the swiped-to page already takes taps"
  )
  pager.reanimated.springs[0]!.done(true)
  assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), ["MyRoom"], "one commit when it rests")
  pager.navigate("MyRoom")
  assert.equal(pager.selectedPage(), "MyRoom")
})

test("a swipe's settle re-renders no page and fires no focus until it ends", () => {
  const pager = mountPager("Inbox")
  pager.advance(1000) // idle time after launch: the neighbours are warm
  const events: string[] = []
  for (const routeName of ["Inbox", "MyRoom"]) {
    const navigation = pager.pageNavigation(routeName)
    navigation.addListener("focus", () => events.push(`${routeName}:focus`))
    navigation.addListener("blur", () => events.push(`${routeName}:blur`))
  }
  const rendersBefore = pager.runtime.renderCount
  const pagesBefore = pager.pageProps()
  pager.swipe(-0.6 * W, -300)
  pager.advance(16)
  assert.equal(pager.runtime.renderCount, rendersBefore, "the pager (and so every page) did not render")
  assert.deepEqual(pager.pageProps(), pagesBefore, "no page received new props")
  assert.deepEqual(events, [], "no blur or focus during the settle")
  assert.equal(pager.pageNavigation("Inbox").isFocused(), true)

  pager.reanimated.springs[0]!.done(true)
  pager.navigate("MyRoom")
  assert.deepEqual(events, [], "focus waits for the commit render to reach the screen")
  pager.advance(16)
  assert.deepEqual(events, ["Inbox:blur", "MyRoom:focus"], "then blur and focus run once, in an idle slot")
  assert.equal(pager.pageNavigation("MyRoom").isFocused(), true)
})

test("a follow-up swipe postpones the previous selection's delayed focus until motion ends", () => {
  const pager = mountPager("MyRoom")
  pager.advance(1000)
  const events: string[] = []
  for (const routeName of ["MyRoom", "CosmeticShop"]) {
    const navigation = pager.pageNavigation(routeName)
    navigation.addListener("focus", () => events.push(`${routeName}:focus`))
    navigation.addListener("blur", () => events.push(`${routeName}:blur`))
  }
  pager.swipe(-0.6 * W, -300)
  pager.reanimated.springs[0]!.done(true)
  pager.navigate("CosmeticShop")
  // Start another drag before Shop's delayed focus callback. The movement
  // reaction is inert in this harness, so its bridged JS ref remains false.
  const pan = pager.pan()
  pan.onBegin!()
  pan.onStart!({ translationX: 0 })
  pan.onUpdate!({ translationX: 0.3 * W })
  const renders = pager.runtime.renderCount
  pager.advance(16)
  assert.deepEqual(events, [], "the first focus callback cannot land in a new drag")
  pan.onEnd!({ translationX: 0.3 * W, velocityX: 100 }, true)
  pan.onFinalize!()
  pager.advance(100)
  assert.deepEqual(events, [], "its retry waits for the settle too")
  assert.equal(pager.runtime.renderCount, renders)
  pager.reanimated.springs[1]!.done(true)
  pager.advance(100)
  assert.deepEqual(events, ["MyRoom:blur", "CosmeticShop:focus"], "focus resumes after motion without another route render")
})

test("a newer selection replaces motion-delayed focus and unmount cancels its retry", () => {
  const pager = mountPager("MyRoom")
  pager.advance(1000)
  const events: string[] = []
  for (const routeName of ["MyRoom", "CosmeticShop"]) {
    const navigation = pager.pageNavigation(routeName)
    navigation.addListener("focus", () => events.push(`${routeName}:focus`))
    navigation.addListener("blur", () => events.push(`${routeName}:blur`))
  }
  pager.swipe(-0.6 * W, -300)
  pager.reanimated.springs[0]!.done(true)
  pager.navigate("CosmeticShop")
  pager.swipe(0.6 * W, 300)
  pager.advance(16)
  assert.deepEqual(events, [])
  pager.reanimated.springs[1]!.done(true)
  pager.navigate("MyRoom")
  pager.advance(100)
  assert.deepEqual(events, [], "a superseded Shop selection never gets focus")
  assert.equal(pager.pageNavigation("MyRoom").isFocused(), true)

  pager.swipe(-0.6 * W, -300)
  pager.reanimated.springs[2]!.done(true)
  pager.navigate("CosmeticShop")
  pager.swipe(0.6 * W, 300)
  pager.advance(16)
  pager.runtime.unmount()
  pager.reanimated.springs[3]!.done(true)
  pager.advance(1000)
  assert.deepEqual(events, [], "an unmounted pager cannot publish a delayed focus")
})

test("a settle whose end is never reported still commits its page", () => {
  const pager = mountPager("Inbox")
  pager.swipe(-0.6 * W, -300)
  assert.equal(pager.dispatched.length, 0)
  pager.advance(1000)
  assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), ["MyRoom"])
  pager.navigate("MyRoom")
  pager.advance(1000)
  assert.equal(pager.pageNavigation("MyRoom").isFocused(), true, "fallback lands focus even when no spring callback ever arrives")
  pager.reanimated.springs[0]!.done(true)
  assert.equal(pager.dispatched.length, 1, "a late spring end commits nothing more")
})

test("a completed swipe's stale fallback leaves a new same-page settle running", () => {
  const pager = mountPager("Inbox")
  pager.advance(1000)
  pager.swipe(-0.6 * W, -300)
  pager.reanimated.springs[0]!.done(true)
  pager.navigate("MyRoom")
  pager.advance(16)
  const oldFallback = pager.timerCallbacks(600)[0]!
  pager.swipe(-0.05 * W, 0)
  const beforeFallback = [...pager.reanimated.cancelled]
  oldFallback()
  assert.deepEqual(pager.reanimated.cancelled, beforeFallback, "the old selection timer cannot cancel the current return spring")
  assert.equal(pager.reanimated.springs[1]!.target, 2 * W)
  pager.reanimated.springs[1]!.done(true)
  assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), ["MyRoom"])
})

test("a same-page settle whose callback is lost still releases delayed focus", () => {
  const pager = mountPager("MyRoom")
  pager.advance(1000)
  pager.swipe(-0.6 * W, -300)
  pager.reanimated.springs[0]!.done(true)
  pager.navigate("CosmeticShop")
  pager.swipe(0.05 * W, 0)
  pager.advance(1000)
  assert.equal(pager.pageNavigation("CosmeticShop").isFocused(), true)
  assert.equal(pager.pageNavigation("MyRoom").isFocused(), false)
  assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), ["CosmeticShop"])
})

test("a late successful spring callback cannot end a newer same-page settle", () => {
  const pager = mountPager("MyRoom")
  pager.advance(1000)
  pager.swipe(-0.6 * W, -300)
  const first = pager.reanimated.springs[0]!
  first.done(true)
  pager.navigate("CosmeticShop")
  pager.swipe(0.05 * W, 0)
  first.done(true)
  pager.advance(16)
  assert.equal(pager.pageNavigation("CosmeticShop").isFocused(), false, "the newer spring still owns movement")
  pager.reanimated.springs[1]!.done(true)
  pager.advance(100)
  assert.equal(pager.pageNavigation("CosmeticShop").isFocused(), true)
})

test("a delayed old fallback request cannot replace a newer settle's timer", () => {
  const pager = mountPager("MyRoom", true, false, true)
  pager.advance(1000)
  pager.swipe(-0.6 * W, -300) // old arm is queued on JS
  pager.tap() // lands the first spring, queues its commit
  pager.swipe(0.05 * W, 0) // a newer same-page settle, queues its arm
  pager.flushRN(2) // deliver the newer arm first
  const currentTimer = pager.timerCallbacks(600)[0]!
  pager.flushRN(0) // deliver the older arm after it
  assert.deepEqual(pager.timerCallbacks(600), [currentTimer])
  pager.advance(1000)
  pager.flushRN() // deliver the first settle's navigation commit
  pager.navigate("CosmeticShop")
  pager.advance(1000)
  assert.equal(pager.pageNavigation("CosmeticShop").isFocused(), true, "the new fallback releases focus after the lost return spring")
  assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), ["CosmeticShop"])
})

test("backgrounding and unmount invalidate pending spring callbacks and fallback requests", () => {
  for (const unmount of [false, true]) {
    const pager = mountPager("MyRoom", true, false, true)
    pager.advance(1000)
    pager.swipe(0.05 * W, 0) // same-page settle: no navigation commit is due
    if (unmount) pager.runtime.unmount()
    else pager.native.emitAppState("background")
    const cancelled = [...pager.reanimated.cancelled]
    pager.flushRN()
    pager.reanimated.springs[0]!.done(true)
    pager.advance(1000)
    assert.deepEqual(pager.timerCallbacks(600), [])
    assert.deepEqual(pager.reanimated.cancelled, cancelled)
    assert.deepEqual(pager.dispatched, [])
  }
})

test("the final release displacement chooses the page in both directions and motion modes", () => {
  for (const reduceMotion of [false, true]) {
    for (const [routeName, sign, targetName, targetIndex] of [
      ["MyRoom", -1, "CosmeticShop", 3],
      ["CosmeticShop", 1, "MyRoom", 2]
    ] as const) {
      const pager = mountPager(routeName, true, reduceMotion)
      pager.advance(1000)
      const pan = pager.pan()
      pan.onBegin!()
      pan.onStart!({ translationX: sign * 12 })
      pan.onUpdate!({ translationX: sign * 190 })
      pan.onEnd!({ translationX: sign * 220, velocityX: 0 }, true)
      pan.onFinalize!()
      if (!reduceMotion) {
        assert.equal(pager.reanimated.springs[0]!.target, targetIndex * W)
        pager.reanimated.springs[0]!.done(true)
      }
      assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), [targetName])
    }
  }
})

test("a cancelled gesture ignores its final displacement in both directions and motion modes", () => {
  for (const reduceMotion of [false, true]) {
    for (const [routeName, sign, initialIndex] of [["MyRoom", -1, 2], ["CosmeticShop", 1, 3]] as const) {
      const pager = mountPager(routeName, true, reduceMotion)
      pager.advance(1000)
      const pan = pager.pan()
      pan.onBegin!()
      pan.onStart!({ translationX: sign * 12 })
      pan.onUpdate!({ translationX: sign * 190 })
      pan.onEnd!({ translationX: sign * 300, velocityX: sign * 800 }, false)
      pan.onFinalize!()
      if (!reduceMotion) {
        assert.equal(pager.reanimated.springs[0]!.target, initialIndex * W)
        pager.reanimated.springs[0]!.done(true)
      }
      assert.deepEqual(pager.dispatched, [], "cancellation returns to the committed page")
    }
  }
})

test("the settle spring ends when the page looks still, not after Reanimated's sub-pixel tail", () => {
  const pager = mountPager("Inbox")
  pager.swipe(-0.6 * W, -300)
  const { energyThreshold } = pager.reanimated.springs[0]!.config
  assert.ok(typeof energyThreshold === "number" && energyThreshold > 6e-9, `threshold ${energyThreshold}`)
})

test("a tap in the last pixels of a settle lands the page and reaches it, without restarting the settle", () => {
  const pager = mountPager("Inbox")
  pager.reanimated.setVisiblePosition((target) => target - 0.4)
  pager.swipe(-0.6 * W, -300)
  pager.tap()
  assert.equal(pager.reanimated.springs.length, 1, "no second settle")
  assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), ["MyRoom"], "landing commits the page")
  pager.navigate("MyRoom")
  assert.equal(pager.selectedPage(), "MyRoom", "the tapped page is the selected one")
})

test("a tap that catches a settle mid-way lets it finish on the same page, which stays touchable", () => {
  const pager = mountPager("Inbox")
  pager.reanimated.setVisiblePosition((target) => target - 0.3 * W)
  pager.swipe(-0.6 * W, -300)
  pager.tap()
  assert.equal(pager.reanimated.springs.length, 2, "the caught settle resumes")
  assert.equal(pager.reanimated.springs[1]!.target, pager.reanimated.springs[0]!.target, "to the same page")
  assert.equal(isTouchable(pager.pageProps().find((props) => props.routeName === "MyRoom")), true)
  // The interrupted first spring reports finished=false; nothing may hang on it.
  pager.reanimated.springs[0]!.done(false)
  assert.equal(pager.dispatched.length, 0)
  pager.reanimated.springs[1]!.done(true)
  assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), ["MyRoom"], "one commit")
  pager.navigate("MyRoom")
  assert.equal(pager.selectedPage(), "MyRoom")
})

test("after launch the other pages mount one per idle slot, nearest first", () => {
  const pager = mountPager("Inbox")
  assert.deepEqual(pager.mountedPages(), ["Inbox"], "only the shown page renders at launch")
  const seen: string[][] = []
  for (let slot = 0; slot < 6; slot += 1) {
    pager.idleSlot()
    seen.push(pager.mountedPages() as string[])
  }
  assert.deepEqual(seen.slice(0, 3), [
    ["Lobby", "Inbox"],
    ["Lobby", "Inbox", "MyRoom"],
    ["Lobby", "Inbox", "MyRoom", "CosmeticShop"]
  ], "one page per slot")
  assert.deepEqual(seen[5], ["Lobby", "Inbox", "MyRoom", "CosmeticShop"], "then nothing more is scheduled")
})

test("idle mount waits for UI drag and settle when the JS movement signal has not arrived", () => {
  // This fixture deliberately does not deliver useAnimatedReaction to JS.
  // The actual pan callbacks still update production shared dragging/animating.
  const pager = mountPager("MyRoom")
  const pan = pager.pan()
  pan.onBegin!()
  pan.onStart!({ translationX: 0 })
  pan.onUpdate!({ translationX: -0.3 * W })
  const afterColdNeighbours = pager.mountedPages()
  const renders = pager.runtime.renderCount
  pager.idleSlot()
  assert.deepEqual(pager.mountedPages(), afterColdNeighbours, "idle admission starts no additional page during drag")
  assert.equal(pager.runtime.renderCount, renders)
  pan.onEnd!({ translationX: -0.6 * W, velocityX: -300 }, true)
  pan.onFinalize!()
  pager.advance(350)
  assert.deepEqual(pager.mountedPages(), afterColdNeighbours, "the retry also waits for the spring")
  pager.reanimated.springs[0]!.done(true)
  pager.idleSlot()
  assert.deepEqual(pager.mountedPages(), ["Inbox", "MyRoom", "CosmeticShop"], "only one idle page warms after motion ends")
  pager.idleSlot()
  assert.deepEqual(pager.mountedPages(), ["Lobby", "Inbox", "MyRoom", "CosmeticShop"], "warming resumes when motion ends")
})

test("unmount cancels an idle retry that was blocked by UI motion", () => {
  const pager = mountPager("MyRoom")
  const pan = pager.pan()
  pan.onBegin!()
  pan.onStart!({ translationX: 0 })
  pager.idleSlot()
  const renders = pager.runtime.renderCount
  pager.runtime.unmount()
  pager.advance(1000)
  assert.equal(pager.runtime.renderCount, renders, "cancelled idle work never renders an unmounted pager")
})

test("a detail push cancels pending idle mounts and returning resumes the remaining pages", () => {
  const pager = mountPager("Inbox")
  pager.idleSlot()
  const beforePush = pager.mountedPages()
  assert.deepEqual(beforePush, ["Lobby", "Inbox"])
  pager.setFocused(false)
  assert.equal(pager.pageNavigation("Inbox").isFocused(), false)
  for (let slot = 0; slot < 4; slot += 1) pager.idleSlot()
  assert.deepEqual(pager.mountedPages(), beforePush, "hidden pager does no page initialization behind the chat push")
  pager.setFocused(true)
  assert.equal(pager.pageNavigation("Inbox").isFocused(), true)
  pager.idleSlot()
  assert.deepEqual(pager.mountedPages(), ["Lobby", "Inbox", "MyRoom"], "the next unmounted page resumes")
  pager.idleSlot()
  assert.deepEqual(pager.mountedPages(), ["Lobby", "Inbox", "MyRoom", "CosmeticShop"])
})

test("a pager first rendered under a detail route waits for focus before warming pages", () => {
  const pager = mountPager("Inbox", false)
  for (let slot = 0; slot < 4; slot += 1) pager.idleSlot()
  assert.deepEqual(pager.mountedPages(), ["Inbox"])
  pager.setFocused(true)
  pager.idleSlot()
  assert.deepEqual(pager.mountedPages(), ["Lobby", "Inbox"])
})

test("a drag over warm neighbours mounts nothing and renders nothing", () => {
  const pager = mountPager("Inbox")
  pager.advance(1000)
  const renders = pager.runtime.renderCount
  const pan = pager.pan()
  pan.onBegin!()
  pan.onStart!({ translationX: 0 })
  pan.onUpdate!({ translationX: -0.3 * W })
  assert.equal(pager.runtime.renderCount, renders)
})

test("a cold directional drag mounts only the visible neighbour in either direction and motion mode", () => {
  for (const reduceMotion of [false, true]) {
    for (const [sign, destination] of [[-1, "CosmeticShop"], [1, "Inbox"]] as const) {
      const pager = mountPager("MyRoom", true, reduceMotion)
      const pan = pager.pan()
      const renders = pager.runtime.renderCount
      pan.onBegin!()
      pan.onStart!({ translationX: sign * 12 })
      assert.deepEqual(pager.mountedPages(), ["MyRoom"], "activation has no reliable direction and mounts no neighbour")
      assert.equal(pager.runtime.renderCount, renders)
      pan.onUpdate!({ translationX: sign * 40 })
      assert.deepEqual(new Set(pager.mountedPages()), new Set(["MyRoom", destination]))
      assert.equal(pager.runtime.renderCount, renders + 1, "one demanded page renders")
      const page = pager.pageProps().find((props) => props.routeName === destination)!
      assert.equal(page.fadeIn, !reduceMotion, "the existing cold-page fade policy is preserved")
    }
  }
})

test("reversal requests each cold neighbour once while JS delivery is pending", () => {
  const pager = mountPager("MyRoom", true, false, true)
  const pan = pager.pan()
  pan.onBegin!()
  pan.onStart!({ translationX: 0 })
  for (const translationX of [-40, -80, -120]) pan.onUpdate!({ translationX })
  assert.equal(pager.pendingRNCount(), 1, "the destination is requested once before JS mounts it")
  for (const translationX of [40, 80, 120, -80]) pan.onUpdate!({ translationX })
  assert.equal(pager.pendingRNCount(), 2, "a reverse exposes the other neighbour, also once")
  pager.flushAllRN()
  assert.deepEqual(pager.mountedPages(), ["Inbox", "MyRoom", "CosmeticShop"])
  const renders = pager.runtime.renderCount
  pan.onUpdate!({ translationX: 100 })
  assert.equal(pager.pendingRNCount(), 0)
  assert.equal(pager.runtime.renderCount, renders)
})

test("a warm drag and reversal send no mount work to JS", () => {
  const pager = mountPager("MyRoom", true, false, true)
  pager.advance(1000)
  const renders = pager.runtime.renderCount
  const pan = pager.pan()
  pan.onBegin!()
  pan.onStart!({ translationX: 0 })
  for (const translationX of [-80, -160, 80, 160, -120]) pan.onUpdate!({ translationX })
  assert.equal(pager.pendingRNCount(), 0)
  assert.equal(pager.runtime.renderCount, renders)
})

test("a cold flick with no update prepares its release destination, including Reduce Motion", () => {
  for (const reduceMotion of [false, true]) {
    const pager = mountPager("MyRoom", true, reduceMotion)
    const pan = pager.pan()
    pan.onBegin!()
    pan.onStart!({ translationX: 0 })
    pan.onEnd!({ translationX: -25, velocityX: -1000 }, true)
    pan.onFinalize!()
    assert.deepEqual(pager.mountedPages(), ["MyRoom", "CosmeticShop"])
    if (!reduceMotion) pager.reanimated.springs[0]!.done(true)
    assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), ["CosmeticShop"])
    pager.navigate("CosmeticShop")
    assert.deepEqual(pager.mountedPages(), ["MyRoom", "CosmeticShop"], "visited pages stay mounted")
  }
})

test("a cancelled release without updates does not mount its final-displacement neighbour", () => {
  for (const reduceMotion of [false, true]) {
    const pager = mountPager("MyRoom", true, reduceMotion)
    const pan = pager.pan()
    pan.onBegin!()
    pan.onStart!({ translationX: 0 })
    pan.onEnd!({ translationX: -220, velocityX: -1000 }, false)
    pan.onFinalize!()
    assert.deepEqual(pager.mountedPages(), ["MyRoom"])
    assert.deepEqual(pager.dispatched, [])
  }
})

test("a queued cold request is discarded after a route interrupt or unmount", () => {
  for (const unmount of [false, true]) {
    const pager = mountPager("MyRoom", true, false, true)
    const pan = pager.pan()
    pan.onBegin!()
    pan.onStart!({ translationX: 0 })
    pan.onUpdate!({ translationX: -100 })
    assert.equal(pager.pendingRNCount(), 1)
    if (unmount) pager.runtime.unmount()
    else pager.navigate("Inbox")
    const renders = pager.runtime.renderCount
    pager.flushAllRN()
    assert.equal(pager.runtime.renderCount, renders)
    assert.equal(pager.mountedPages().includes("CosmeticShop"), false)
  }
})

test("a new gesture replaces an old pending demand without hiding the new direction", () => {
  const pager = mountPager("MyRoom", true, false, true)
  let pan = pager.pan()
  pan.onBegin!()
  pan.onStart!({ translationX: 0 })
  pan.onUpdate!({ translationX: -100 })
  pan.onEnd!({ translationX: -100, velocityX: 0 }, false)
  pan.onFinalize!()
  pan = pager.pan()
  pan.onBegin!()
  pan.onStart!({ translationX: 0 })
  pan.onUpdate!({ translationX: 100 })
  pager.flushAllRN()
  assert.deepEqual(pager.mountedPages(), ["Inbox", "MyRoom"])
})
