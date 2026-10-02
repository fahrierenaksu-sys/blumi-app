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
// threshold, ~0.25 s), so its renders and the pages' focus work never run in
// the settle's frames (tab swipe jank, 2026-10-03). These tests drive the
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

function mountPager(initialRoute: string) {
  const runtime = createFakeReactRuntime()
  const gesture = createGestureStub()
  const reanimated = createReanimatedStub(runtime)
  const indicator = { progress: { value: 0 }, tracking: { value: false }, selection: { value: -1 } }
  const dispatched: { payload?: { name?: string } }[] = []
  // Timers run only when a test flushes them (idle mounts, deferred focus).
  let timers: { id: number; delay: number; run: () => void }[] = []
  let nextTimerId = 1
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
        "react-native-gesture-handler": gesture.module,
        "react-native-reanimated": reanimated.module,
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
    isFocused: () => true,
    addListener: () => () => undefined,
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
    /** Runs timers due within `ms` (frame and idle callbacks fall back to timers here). */
    advance(ms: number) {
      for (let guard = 0; guard < 20; guard += 1) {
        const due = timers.filter((timer) => timer.delay <= ms)
        if (due.length === 0) return
        timers = timers.filter((timer) => timer.delay > ms)
        for (const timer of due) timer.run()
      }
    },
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

test("a settle whose end is never reported still commits its page", () => {
  const pager = mountPager("Inbox")
  pager.swipe(-0.6 * W, -300)
  assert.equal(pager.dispatched.length, 0)
  pager.advance(1000)
  assert.deepEqual(pager.dispatched.map((action) => action.payload?.name), ["MyRoom"])
  pager.reanimated.springs[0]!.done(true)
  assert.equal(pager.dispatched.length, 1, "a late spring end commits nothing more")
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
