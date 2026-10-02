import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import { createClockedReanimatedStub, loadClockedMotion } from "../testing/reanimatedClock"
import type * as Entrance from "./bottomPanelEntrance"

// The room editor dock and the wardrobe panel share one soft entrance. It
// must start when the screen becomes visible (its opening transition), not
// while the route is still mounted under the previous screen, and never move
// under Reduce Motion. The test reads the panel's style as time passes.
type TransitionListener = (event: { data?: { closing?: boolean } }) => void

function fakeNavigation() {
  const listeners = new Set<TransitionListener>()
  return {
    listenerCount: () => listeners.size,
    emit(closing: boolean) {
      for (const listener of [...listeners]) listener({ data: { closing } })
    },
    addListener(_type: "transitionStart", listener: TransitionListener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
  }
}

function mountPanel(reduceMotion: boolean) {
  const runtime = createFakeReactRuntime()
  const reactNative = createReactNativeStub().module
  const clock = createClockedReanimatedStub(runtime)
  const entrance = loadSourceWithFakeReact<typeof Entrance>("ui/bottomPanelEntrance.ts", runtime, {
    modules: {
      "react-native-reanimated": clock.module,
      "./motion": loadClockedMotion(runtime, clock.module, reactNative)
    }
  })
  const navigation = fakeNavigation()
  let style: { opacity: number; transform: { translateY: number }[] } | undefined
  runtime.render(() => {
    style = entrance.useBottomPanelEntrance(navigation, reduceMotion) as unknown as typeof style
    return null
  })
  return {
    entrance,
    navigation,
    runtime,
    opacity: () => style!.opacity,
    offset: () => style!.transform[0]!.translateY
  }
}

test.beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 })
})

test.afterEach(() => {
  mock.timers.reset()
})

test("the panel waits below, hidden, until the screen starts to fade in, then rises into place", () => {
  const panel = mountPanel(false)
  const { BOTTOM_PANEL_ENTRANCE_MS, BOTTOM_PANEL_ENTRANCE_FALLBACK_MS } = panel.entrance
  mock.timers.tick(BOTTOM_PANEL_ENTRANCE_FALLBACK_MS - 20)
  assert.equal(panel.opacity(), 0, "nothing plays while the route is mounted but not yet shown")
  assert.ok(panel.offset() > 0)

  panel.navigation.emit(false)
  mock.timers.tick(BOTTOM_PANEL_ENTRANCE_MS / 2)
  assert.ok(panel.opacity() > 0 && panel.opacity() < 1, "the rise is visible while the screen fades in")
  assert.ok(panel.offset() > 0)
  mock.timers.tick(BOTTOM_PANEL_ENTRANCE_MS / 2)
  assert.equal(panel.opacity(), 1)
  assert.equal(panel.offset(), 0)
})

test("a closing transition does not start the rise, and the entrance plays only once", () => {
  const panel = mountPanel(false)
  panel.navigation.emit(true)
  mock.timers.tick(10)
  assert.equal(panel.opacity(), 0)

  panel.navigation.emit(false)
  mock.timers.tick(panel.entrance.BOTTOM_PANEL_ENTRANCE_MS)
  assert.equal(panel.opacity(), 1)
  assert.equal(panel.navigation.listenerCount(), 0, "the listener is gone once the panel has risen")
  // Coming back from a pushed screen does not replay it.
  panel.navigation.emit(false)
  assert.equal(panel.opacity(), 1)
})

test("without a reported transition the panel still rises after a short fallback", () => {
  const panel = mountPanel(false)
  mock.timers.tick(panel.entrance.BOTTOM_PANEL_ENTRANCE_FALLBACK_MS)
  mock.timers.tick(panel.entrance.BOTTOM_PANEL_ENTRANCE_MS / 2)
  assert.ok(panel.opacity() > 0 && panel.opacity() < 1)
  mock.timers.tick(panel.entrance.BOTTOM_PANEL_ENTRANCE_MS / 2)
  assert.equal(panel.opacity(), 1)
  assert.equal(panel.offset(), 0)
})

test("leaving before the screen opens stops listening and never animates", () => {
  const panel = mountPanel(false)
  panel.runtime.unmount()
  assert.equal(panel.navigation.listenerCount(), 0)
  mock.timers.tick(panel.entrance.BOTTOM_PANEL_ENTRANCE_FALLBACK_MS * 2)
  assert.equal(panel.opacity(), 0)
})

test("Reduce Motion: the panel is simply in place, with no rise and no fade", () => {
  const panel = mountPanel(true)
  assert.equal(panel.opacity(), 1)
  assert.equal(panel.offset(), 0)
  assert.equal(panel.navigation.listenerCount(), 0)
})
