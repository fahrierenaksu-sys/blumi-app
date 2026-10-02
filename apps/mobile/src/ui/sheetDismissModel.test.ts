import assert from "node:assert/strict"
import test, { type TestContext } from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import { createClockedReanimatedStub, findElements, styleValue } from "../testing/reanimatedClock"
import type * as SheetModule from "./SwipeDismissSheet"
import {
  SHEET_DISMISS,
  getSheetBackdropOpacity,
  getSheetDismissDistance,
  getSheetExitOffset,
  resolveSheetDismissClaim,
  resolveSheetDismissRelease,
  resolveSheetDragOffset,
  getSheetExitVelocity,
  resolveSheetExit
} from "./sheetDismissModel"

const H = 520

test("a downward drag claims the sheet only when its content is scrolled to the top", () => {
  assert.equal(resolveSheetDismissClaim({ dx: 0, dy: 4, atTop: true }), "wait", "under the slop")
  assert.equal(resolveSheetDismissClaim({ dx: 2, dy: SHEET_DISMISS.activeOffsetY + 1, atTop: true }), "activate")
  assert.equal(
    resolveSheetDismissClaim({ dx: 0, dy: 40, atTop: false }),
    "fail",
    "scrolled content scrolls back first; the sheet never moves"
  )
  assert.equal(resolveSheetDismissClaim({ dx: 0, dy: -SHEET_DISMISS.activeOffsetY - 1, atTop: true }), "fail", "upward drags scroll")
  assert.equal(resolveSheetDismissClaim({ dx: 30, dy: 12, atTop: true }), "fail", "horizontal drags stay with the content")
  assert.equal(resolveSheetDismissClaim({ dx: 14, dy: 16, atTop: true }), "activate", "a mostly vertical diagonal claims")
})

test("the sheet follows the finger down 1:1 and never rises above its resting place", () => {
  assert.equal(resolveSheetDragOffset(0), 0)
  assert.equal(resolveSheetDragOffset(137), 137)
  // An upward pull stretches with resistance instead of stopping dead (SYS-5).
  assert.ok(resolveSheetDragOffset(-60) < 0)
  assert.ok(resolveSheetDragOffset(-60) > -SHEET_DISMISS.rubberBandLimit)
  assert.ok(resolveSheetDragOffset(-600) < resolveSheetDragOffset(-60))
  assert.ok(resolveSheetDragOffset(-100_000) > -SHEET_DISMISS.rubberBandLimit)
  assert.equal(resolveSheetDragOffset(Number.NaN), 0)
})

test("a release past the dismiss distance closes; a short release springs back", () => {
  const distance = getSheetDismissDistance(H)
  assert.equal(distance, Math.min(H * SHEET_DISMISS.distanceFraction, SHEET_DISMISS.maxDistance))
  assert.equal(resolveSheetDismissRelease({ offset: distance + 1, velocityY: 0, sheetHeight: H }), "dismiss")
  assert.equal(resolveSheetDismissRelease({ offset: distance - 40, velocityY: 0, sheetHeight: H }), "return")
  assert.equal(resolveSheetDismissRelease({ offset: 0, velocityY: 0, sheetHeight: H }), "return")
})

test("a downward flick closes early; an upward flick keeps the sheet", () => {
  assert.equal(resolveSheetDismissRelease({ offset: 40, velocityY: SHEET_DISMISS.flickVelocity, sheetHeight: H }), "dismiss")
  assert.equal(
    resolveSheetDismissRelease({ offset: SHEET_DISMISS.flickMinDistance - 1, velocityY: 4000, sheetHeight: H }),
    "return",
    "jitter never closes"
  )
  assert.equal(
    resolveSheetDismissRelease({ offset: getSheetDismissDistance(H) + 60, velocityY: -SHEET_DISMISS.flickVelocity, sheetHeight: H }),
    "return",
    "flicked back up"
  )
  // A slow drag whose projected travel passes the distance closes.
  const offset = getSheetDismissDistance(H) - 30
  assert.equal(resolveSheetDismissRelease({ offset, velocityY: 400, sheetHeight: H }), "dismiss")
})

test("unmeasured or tiny sheets still use a sane distance and exit fully", () => {
  assert.equal(getSheetDismissDistance(0), SHEET_DISMISS.fallbackDistance)
  assert.equal(getSheetDismissDistance(Number.NaN), SHEET_DISMISS.fallbackDistance)
  assert.ok(getSheetDismissDistance(120) >= SHEET_DISMISS.minDistance)
  assert.ok(getSheetExitOffset(H) > H)
  assert.ok(getSheetExitOffset(0) > 0)
})

test("the backdrop fades in proportion to the drag and is gone when the sheet has left", () => {
  // The Modal's own close animation runs after a swipe dismiss; the
  // backdrop must already be invisible then, or it trails the sheet.
  assert.equal(getSheetBackdropOpacity(0, H), 1, "at rest")
  assert.equal(getSheetBackdropOpacity(-20, H), 1, "never above rest")
  const half = getSheetExitOffset(H) / 2
  assert.ok(Math.abs(getSheetBackdropOpacity(half, H) - 0.5) < 1e-9, "halfway out")
  assert.ok(getSheetBackdropOpacity(40, H) < getSheetBackdropOpacity(20, H), "monotonic")
  assert.equal(getSheetBackdropOpacity(getSheetExitOffset(H), H), 0, "fully out")
  assert.equal(getSheetBackdropOpacity(getSheetExitOffset(H) + 100, H), 0)
  assert.equal(getSheetBackdropOpacity(getSheetExitOffset(0), 0), 0, "unmeasured sheet uses the same exit offset")
  assert.equal(getSheetBackdropOpacity(Number.NaN, H), 1)
})

test("the exit carries a downward flick: a faster flick never leaves slower, and nothing takes longer than the exit time", () => {
  assert.equal(getSheetExitVelocity(1_400), 1_400)
  assert.equal(getSheetExitVelocity(-300), 0)
  assert.equal(getSheetExitVelocity(Number.NaN), 0)
  const exit = (velocityY: number, offset = 200) => {
    const resolved = resolveSheetExit({ reduceMotion: false, sheetHeight: H, velocityY, offset })
    assert.ok(resolved.animate)
    return resolved.durationMs
  }
  assert.equal(exit(0, 0), SHEET_DISMISS.exitDurationMs, "a tap on the backdrop takes the full exit")
  let previous = Infinity
  for (const velocity of [0, 900, 2_000, 4_000, 8_000, 20_000]) {
    const duration = exit(velocity)
    assert.ok(duration <= previous, `${velocity} px/s is not slower than a gentler flick`)
    assert.ok(duration <= SHEET_DISMISS.exitDurationMs && duration >= SHEET_DISMISS.minExitDurationMs)
    previous = duration
  }
  // An ease-out starts at 3 x distance / duration: never below the finger's
  // speed unless the shortest exit holds it back.
  const remaining = getSheetExitOffset(H) - 400
  const duration = exit(4_000, 400)
  assert.ok(duration < SHEET_DISMISS.exitDurationMs, "a fast flick from far down leaves sooner")
  assert.ok((3 * remaining * 1000) / duration >= 4_000 || duration === SHEET_DISMISS.minExitDurationMs)
})

test("Reduce Motion closes the sheet without movement; otherwise it eases out with the release speed", () => {
  for (const sheetHeight of [0, 420]) {
    assert.deepEqual(
      resolveSheetExit({ reduceMotion: true, sheetHeight, velocityY: 1_200 }),
      { animate: false, offset: getSheetExitOffset(sheetHeight) }
    )
  }
  const animated = resolveSheetExit({ reduceMotion: false, sheetHeight: 420, velocityY: 1_200 })
  assert.equal(animated.animate, true)
  assert.equal(animated.offset, getSheetExitOffset(420))
  assert.ok(animated.animate && animated.velocity === 1_200)
  const upward = resolveSheetExit({ reduceMotion: false, sheetHeight: 420, velocityY: -600 })
  assert.ok(upward.animate && upward.velocity === 0, "an exit never starts moving back up")
})

/* -- The sheet itself, on a clock ---------------------------- */

// Reanimated calls a spring's completion only at rest, about 1.5x its
// visible duration. The sheet must close (and give back the screen) when it
// has visibly left, and a grab that catches the exit must not leave it stuck.
const clockedTests = new WeakSet<TestContext>()

function mountSheet(t: TestContext) {
  if (!clockedTests.has(t)) {
    clockedTests.add(t)
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 })
  }
  const runtime = createFakeReactRuntime()
  const clock = createClockedReanimatedStub(runtime, { springRestFactor: 1.5 })
  const handlers: Record<string, (...args: never[]) => void> = {}
  const chain = (): unknown => new Proxy({}, {
    get: (_target, name) => (...args: unknown[]) => {
      if (typeof args[0] === "function") handlers[String(name)] = args[0] as (...args: never[]) => void
      return chain()
    }
  })
  const sheet = loadSourceWithFakeReact<typeof SheetModule>("ui/SwipeDismissSheet.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": { ...clock.module, useAnimatedScrollHandler: () => () => undefined },
      "react-native-worklets": clock.worklets,
      "react-native-gesture-handler": {
        Gesture: { Pan: chain, Native: chain },
        GestureDetector: "GestureDetector",
        State: { BEGAN: 2 }
      },
      "./animations": { useReducedMotion: () => false }
    },
    real: ["./sheetDismissModel"]
  })
  const dismissed: string[] = []
  let tree: unknown
  runtime.render(() => {
    tree = sheet.SwipeDismissSheet({
      onDismiss: () => dismissed.push("dismiss"),
      backdrop: { onPress: () => dismissed.push("backdrop") },
      children: null
    })
    return tree
  })
  const panel = () => findElements(tree, (element) => typeof element.props.onLayout === "function")[0]!
  ;(panel().props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { height: H } } })
  const offset = () => (styleValue(panel(), "transform") as { translateY: number }[])[0]!.translateY
  const pan = (name: string, ...args: unknown[]) => (handlers[name] as unknown as (...args: unknown[]) => void)(...args)
  return {
    dismissed,
    offset,
    close: () => (tree as { props: { value: () => void } }).props.value(),
    tapBackdrop: () => (findElements(tree, (element) => element.type === "Pressable")[0]!.props.onPress as () => void)(),
    pan,
    tick: (ms: number) => t.mock.timers.tick(ms)
  }
}

test("the close button and the backdrop close the sheet the moment it has left the screen", (t) => {
  const sheet = mountSheet(t)
  sheet.close()
  sheet.tick(SHEET_DISMISS.exitDurationMs - 1)
  assert.deepEqual(sheet.dismissed, [], "still on its way out")
  assert.ok(sheet.offset() > 0)
  sheet.tick(1)
  assert.equal(sheet.offset(), getSheetExitOffset(H))
  assert.deepEqual(sheet.dismissed, ["dismiss"], "the Modal closes as the sheet leaves, not a spring's rest later")

  const other = mountSheet(t)
  other.tapBackdrop()
  other.tick(SHEET_DISMISS.exitDurationMs)
  assert.deepEqual(other.dismissed, ["backdrop"])
})

test("a swipe released past the distance closes the sheet when its exit ends", (t) => {
  const sheet = mountSheet(t)
  sheet.pan("onStart", { translationY: 0 })
  sheet.pan("onUpdate", { translationY: 200 })
  sheet.pan("onEnd", { translationY: 200, velocityY: 1_500 }, true)
  const exit = resolveSheetExit({ reduceMotion: false, sheetHeight: H, velocityY: 1_500, offset: 200 })
  assert.ok(exit.animate && exit.durationMs <= SHEET_DISMISS.exitDurationMs)
  sheet.tick(exit.durationMs - 1)
  assert.deepEqual(sheet.dismissed, [])
  sheet.tick(1)
  assert.deepEqual(sheet.dismissed, ["dismiss"])
})

test("a grab that catches a closing sheet keeps it open, and the close button works again afterwards", (t) => {
  const sheet = mountSheet(t)
  sheet.close()
  sheet.tick(60)
  sheet.pan("onStart", { translationY: 0 })
  sheet.pan("onEnd", { translationY: 0, velocityY: 0 }, false)
  sheet.tick(1_000)
  assert.deepEqual(sheet.dismissed, [], "the caught sheet stays")
  assert.equal(sheet.offset(), 0, "and returns to rest")
  sheet.close()
  sheet.tick(SHEET_DISMISS.exitDurationMs)
  assert.deepEqual(sheet.dismissed, ["dismiss"], "closing is not stuck")
})
