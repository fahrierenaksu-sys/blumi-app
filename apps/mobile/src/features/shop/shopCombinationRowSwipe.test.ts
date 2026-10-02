import assert from "node:assert/strict"
import test, { type TestContext } from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../testing/hookHarness"
import { createClockedReanimatedStub, findElements, loadClockedMotion, styleValue } from "../../testing/reanimatedClock"
import type * as RowModule from "./ShopCombinationRow"
import {
  COMBINATION_ROW_LEAVE_MAX_MS,
  getCombinationRowLeave,
  getCombinationRowRemoveThreshold,
  getCombinationRowRevealProgress,
  getCombinationRowSwipeClaim,
  getCombinationRowSwipeOffset,
  resolveCombinationRowSwipeRelease
} from "./shopCombinationRowSwipe"

// A typical outfit row in the preview overlay is about 150 pt wide.
const ROW = 150

/** Plays a drag the way the row's pan sees it: claim, follow, release. */
function swipe(path: readonly [number, number][], velocityX: number, rowWidth = ROW) {
  let claim: "wait" | "claim" | "fail" = "wait"
  const offsets: number[] = []
  for (const [dx, dy] of path) {
    if (claim === "wait") claim = getCombinationRowSwipeClaim(dx, dy)
    if (claim === "fail") return { claim, offsets, release: null }
    if (claim === "claim") offsets.push(getCombinationRowSwipeOffset(dx))
  }
  if (claim !== "claim") return { claim, offsets, release: null }
  const [lastDx] = path[path.length - 1] ?? [0, 0]
  return { claim, offsets, release: resolveCombinationRowSwipeRelease({ translationX: lastDx, velocityX, rowWidth }) }
}

test("a slow swipe right past the threshold removes the piece", () => {
  const result = swipe([[4, 1], [14, 2], [40, 3], [70, 3]], 120)
  assert.equal(result.claim, "claim")
  assert.deepEqual(result.offsets, [14, 40, 70])
  assert.equal(result.release, "remove")
})

test("releasing before the threshold springs back", () => {
  assert.equal(swipe([[12, 0], [40, 2]], 200).release, "restore")
  assert.equal(swipe([[12, 0], [80, 2], [30, 2]], 50).release, "restore", "dragged past, then back before lifting")
})

test("a quick flick right removes after a short move; a flick back cancels", () => {
  assert.equal(swipe([[12, 0], [30, 1]], 900).release, "remove")
  assert.equal(swipe([[12, 0], [18, 1]], 900).release, "restore", "too short to be a flick")
  assert.equal(swipe([[12, 0], [90, 1]], -900).release, "restore", "flicked back past the threshold")
})

test("vertical drags and drags to the left never claim the row", () => {
  assert.equal(swipe([[2, 12], [3, 40]], 0).claim, "fail", "the list keeps vertical scrolling")
  assert.equal(swipe([[-12, 1]], 0).claim, "fail", "a left drag stays with the main pager")
  assert.equal(swipe([[12, 10]], 0).claim, "fail", "diagonal is not a swipe")
  assert.equal(swipe([[3, 3]], 0).claim, "wait", "a tap stays a tap")
  assert.equal(getCombinationRowSwipeClaim(Number.NaN, 0), "fail")
})

test("the row never moves left of its rest and the backdrop grows to the threshold", () => {
  assert.equal(getCombinationRowSwipeOffset(-30), 0)
  assert.equal(getCombinationRowSwipeOffset(Number.NaN), 0)
  const threshold = getCombinationRowRemoveThreshold(ROW)
  assert.equal(threshold, 64, "short rows use the floor")
  assert.equal(getCombinationRowRemoveThreshold(300), 120, "wide rows use 40% of the width")
  assert.equal(getCombinationRowRemoveThreshold(0), 64, "before layout")
  assert.equal(getCombinationRowRevealProgress(0, threshold), 0)
  assert.equal(getCombinationRowRevealProgress(threshold / 2, threshold), 0.5)
  assert.equal(getCombinationRowRevealProgress(threshold * 2, threshold), 1, "armed")
  assert.equal(getCombinationRowRevealProgress(10, 0), 0)
})

test("a removed row slides just past its edge, and a faster flick never leaves slower", () => {
  const still = getCombinationRowLeave({ offset: 0, velocityX: 0, rowWidth: ROW })
  assert.ok(still.to > ROW, "the whole row leaves")
  assert.equal(still.durationMs, COMBINATION_ROW_LEAVE_MAX_MS)
  let previous = Infinity
  for (const velocityX of [0, 700, 1_500, 3_000, 6_000, 20_000]) {
    const { durationMs } = getCombinationRowLeave({ offset: 80, velocityX, rowWidth: ROW })
    assert.ok(durationMs <= previous && durationMs > 0 && durationMs <= COMBINATION_ROW_LEAVE_MAX_MS)
    previous = durationMs
  }
  assert.ok(getCombinationRowLeave({ offset: 0, velocityX: 0, rowWidth: 0 }).to > 0, "before layout")
})

/* -- The row itself, on a clock ------------------------------ */

// Reanimated calls a spring's completion only at rest, about 1.5x its
// visible duration. The piece must leave the outfit (and the rows below
// glide up) when the row has visibly gone, not that long after.
async function mountRow(t: TestContext, onRemove: (id: string) => boolean) {
  const runtime = createFakeReactRuntime()
  const clock = createClockedReanimatedStub(runtime, { springRestFactor: 1.5 })
  const reactNative = createReactNativeStub({
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => undefined })
    }
  }).module
  const motion = loadClockedMotion(runtime, clock.module, reactNative) as { primeReducedMotionPreference: () => void }
  motion.primeReducedMotionPreference()
  await new Promise((resolve) => setImmediate(resolve))
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 })
  const chain = (): unknown => new Proxy({}, { get: () => () => chain() })
  const { ShopCombinationRow } = loadSourceWithFakeReact<typeof RowModule>("features/shop/ShopCombinationRow.tsx", runtime, {
    modules: {
      "react-native": reactNative,
      "react-native-reanimated": clock.module,
      "react-native-worklets": clock.worklets,
      "react-native-gesture-handler": { Gesture: { Pan: chain }, GestureDetector: "GestureDetector", State: { BEGAN: 2 } },
      "../../ui/motion": motion
    },
    real: ["./shopCombinationRowSwipe"],
    inertUnknown: true
  })
  let tree: unknown
  runtime.render(() => {
    tree = (ShopCombinationRow as unknown as (props: unknown) => unknown)({
      item: { id: "piece-a", title: "Piece", owned: true, price: 0 },
      locale: "en",
      selected: false,
      removable: true,
      onRemove
    })
    return tree
  })
  const container = () => tree as { props: Record<string, unknown> }
  ;(container().props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: ROW } } })
  return {
    pressRemove: () => (findElements(tree, (element) => element.props.hitSlop !== undefined)[0]!.props.onPress as () => void)(),
    opacity: () => styleValue(container() as never, "opacity") as number,
    tick: (ms: number) => t.mock.timers.tick(ms)
  }
}

test("the X removes the piece the moment its row has slid out and faded", async (t) => {
  const removed: string[] = []
  const row = await mountRow(t, (id) => removed.push(id) > 0)
  row.pressRemove()
  row.tick(COMBINATION_ROW_LEAVE_MAX_MS - 1)
  assert.deepEqual(removed, [], "still leaving")
  assert.ok(row.opacity() > 0)
  row.tick(1)
  assert.deepEqual(removed, ["piece-a"], "removed as the row is gone, not a spring's rest later")
  assert.equal(row.opacity(), 0, "nothing of the row is left on screen")
})

test("a piece that cannot leave the outfit brings its row back", async (t) => {
  const row = await mountRow(t, () => false)
  row.pressRemove()
  row.tick(COMBINATION_ROW_LEAVE_MAX_MS)
  assert.equal(row.opacity(), 0, "the outfit refused at the end of the slide")
  row.tick(500)
  assert.equal(row.opacity(), 1, "and the row fades back instead of staying invisible")
})
