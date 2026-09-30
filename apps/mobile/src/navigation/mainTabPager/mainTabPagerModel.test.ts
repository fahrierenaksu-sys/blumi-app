import assert from "node:assert/strict"
import test from "node:test"
import { getBottomNavKeyForRoute } from "../rootNavigationModel"
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
  isMainTabPageSwipeable,
  reduceMainTabPagerRouteSync,
  reduceMainTabPagerSettled,
  reduceMainTabPagerSettleToCommitted,
  reduceMainTabPagerTap,
  resolveMainTabPagerBaseIndex,
  resolveMainTabPagerCommitRoute,
  resolveMainTabPagerDragPosition,
  resolveMainTabPagerMountedPages,
  resolveMainTabPagerSettleIndex,
  resolveMainTabPagerSettleVelocity,
  rubberBand,
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
        apply(reduceMainTabPagerRouteSync(ui, getMainTabPageIndex(route)))
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
    tap(key: string) {
      apply(reduceMainTabPagerTap(ui, MAIN_TAB_PAGES.findIndex((page) => page.key === key)))
    },
    release(target: number) {
      animation = { target, epoch: ui.epoch }
    },
    finishAnimation() {
      if (!animation || animation.epoch !== ui.epoch) return
      position = animation.target
      const { target } = animation
      animation = null
      apply(reduceMainTabPagerSettled(ui, target))
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
  pager.flushJs()
  assert.deepEqual(pager.dispatches, ["MyRoom", "CosmeticShop"])
  assert.deepEqual(pager.snaps, [SHOP], "a tap jumps once, after navigation selected the page")
  assert.equal(pager.position, SHOP)
  assert.equal(getBottomNavKeyForRoute(pager.route), MAIN_TAB_PAGES[pager.ui.committedIndex]!.key)
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
  pager.flushJs()
  assert.equal(pager.route, "CosmeticShop")
  assert.equal(pager.position, SHOP)
  assert.equal(pager.ui.committedIndex, SHOP)
  assert.deepEqual(pager.dispatches, ["Inbox", "MyRoom", "CosmeticShop"], "each distinct tap navigates once")
})

test("a tap during a settle cancels it so the settle can never commit afterwards", () => {
  const pager = createHarness("Inbox")
  pager.release(MYROOM)
  pager.tap("discover")
  pager.finishAnimation()
  pager.flushJs()
  assert.equal(pager.route, "Lobby")
  assert.deepEqual(pager.dispatches, ["Lobby"])
  assert.equal(pager.position, DISCOVER)
})

test("a new swipe that catches a settle commits only its own final page", () => {
  const pager = createHarness("Inbox")
  pager.release(MYROOM)
  // The next touch cancels the running settle (no finish), then releases.
  pager.release(SHOP)
  pager.finishAnimation()
  pager.flushJs()
  assert.deepEqual(pager.dispatches, ["CosmeticShop"])
  assert.equal(pager.route, "CosmeticShop")
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
  pager.external("Inbox")
  pager.finishAnimation()
  pager.flushJs()
  assert.equal(pager.route, "Inbox")
  assert.equal(pager.position, CHATS)
  assert.deepEqual(pager.dispatches, [], "the pager does not navigate back")
})

test("backgrounding returns an interrupted pager to the committed page", () => {
  const pager = createHarness("MyRoom")
  pager.release(SHOP)
  pager.background()
  pager.finishAnimation()
  pager.flushJs()
  assert.equal(pager.position, MYROOM)
  assert.equal(pager.route, "MyRoom")
  assert.deepEqual(pager.dispatches, [])
})

test("reducers keep the committed page and epoch rules explicit", () => {
  const state = createMainTabPagerUiState(CHATS)
  assert.deepEqual(reduceMainTabPagerSettled(state, CHATS), { state, commitIndex: null, snap: false, interrupt: false })
  assert.deepEqual(reduceMainTabPagerRouteSync(state, CHATS), { state, commitIndex: null, snap: false, interrupt: false })
  assert.deepEqual(reduceMainTabPagerRouteSync(state, -1).snap, false)
  assert.deepEqual(reduceMainTabPagerTap(state, CHATS), {
    state: { committedIndex: CHATS, epoch: 1 },
    commitIndex: null,
    snap: true,
    interrupt: true
  }, "tapping the committed page only settles an interrupted pager")
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
      const a11y = getMainTabPageAccessibility(index, selectedIndex)
      return !a11y.accessibilityElementsHidden &&
        a11y.importantForAccessibility === "auto" &&
        a11y.pointerEvents === "auto"
    })
    assert.deepEqual(exposed.map((page) => page.key), [selected.key])
    // The bottom bar derives its selected item from the same slot route name.
    assert.equal(getBottomNavKeyForRoute(selected.routeName), selected.key)
    for (const [index] of MAIN_TAB_PAGES.entries()) {
      if (index === selectedIndex) continue
      assert.deepEqual(getMainTabPageAccessibility(index, selectedIndex), {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
        pointerEvents: "none"
      })
    }
  }
})

// ── Mount policy ──────────────────────────────────────────────────────

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
