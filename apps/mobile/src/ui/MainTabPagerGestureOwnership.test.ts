import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact,
  type FakeContext
} from "../testing/hookHarness"
import type * as Ownership from "./MainTabPagerGestureOwnership"

type Handler = (...args: any[]) => void
type Element = { props: Record<string, any> }
const BEGAN = 2

function mount({ offset = 0, maxOffset = 480, enabled = true, insidePager = true } = {}) {
  const runtime = createFakeReactRuntime()
  const contexts: FakeContext<any>[] = []
  const createContext = runtime.react.createContext as (initial: unknown) => FakeContext<any>
  runtime.react.createContext = (initial: unknown) => {
    const context = createContext(initial)
    contexts.push(context)
    return context
  }
  const builders: Record<string, any> = {}
  const gesture = (kind: string) => {
    const builder: Record<string, any> = { handlers: {}, relations: {} }
    builders[kind] = builder
    for (const method of ["enabled", "manualActivation", "cancelsTouchesInView", "blocksExternalGesture", "simultaneousWithExternalGesture", "requireExternalGestureToFail"]) {
      builder[method] = (...args: unknown[]) => {
        builder.relations[method] = args
        return builder
      }
    }
    for (const event of ["onTouchesDown", "onTouchesMove", "onTouchesUp", "onTouchesCancelled"]) {
      builder[event] = (handler: Handler) => {
        builder.handlers[event] = handler
        return builder
      }
    }
    return builder
  }
  const module = loadSourceWithFakeReact<typeof Ownership>("ui/MainTabPagerGestureOwnership.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": createReanimatedStub(runtime).module,
      "react-native-gesture-handler": {
        Gesture: { Native: () => gesture("native"), Pan: () => gesture("pan") },
        GestureDetector: "GestureDetector",
        State: { BEGAN }
      }
    },
    real: ["./mainTabPagerEdgeHandoffModel"]
  })
  const pager = { current: {} }
  contexts[0]!.currentValue = insidePager ? pager : null
  let press: (event: any) => void
  let calls = 0
  const child = { type: "Shelf", props: {} } as never
  runtime.render(() => {
    const tree = module.MainTabPagerEdgeHandoffScrollOwner({
      children: child, scrollOffset: { value: offset } as never, maxScrollOffset: maxOffset, enabled
    })
    contexts[1]!.currentValue = (tree as Element).props.value ?? null
    press = module.useScrollSafePress(() => { calls += 1 })
    return tree
  })
  const decisions: string[] = []
  const manager = { fail: () => decisions.push("release"), activate: () => decisions.push("scroller") }
  const touch = (x: number, y: number) => ({ absoluteX: x, absoluteY: y })
  const send = (event: string, x = 100, y = 100, count = 1) => builders.pan.handlers[event]({
    state: BEGAN,
    numberOfTouches: count,
    allTouches: Array.from({ length: count }, () => touch(x, y)),
    changedTouches: [touch(x, y)]
  }, manager)
  return {
    runtime, builders, pager, decisions,
    down: () => send("onTouchesDown"),
    move: (dx: number, dy = 0) => send("onTouchesMove", 100 + dx, 100 + dy),
    up: (dx = 0, dy = 0) => send("onTouchesUp", 100 + dx, 100 + dy, 0),
    multiTouch: () => send("onTouchesDown", 100, 100, 2),
    cancel: () => send("onTouchesCancelled"),
    press: () => press!({ nativeEvent: { changedTouches: [{}] } }),
    accessiblePress: () => press!({ nativeEvent: {} }),
    calls: () => calls
  }
}

test("a tap with small finger jitter selects immediately without a React update", () => {
  const shelf = mount()
  const renders = shelf.runtime.renderCount
  shelf.down()
  shelf.move(4, 3)
  shelf.up(4, 3)
  shelf.press()
  assert.equal(shelf.calls(), 1)
  assert.equal(shelf.runtime.renderCount, renders)
})

test("first-page outward drags release to the pager and cannot select a card", () => {
  const shelf = mount()
  shelf.down()
  shelf.move(9)
  shelf.press()
  assert.deepEqual(shelf.decisions, ["release"])
  assert.equal(shelf.calls(), 0)
  assert.deepEqual(shelf.builders.pan.relations.blocksExternalGesture, [shelf.pager])
  assert.deepEqual(shelf.builders.native.relations.requireExternalGestureToFail, [shelf.pager])
})

test("inward and middle-page drags still page the shelf without selecting a card", () => {
  for (const [offset, dx] of [[0, -9], [240, 9], [240, -9], [480, 9]]) {
    const shelf = mount({ offset })
    shelf.down()
    shelf.move(dx!)
    shelf.press()
    assert.deepEqual(shelf.decisions, ["scroller"])
    assert.deepEqual(shelf.builders.pan.relations.cancelsTouchesInView, [false])
    assert.equal(shelf.calls(), 0)
  }
})

test("a single-page shelf keeps the tap guard and releases either direction", () => {
  for (const dx of [-9, 9]) {
    const shelf = mount({ maxOffset: 0, enabled: false })
    shelf.down()
    shelf.move(dx)
    shelf.press()
    assert.deepEqual(shelf.decisions, ["release"])
    assert.deepEqual(shelf.builders.native.relations.enabled, [false])
    assert.equal(shelf.calls(), 0)
  }
})

test("vertical drags and fast movement only seen on touch-up cannot select", () => {
  const vertical = mount()
  vertical.down()
  vertical.move(1, 12)
  vertical.press()
  assert.deepEqual(vertical.decisions, ["release"])
  assert.equal(vertical.calls(), 0)
  const fast = mount()
  fast.down()
  fast.up(-10)
  fast.press()
  assert.equal(fast.calls(), 0)
})

test("returning to the start cannot turn a drag into a tap; the next tap works", () => {
  const shelf = mount()
  shelf.down()
  shelf.move(9)
  shelf.up()
  shelf.press()
  assert.equal(shelf.calls(), 0)
  shelf.down()
  shelf.up()
  shelf.press()
  assert.equal(shelf.calls(), 1)
})

test("cancelled and multi-touch presses are ignored, accessibility remains usable", () => {
  const shelf = mount()
  shelf.down()
  shelf.cancel()
  shelf.press()
  assert.equal(shelf.calls(), 0)
  shelf.accessiblePress()
  assert.equal(shelf.calls(), 1)
  shelf.down()
  shelf.multiTouch()
  shelf.press()
  assert.equal(shelf.calls(), 1)
})

test("cards outside the pager keep their normal press behavior", () => {
  const shelf = mount({ insidePager: false })
  shelf.press()
  assert.equal(shelf.calls(), 1)
})
