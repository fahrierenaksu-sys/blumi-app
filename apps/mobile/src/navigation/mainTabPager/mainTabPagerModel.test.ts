import assert from "node:assert/strict"
import test from "node:test"
import { getBottomNavKeyForRoute } from "../rootNavigationModel"
import { BOTTOM_NAV_KEY_ORDER } from "../../ui/layout/bottomNavIndicatorModel"
import {
  MAIN_TAB_PAGER_SETTLE,
  MAIN_TAB_PAGER_SPRING,
  MAIN_TAB_PAGES,
  MAIN_TAB_ROUTE_NAMES,
  MAIN_TAB_SWIPE_MAX_INDEX,
  MAIN_TAB_SWIPE_MIN_INDEX
} from "./mainTabPagerConfig"
import {
  createMainTabPagerUiState,
  getMainTabPageAccessibility,
  getMainTabPageIndex,
  getMainTabPageNeighbours,
  getMainTabPageOpacity,
  getMainTabPagerMountedMask,
  isMainTabPageInMountedMask,
  isMainTabPageSwipeable,
  reduceMainTabPagerCommitRejected,
  reduceMainTabPagerRouteSync,
  reduceMainTabPagerSettleStart,
  reduceMainTabPagerSettleToCommitted,
  reduceMainTabPagerTap,
  resolveMainTabPagerBaseIndex,
  resolveMainTabPagerCommitRoute,
  resolveMainTabPagerDragPosition,
  resolveMainTabPagerMountedPages,
  resolveMainTabPagerSettleIndex,
  resolveMainTabPagerSettleVelocity,
  resolveMainTabPagerSpringEnergyThreshold,
  rubberBand,
  shouldMainTabPagerTouchCatchSettle,
  type MainTabPagerUiState
} from "./mainTabPagerModel"

const W = 390
const CHATS = getMainTabPageIndex("Inbox")
const MYROOM = getMainTabPageIndex("MyRoom")
const SHOP = getMainTabPageIndex("CosmeticShop")
const DISCOVER = getMainTabPageIndex("Lobby")

function settle(baseIndex: number, moved: number, velocity: number): number {
  return resolveMainTabPagerSettleIndex({
    position: baseIndex * W + moved,
    velocity,
    width: W,
    baseIndex
  })
}

// ── Page set ────────────────────────────────────────────────────────────

test("pages follow the bottom bar order and all four pages form one swipeable range", () => {
  assert.deepEqual(MAIN_TAB_PAGES.map((page) => page.key), ["discover", "chats", "myroom", "shop"])
  assert.deepEqual(MAIN_TAB_ROUTE_NAMES, ["Lobby", "Inbox", "MyRoom", "CosmeticShop"])
  for (const [index, page] of MAIN_TAB_PAGES.entries()) {
    assert.equal(getBottomNavKeyForRoute(page.routeName), page.key)
    assert.equal(isMainTabPageSwipeable(index), page.swipeable, page.key)
  }
  // Owner decision 2026-09-30: Chats swipes right to Discover. Drags that
  // start on the Discover card stay card swipes (Gesture Handler relation).
  assert.equal(MAIN_TAB_PAGES[DISCOVER]!.swipeable, true)
  const swipeable = MAIN_TAB_PAGES.flatMap((page, index) => page.swipeable ? [index] : [])
  assert.deepEqual(swipeable, [MAIN_TAB_SWIPE_MIN_INDEX, CHATS, MYROOM, MAIN_TAB_SWIPE_MAX_INDEX], "one contiguous range")
  assert.equal(MAIN_TAB_SWIPE_MIN_INDEX, DISCOVER)
})

// ── Finger follow and rubber band ─────────────────────────────────────

test("the drag follows the finger 1:1 within one page of its base", () => {
  for (const moved of [-W, -200, -1, 0, 1, 120, W]) {
    assert.equal(
      resolveMainTabPagerDragPosition({ rawPosition: MYROOM * W + moved, width: W, baseIndex: MYROOM }),
      MYROOM * W + moved
    )
  }
})

test("a drag meets a hard stop one page away from its base", () => {
  assert.equal(
    resolveMainTabPagerDragPosition({ rawPosition: MYROOM * W + 1.6 * W, width: W, baseIndex: MYROOM }),
    SHOP * W
  )
  assert.equal(
    resolveMainTabPagerDragPosition({ rawPosition: CHATS * W + 1.4 * W, width: W, baseIndex: CHATS }),
    MYROOM * W
  )
})

test("the first and last swipeable pages rubber-band with growing resistance", () => {
  let previous = 0
  // A finger can travel at most about one screen width past the edge.
  for (const overscroll of [10, 50, 150, 300, W]) {
    const beforeDiscover = resolveMainTabPagerDragPosition({ rawPosition: DISCOVER * W - overscroll, width: W, baseIndex: DISCOVER })
    const afterShop = resolveMainTabPagerDragPosition({ rawPosition: SHOP * W + overscroll, width: W, baseIndex: SHOP })
    const shown = DISCOVER * W - beforeDiscover
    assert.ok(shown > previous, "more pull still moves further")
    assert.ok(shown < overscroll, "but less than the finger")
    assert.ok(shown < W * 0.4, "and never close to a page")
    assert.ok(Math.abs(afterShop - SHOP * W - shown) < 1e-9, "both edges resist the same way")
    previous = shown
  }
  assert.equal(rubberBand(0, W), 0)
  assert.equal(rubberBand(-40, W), -rubberBand(40, W))
  assert.equal(rubberBand(40, 0), 0)
})

// ── Release decision ──────────────────────────────────────────────────

test("a short slow drag returns and a drag past half a page completes", () => {
  assert.equal(settle(CHATS, 80, 60), CHATS, "short slow drag toward My Room returns")
  assert.equal(settle(MYROOM, -80, -60), MYROOM, "short slow drag toward Chats returns")
  assert.equal(settle(CHATS, W * 0.55, 0), MYROOM, "past half a page with no velocity completes")
  assert.equal(settle(MYROOM, -W * 0.55, 0), CHATS)
  assert.equal(settle(CHATS, W * 0.45, 0), CHATS, "just short of half returns")
})

test("a slow drag completes early when its projected velocity carries it past half", () => {
  const moved = W * 0.4
  const velocity = 300
  assert.ok(velocity < MAIN_TAB_PAGER_SETTLE.flickVelocity)
  assert.ok(moved + velocity * MAIN_TAB_PAGER_SETTLE.projectionSeconds > W / 2)
  assert.equal(settle(CHATS, moved, velocity), MYROOM)
})

test("a quick flick completes even at a short distance, in either direction", () => {
  assert.equal(settle(CHATS, 30, 900), MYROOM)
  assert.equal(settle(SHOP, -30, -900), MYROOM)
  assert.equal(settle(MYROOM, 25, MAIN_TAB_PAGER_SETTLE.flickVelocity), SHOP)
})

test("small fast jitter below the flick distance never changes the page", () => {
  assert.equal(settle(MYROOM, 8, 2000), MYROOM)
  assert.equal(settle(MYROOM, -12, -2000), MYROOM)
  assert.equal(settle(MYROOM, MAIN_TAB_PAGER_SETTLE.flickMinDistance - 1, 5000), MYROOM)
})

test("a mid-gesture direction reversal follows the release direction", () => {
  // Dragged most of the way to My Room, then flicked back toward Chats.
  assert.equal(settle(CHATS, W * 0.8, -700), CHATS)
  // Dragged toward Chats, then flicked back toward Shop past the start.
  assert.equal(settle(MYROOM, -W * 0.3, 800), MYROOM, "a reversal flick returns to the base, not beyond")
  // Slow reversal that the projection brings back under half.
  assert.equal(settle(CHATS, W * 0.6, -400), CHATS)
})

test("Chats swipes right to Discover and Discover swipes left to Chats", () => {
  assert.equal(
    resolveMainTabPagerDragPosition({ rawPosition: CHATS * W - 200, width: W, baseIndex: CHATS }),
    CHATS * W - 200,
    "the drag toward Discover follows the finger 1:1 (no rubber band)"
  )
  assert.equal(settle(CHATS, -W * 0.55, 0), DISCOVER)
  assert.equal(settle(CHATS, -30, -900), DISCOVER, "a quick flick reaches Discover")
  assert.equal(settle(DISCOVER, W * 0.55, 0), CHATS)
  assert.equal(settle(CHATS, -80, -60), CHATS, "a short slow drag toward Discover returns")
})

test("a release in the rubber band returns to the edge page", () => {
  const discoverOverscroll = resolveMainTabPagerDragPosition({ rawPosition: DISCOVER * W - 300, width: W, baseIndex: DISCOVER })
  assert.equal(resolveMainTabPagerSettleIndex({ position: discoverOverscroll, velocity: -1500, width: W, baseIndex: DISCOVER }), DISCOVER)
  const shopOverscroll = resolveMainTabPagerDragPosition({ rawPosition: SHOP * W + 300, width: W, baseIndex: SHOP })
  assert.equal(resolveMainTabPagerSettleIndex({ position: shopOverscroll, velocity: 1500, width: W, baseIndex: SHOP }), SHOP)
})

test("a settle moves at most one page and stays inside the swipeable range", () => {
  for (const base of [DISCOVER, CHATS, MYROOM, SHOP]) {
    for (const moved of [-2 * W, -W, -W / 2, 0, W / 2, W, 2 * W]) {
      for (const velocity of [-5000, -500, 0, 500, 5000]) {
        const target = settle(base, moved, velocity)
        assert.ok(Math.abs(target - base) <= 1, `${base} ${moved} ${velocity}`)
        assert.ok(target >= MAIN_TAB_SWIPE_MIN_INDEX && target <= MAIN_TAB_SWIPE_MAX_INDEX)
      }
    }
  }
  assert.equal(resolveMainTabPagerSettleIndex({ position: 0, velocity: Number.NaN, width: W, baseIndex: DISCOVER }), DISCOVER)
  assert.equal(resolveMainTabPagerSettleIndex({ position: 100, velocity: 0, width: 0, baseIndex: MYROOM }), MYROOM)
})

test("a touch that catches a settle uses the nearest page as its base", () => {
  assert.equal(resolveMainTabPagerBaseIndex(1.3 * W, W), CHATS)
  assert.equal(resolveMainTabPagerBaseIndex(1.7 * W, W), MYROOM)
  assert.equal(resolveMainTabPagerBaseIndex(0.2 * W, W), DISCOVER)
  assert.equal(resolveMainTabPagerBaseIndex(-0.4 * W, W), DISCOVER, "clamped to the first page")
  assert.equal(resolveMainTabPagerBaseIndex(9 * W, W), SHOP)
})

// ── Settle velocity ───────────────────────────────────────────────────

function simulateCriticalSpring(start: number, target: number, velocity: number) {
  const { stiffness, damping, mass } = MAIN_TAB_PAGER_SPRING
  let x = start
  let v = velocity
  const dt = 1 / 2000
  let maxBeyond = 0
  let t = 0
  for (; t < 2; t += dt) {
    const a = (-stiffness * (x - target) - damping * v) / mass
    v += a * dt
    x += v * dt
    const beyond = Math.sign(target - start || 1) * (x - target)
    maxBeyond = Math.max(maxBeyond, beyond)
  }
  return { maxBeyond, final: x }
}

test("the settle keeps the release velocity but bounds the overshoot to a subtle amount", () => {
  assert.ok(Math.abs(MAIN_TAB_PAGER_SPRING.damping - 2 * Math.sqrt(MAIN_TAB_PAGER_SPRING.stiffness * MAIN_TAB_PAGER_SPRING.mass)) < 1e-9, "critically damped")
  const cases = [
    { position: 1.2 * W, target: 2 * W, velocity: 800 },
    { position: 1.9 * W, target: 2 * W, velocity: 4000 },
    { position: 2 * W - 1, target: 2 * W, velocity: 6000 },
    { position: 1.1 * W, target: 1 * W, velocity: -3000 },
    { position: 1.5 * W, target: 1 * W, velocity: 2500 }
  ]
  for (const { position, target, velocity } of cases) {
    const start = resolveMainTabPagerSettleVelocity({ position, targetPosition: target, velocity, width: W })
    assert.equal(Math.sign(start), Math.sign(velocity), "no direction jump")
    assert.ok(Math.abs(start) <= Math.abs(velocity), "never faster than the finger")
    const { maxBeyond, final } = simulateCriticalSpring(position, target, start)
    if (Math.sign(target - position) === Math.sign(velocity)) {
      assert.ok(maxBeyond <= W * MAIN_TAB_PAGER_SETTLE.maxOvershootFraction + 0.5, `overshoot ${maxBeyond}`)
    }
    assert.ok(Math.abs(final - target) < 0.5, "comes to rest on the page")
  }
  const typical = resolveMainTabPagerSettleVelocity({ position: 1.3 * W, targetPosition: 2 * W, velocity: 900, width: W })
  assert.equal(typical, 900, "a normal flick keeps its exact speed")
  assert.equal(resolveMainTabPagerSettleVelocity({ position: 0, targetPosition: W, velocity: Number.NaN, width: W }), 0)
})

// ── One selected-page state ───────────────────────────────────────────

/**
 * A small harness wired like MainTabPager: the UI thread owns
 * `MainTabPagerUiState`, JS commits through `resolveMainTabPagerCommitRoute`
 * into the slot route name, and every route change is synced back.
 */
function createHarness(initialRoute = "Lobby") {
  let ui: MainTabPagerUiState = createMainTabPagerUiState(getMainTabPageIndex(initialRoute))
  let route = initialRoute
  let position = getMainTabPageIndex(initialRoute)
  let animation: { target: number; epoch: number } | null = null
  const dispatches: string[] = []
  const snaps: number[] = []
  const pendingCommits: number[] = []

  const apply = (transition: ReturnType<typeof reduceMainTabPagerTap>) => {
    ui = transition.state
    if (transition.interrupt) animation = null
    if (transition.snap) {
      position = ui.committedIndex
      snaps.push(position)
    }
    if (transition.commitIndex !== null) pendingCommits.push(transition.commitIndex)
  }
  const flushJs = () => {
    while (pendingCommits.length > 0) {
      const index = pendingCommits.shift()!
      const routeName = resolveMainTabPagerCommitRoute(route, index)
      if (routeName === null) {
        apply(reduceMainTabPagerCommitRejected(ui, getMainTabPageIndex(route)))
        continue
      }
      dispatches.push(routeName)
      route = routeName
      apply(reduceMainTabPagerRouteSync(ui, getMainTabPageIndex(route)))
    }
  }
  return {
    get ui() { return ui },
    get route() { return route },
    get position() { return position },
    dispatches,
    snaps,
    /** `mounted`: whether the tapped page was visited before (the pager keeps it mounted). */
    tap(key: string, mounted = true) {
      apply(reduceMainTabPagerTap(ui, MAIN_TAB_PAGES.findIndex((page) => page.key === key), mounted))
    },
    /** A released drag starts settling on `target` (MainTabPager.settleTo). */
    release(target: number) {
      apply(reduceMainTabPagerSettleStart(ui, target))
      animation = { target, epoch: ui.epoch }
    },
    get settling() { return animation !== null },
    finishAnimation() {
      if (!animation || animation.epoch !== ui.epoch) return
      position = animation.target
      animation = null
    },
    external(routeName: string) {
      route = routeName
      apply(reduceMainTabPagerRouteSync(ui, getMainTabPageIndex(route)))
    },
    background() {
      apply(reduceMainTabPagerSettleToCommitted(ui))
    },
    flushJs
  }
}

test("a tap and a swipe change the same selected-page state with one navigation each", () => {
  const pager = createHarness("Inbox")
  pager.release(MYROOM)
  pager.finishAnimation()
  pager.flushJs()
  assert.deepEqual(pager.dispatches, ["MyRoom"])
  assert.deepEqual(pager.snaps, [], "the route sync after a swipe commit does not move the pager again")
  assert.equal(pager.ui.committedIndex, MYROOM)

  pager.tap("shop")
  assert.deepEqual(pager.snaps, [SHOP], "a tap to a mounted page jumps at once, on the UI thread")
  assert.equal(pager.position, SHOP)
  assert.deepEqual(pager.dispatches, ["MyRoom"], "before navigation answered")
  pager.flushJs()
  assert.deepEqual(pager.dispatches, ["MyRoom", "CosmeticShop"])
  assert.deepEqual(pager.snaps, [SHOP], "the tap's own route sync does not move the pager again")
  assert.equal(pager.position, SHOP)
  assert.equal(pager.ui.pendingCommitIndex, -1)
  assert.equal(getBottomNavKeyForRoute(pager.route), MAIN_TAB_PAGES[pager.ui.committedIndex]!.key)
})

/** Whether the page at `index` takes touches after the route render (MainTabPager page props). */
function isPageTouchable(route: string, index: number): boolean {
  return getMainTabPageAccessibility(getMainTabPageIndex(route) === index).pointerEvents === "auto"
}

test("a swiped-to page takes touches while it is still settling, not after the spring rests", () => {
  const pager = createHarness("Inbox")
  pager.release(MYROOM)
  assert.deepEqual(pager.dispatches, [], "JS has not run yet")
  pager.flushJs()
  assert.equal(pager.settling, true, "the pages are still moving")
  assert.deepEqual(pager.dispatches, ["MyRoom"], "the release committed the page")
  assert.equal(isPageTouchable(pager.route, MYROOM), true, "so it is touchable the moment it lands")
  assert.equal(isPageTouchable(pager.route, CHATS), false)
  pager.finishAnimation()
  assert.deepEqual(pager.dispatches, ["MyRoom"], "the spring's end commits nothing more")
  assert.deepEqual(pager.snaps, [])
})

test("a settle interrupted by a touch keeps the page it was going to, still touchable", () => {
  const pager = createHarness("Inbox")
  pager.release(MYROOM)
  pager.flushJs()
  // A tap catches the settle, never drags, and the settle resumes to the same page.
  pager.release(MYROOM)
  pager.flushJs()
  pager.finishAnimation()
  assert.deepEqual(pager.dispatches, ["MyRoom"])
  assert.equal(pager.position, MYROOM)
  assert.equal(isPageTouchable(pager.route, MYROOM), true)
})

test("a touch in the last pixels of a settle lands the page instead of catching it", () => {
  const target = MYROOM * W
  assert.equal(shouldMainTabPagerTouchCatchSettle({ position: target - 0.3, targetPosition: target }), false)
  assert.equal(shouldMainTabPagerTouchCatchSettle({ position: target + MAIN_TAB_PAGER_SETTLE.landDistance, targetPosition: target }), false)
  assert.equal(shouldMainTabPagerTouchCatchSettle({ position: target - W * 0.3, targetPosition: target }), true, "mid-settle a touch still catches the pages")
  assert.equal(shouldMainTabPagerTouchCatchSettle({ position: Number.NaN, targetPosition: target }), false)
  assert.ok(MAIN_TAB_PAGER_SETTLE.landDistance <= 16, "never so far that a caught drag would be lost")
})

/** Reanimated's spring: ends when energy / starting energy <= threshold. */
function springRestTime(start: number, target: number, velocity: number, threshold: number) {
  const { stiffness, damping, mass } = MAIN_TAB_PAGER_SPRING
  const energy = (x: number, v: number) => 0.5 * stiffness * (x - target) ** 2 + 0.5 * mass * v ** 2
  const initial = energy(start, velocity)
  let x = start
  let v = velocity
  const dt = 1 / 2000
  for (let t = 0; t < 3; t += dt) {
    if (energy(x, v) / initial <= threshold) return { t, distance: Math.abs(x - target), speed: Math.abs(v) }
    const a = (-stiffness * (x - target) - damping * v) / mass
    v += a * dt
    x += v * dt
  }
  return { t: Number.POSITIVE_INFINITY, distance: Math.abs(x - target), speed: Math.abs(v) }
}

test("the settle ends when the page looks still, well before Reanimated's default rest", () => {
  const cases = [
    { start: 1.5 * W, target: 2 * W, velocity: 0 },
    { start: 1.2 * W, target: 2 * W, velocity: 900 },
    { start: 1.9 * W, target: 2 * W, velocity: 1600 },
    { start: 1.1 * W, target: 1 * W, velocity: 0 }
  ]
  for (const { start, target, velocity } of cases) {
    const startVelocity = resolveMainTabPagerSettleVelocity({ position: start, targetPosition: target, velocity, width: W })
    const threshold = resolveMainTabPagerSpringEnergyThreshold({ displacement: start - target, velocity: startVelocity })
    const rest = springRestTime(start, target, startVelocity, threshold)
    const reanimatedDefault = springRestTime(start, target, startVelocity, 6e-9)
    // Reanimated then places it exactly on the page: a jump below one pixel.
    assert.ok(rest.distance < 1, `rests on the page (${rest.distance})`)
    assert.ok(rest.t <= 0.45, `rests in ${rest.t.toFixed(3)} s`)
    assert.ok(reanimatedDefault.t - rest.t >= 0.15, `not the long sub-pixel tail (${reanimatedDefault.t.toFixed(3)} s)`)
  }
  assert.equal(resolveMainTabPagerSpringEnergyThreshold({ displacement: 0, velocity: 0 }), 1, "already there: ends at once")
  assert.equal(resolveMainTabPagerSpringEnergyThreshold({ displacement: 0.2, velocity: 0 }), 1)
  assert.ok(resolveMainTabPagerSpringEnergyThreshold({ displacement: 1e9, velocity: 0 }) >= 6e-9)
})

test("a tap to a never-visited page waits for the route that mounts it", () => {
  const pager = createHarness("Lobby")
  pager.tap("shop", false)
  assert.deepEqual(pager.snaps, [], "no jump to an empty page")
  assert.equal(pager.position, DISCOVER)
  pager.flushJs()
  assert.deepEqual(pager.dispatches, ["CosmeticShop"])
  assert.deepEqual(pager.snaps, [SHOP])
  assert.equal(pager.position, SHOP)
})

test("a tap whose page another source already selected commits nothing", () => {
  const pager = createHarness("Lobby")
  pager.tap("chats")
  assert.equal(pager.position, CHATS)
  // A notification opened Chats before the tap's commit ran: the commit is
  // rejected (the slot already shows Chats) and the pager stays put.
  pager.external("Inbox")
  pager.flushJs()
  assert.deepEqual(pager.dispatches, [], "nothing to navigate")
  assert.equal(pager.position, CHATS)
  assert.equal(pager.ui.pendingCommitIndex, -1)
})

test("a commit rejected while the slot shows another page returns the pager to it", () => {
  const state = { committedIndex: SHOP, epoch: 4, pendingCommitIndex: SHOP }
  assert.deepEqual(reduceMainTabPagerCommitRejected(state, MYROOM), {
    state: { committedIndex: MYROOM, epoch: 5, pendingCommitIndex: -1 },
    commitIndex: null,
    snap: true,
    interrupt: true
  })
})

test("a returned swipe publishes nothing", () => {
  const pager = createHarness("Inbox")
  pager.release(CHATS)
  pager.finishAnimation()
  pager.flushJs()
  assert.deepEqual(pager.dispatches, [])
  assert.deepEqual(pager.snaps, [])
})

test("rapid bottom-bar taps retarget to the latest tap", () => {
  const pager = createHarness("Lobby")
  pager.tap("chats")
  pager.tap("myroom")
  pager.tap("shop")
  assert.deepEqual(pager.snaps, [CHATS, MYROOM, SHOP], "each tap shows its page at once")
  pager.flushJs()
  assert.equal(pager.route, "CosmeticShop")
  assert.equal(pager.position, SHOP)
  assert.equal(pager.ui.committedIndex, SHOP)
  assert.deepEqual(pager.dispatches, ["Inbox", "MyRoom", "CosmeticShop"], "each distinct tap navigates once")
  assert.deepEqual(pager.snaps, [CHATS, MYROOM, SHOP], "earlier commits landing later never pull the pager back")
})

test("a tap during a settle cancels it so the settle can never commit afterwards", () => {
  const pager = createHarness("Inbox")
  pager.release(MYROOM)
  pager.tap("discover")
  pager.finishAnimation()
  pager.flushJs()
  assert.equal(pager.route, "Lobby")
  // The swipe committed at its release, before the tap; nothing after it.
  assert.deepEqual(pager.dispatches, ["MyRoom", "Lobby"])
  assert.equal(pager.position, DISCOVER)
  assert.deepEqual(pager.snaps, [DISCOVER], "the swipe's late route sync never pulls the pager back")
})

test("a new swipe that catches a settle ends on its own final page", () => {
  const pager = createHarness("Inbox")
  pager.release(MYROOM)
  // The next touch cancels the running settle (no finish), then releases.
  pager.release(SHOP)
  pager.finishAnimation()
  pager.flushJs()
  assert.deepEqual(pager.dispatches, ["MyRoom", "CosmeticShop"], "one commit per release")
  assert.equal(pager.route, "CosmeticShop")
  assert.equal(pager.position, SHOP)
  assert.deepEqual(pager.snaps, [], "the first swipe's route sync does not interrupt the second")
})

test("a swipe back to the start page after catching a settle returns there without a jump", () => {
  const pager = createHarness("Inbox")
  pager.release(MYROOM)
  pager.release(CHATS)
  pager.flushJs()
  pager.finishAnimation()
  assert.deepEqual(pager.dispatches, ["MyRoom", "Inbox"])
  assert.equal(pager.route, "Inbox")
  assert.equal(pager.position, CHATS)
  assert.deepEqual(pager.snaps, [])
})

test("consecutive swipes are not interrupted by the previous swipe's route sync", () => {
  const pager = createHarness("Inbox")
  pager.release(MYROOM)
  pager.finishAnimation()
  pager.release(SHOP) // second swipe started before JS committed the first
  pager.flushJs()
  pager.finishAnimation()
  pager.flushJs()
  assert.deepEqual(pager.dispatches, ["MyRoom", "CosmeticShop"])
  assert.equal(pager.position, SHOP)
})

test("navigation from elsewhere (deep link, back, notification) moves the pager once", () => {
  const pager = createHarness("MyRoom")
  pager.release(SHOP)
  pager.flushJs()
  // A notification opens Chats while the pages are still settling on Shop.
  pager.external("Inbox")
  assert.equal(pager.settling, false, "the settle is interrupted")
  pager.finishAnimation()
  pager.flushJs()
  assert.equal(pager.route, "Inbox")
  assert.equal(pager.position, CHATS)
  assert.deepEqual(pager.dispatches, ["CosmeticShop"], "the pager does not navigate back")
  assert.deepEqual(pager.snaps, [CHATS])
})

test("backgrounding lands an interrupted pager on the committed page", () => {
  const pager = createHarness("MyRoom")
  pager.release(SHOP)
  pager.background()
  pager.finishAnimation()
  pager.flushJs()
  // The release already chose Shop: the pager lands there, never between pages.
  assert.equal(pager.position, SHOP)
  assert.equal(pager.route, "CosmeticShop")
  assert.deepEqual(pager.dispatches, ["CosmeticShop"])
})

test("reducers keep the committed page and epoch rules explicit", () => {
  const state = createMainTabPagerUiState(CHATS)
  assert.deepEqual(reduceMainTabPagerSettleStart(state, CHATS), { state, commitIndex: null, snap: false, interrupt: false })
  assert.deepEqual(reduceMainTabPagerSettleStart(state, MYROOM), {
    state: { committedIndex: MYROOM, epoch: 0, pendingCommitIndex: MYROOM },
    commitIndex: MYROOM,
    snap: false,
    interrupt: false
  }, "a release commits its page at once and never moves the pages itself")
  assert.deepEqual(reduceMainTabPagerRouteSync(state, CHATS), { state, commitIndex: null, snap: false, interrupt: false })
  assert.deepEqual(reduceMainTabPagerRouteSync(state, -1).snap, false)
  assert.deepEqual(reduceMainTabPagerTap(state, CHATS, true), {
    state: { committedIndex: CHATS, epoch: 1, pendingCommitIndex: -1 },
    commitIndex: null,
    snap: true,
    interrupt: true
  }, "tapping the committed page only settles an interrupted pager")
  assert.deepEqual(reduceMainTabPagerTap(state, SHOP, true), {
    state: { committedIndex: SHOP, epoch: 1, pendingCommitIndex: SHOP },
    commitIndex: SHOP,
    snap: true,
    interrupt: true
  }, "a mounted page is shown at once and committed once")
  assert.deepEqual(reduceMainTabPagerTap(state, SHOP, false), {
    state: { committedIndex: CHATS, epoch: 1, pendingCommitIndex: -1 },
    commitIndex: SHOP,
    snap: false,
    interrupt: true
  }, "a never-visited page waits for navigation")
  const pending = { committedIndex: SHOP, epoch: 1, pendingCommitIndex: SHOP }
  assert.deepEqual(reduceMainTabPagerRouteSync(pending, MYROOM).snap, false, "an earlier tap's commit is ignored")
  assert.deepEqual(reduceMainTabPagerRouteSync(pending, SHOP).state.pendingCommitIndex, -1, "its own commit clears it")
  assert.equal(resolveMainTabPagerCommitRoute("Inbox", CHATS), null)
  assert.equal(resolveMainTabPagerCommitRoute("Inbox", MYROOM), "MyRoom")
  assert.equal(resolveMainTabPagerCommitRoute(undefined, MYROOM), null)
  assert.equal(resolveMainTabPagerCommitRoute("Inbox", 9), null)
})

// ── Visibility and accessibility ──────────────────────────────────────

test("every swipeable page stays visible so a drag reveals its neighbour", () => {
  for (const committed of [DISCOVER, CHATS, MYROOM, SHOP]) {
    for (const index of [DISCOVER, CHATS, MYROOM, SHOP]) {
      assert.equal(getMainTabPageOpacity(index, committed), 1, `${index} while ${committed}`)
    }
  }
})

test("only the selected page is exposed to touch and accessibility, matching the bottom bar", () => {
  for (const [selectedIndex, selected] of MAIN_TAB_PAGES.entries()) {
    const exposed = MAIN_TAB_PAGES.filter((_, index) => {
      const a11y = getMainTabPageAccessibility(index === selectedIndex)
      return !a11y.accessibilityElementsHidden &&
        a11y.importantForAccessibility === "auto" &&
        a11y.pointerEvents === "auto"
    })
    assert.deepEqual(exposed.map((page) => page.key), [selected.key])
    // The bottom bar derives its selected item from the same slot route name.
    assert.equal(getBottomNavKeyForRoute(selected.routeName), selected.key)
    for (const [index] of MAIN_TAB_PAGES.entries()) {
      if (index === selectedIndex) continue
      assert.deepEqual(getMainTabPageAccessibility(index === selectedIndex), {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
        pointerEvents: "none"
      })
    }
  }
})

// ── Mount policy ──────────────────────────────────────────────────────

test("the mounted-page mask tells the UI thread which tapped page can be shown at once", () => {
  const mask = getMainTabPagerMountedMask([true, false, false, true])
  assert.equal(isMainTabPageInMountedMask(mask, DISCOVER), true)
  assert.equal(isMainTabPageInMountedMask(mask, CHATS), false)
  assert.equal(isMainTabPageInMountedMask(mask, MYROOM), false)
  assert.equal(isMainTabPageInMountedMask(mask, SHOP), true)
  assert.equal(isMainTabPageInMountedMask(mask, -1), false)
  assert.equal(getMainTabPagerMountedMask([]), 0)
})

test("pages mount lazily; visited pages stay; neighbours only when asked", () => {
  let mounted = resolveMainTabPagerMountedPages({ mounted: [], selectedIndex: DISCOVER, includeNeighbours: false })
  assert.deepEqual(mounted, [true, false, false, false], "only the first page at start")
  mounted = resolveMainTabPagerMountedPages({ mounted, selectedIndex: SHOP, includeNeighbours: false })
  assert.deepEqual(mounted, [true, false, false, true], "a tap mounts only its page")
  mounted = resolveMainTabPagerMountedPages({ mounted, selectedIndex: DISCOVER, includeNeighbours: true })
  assert.deepEqual(mounted, [true, true, false, true], "after settle and idle on Discover: its neighbour Chats")
  mounted = resolveMainTabPagerMountedPages({ mounted, selectedIndex: CHATS, includeNeighbours: true })
  assert.deepEqual(mounted, [true, true, true, true], "after settle and idle on Chats: Discover and My Room")
  assert.deepEqual(getMainTabPageNeighbours(DISCOVER), [CHATS])
  assert.deepEqual(getMainTabPageNeighbours(CHATS), [DISCOVER, MYROOM])
  assert.deepEqual(getMainTabPageNeighbours(MYROOM), [CHATS, SHOP])
  assert.deepEqual(getMainTabPageNeighbours(SHOP), [MYROOM])
})

test("the bottom bar lists the main pages in pager order", () => {
  assert.deepEqual(MAIN_TAB_PAGES.map((page) => page.key), [...BOTTOM_NAV_KEY_ORDER])
})
