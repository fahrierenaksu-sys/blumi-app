import {
  MAIN_TAB_PAGER_SETTLE,
  MAIN_TAB_PAGER_SPRING,
  MAIN_TAB_PAGES,
  MAIN_TAB_SWIPE_MAX_INDEX,
  MAIN_TAB_SWIPE_MIN_INDEX,
  type MainTabRouteName
} from "./mainTabPagerConfig"

// Pure pager rules. Functions marked 'worklet' run on the UI thread inside the
// pan gesture and settle animation; they are plain functions under node:test.

export function getMainTabPageIndex(routeName: string | undefined): number {
  return MAIN_TAB_PAGES.findIndex((page) => page.routeName === routeName)
}

export function isMainTabRouteName(routeName: string | undefined): routeName is MainTabRouteName {
  return getMainTabPageIndex(routeName) >= 0
}

export function isMainTabPageSwipeable(index: number): boolean {
  "worklet"
  return index >= MAIN_TAB_SWIPE_MIN_INDEX && index <= MAIN_TAB_SWIPE_MAX_INDEX
}

function clampIndex(index: number, minIndex: number, maxIndex: number): number {
  "worklet"
  return Math.min(maxIndex, Math.max(minIndex, index))
}

/** Keep every rendered frame inside the page range, including spring overshoot. */
export function clampMainTabPagerPosition(position: number, width: number): number {
  "worklet"
  if (!(width > 0) || !Number.isFinite(position)) return 0
  return Math.min(MAIN_TAB_SWIPE_MAX_INDEX * width, Math.max(MAIN_TAB_SWIPE_MIN_INDEX * width, position))
}

/**
 * Visible pager position (px, page index * width) for a raw finger position.
 * The drag follows the finger 1:1 within one page of its base page, meets a
 * hard stop one page away (a settle can only move one page), and never moves
 * past the first or last swipeable page into an empty background.
 */
export function resolveMainTabPagerDragPosition(input: {
  rawPosition: number
  width: number
  baseIndex: number
  minIndex?: number
  maxIndex?: number
}): number {
  "worklet"
  const minIndex = input.minIndex ?? MAIN_TAB_SWIPE_MIN_INDEX
  const maxIndex = input.maxIndex ?? MAIN_TAB_SWIPE_MAX_INDEX
  const { rawPosition, width, baseIndex } = input
  if (width <= 0) return rawPosition
  const lowerIndex = baseIndex - 1
  const upperIndex = baseIndex + 1
  const lower = Math.max(minIndex, lowerIndex) * width
  const upper = Math.min(maxIndex, upperIndex) * width
  return Math.min(upper, Math.max(lower, rawPosition))
}

/**
 * Page index a released drag settles on.
 *
 * A release closer than `flickMinDistance` to its base page returns.
 * `velocity` is the pager position velocity in px/s (positive toward the next
 * page, i.e. the finger moving left). A flick (fast enough and already moved a
 * little) goes to the nearest page in the flick direction, so a quick flick
 * completes at a short distance and a reversal flick returns. Otherwise the
 * position is projected by the release velocity and rounded, so a short slow
 * drag returns and a drag past half a page completes. The result stays within
 * one page of `baseIndex` and inside the swipeable range.
 */
export function resolveMainTabPagerSettleIndex(input: {
  position: number
  velocity: number
  width: number
  baseIndex: number
  minIndex?: number
  maxIndex?: number
}): number {
  "worklet"
  const minIndex = input.minIndex ?? MAIN_TAB_SWIPE_MIN_INDEX
  const maxIndex = input.maxIndex ?? MAIN_TAB_SWIPE_MAX_INDEX
  const { position, velocity, width, baseIndex } = input
  const base = clampIndex(baseIndex, minIndex, maxIndex)
  if (!(width > 0) || !Number.isFinite(position) || !Number.isFinite(velocity)) return base
  const delta = position - base * width
  // Movement shorter than the flick distance is jitter: always return.
  if (Math.abs(delta) < MAIN_TAB_PAGER_SETTLE.flickMinDistance) return base
  const pagePosition = position / width
  let target: number
  if (Math.abs(velocity) >= MAIN_TAB_PAGER_SETTLE.flickVelocity) {
    target = velocity > 0 ? Math.ceil(pagePosition - 1e-6) : Math.floor(pagePosition + 1e-6)
  } else {
    target = Math.round((position + velocity * MAIN_TAB_PAGER_SETTLE.projectionSeconds) / width)
  }
  return clampIndex(clampIndex(target, base - 1, base + 1), minIndex, maxIndex)
}

/**
 * Spring start velocity (px/s). It keeps the release velocity so there is no
 * speed jump, but caps it so a critically damped spring can overshoot the
 * target by at most `maxOvershootFraction` of a page. For a critically damped
 * spring starting `d` away with speed `v` toward the target, the overshoot is
 * at most (v - wd) / (w * e), where w = sqrt(stiffness / mass).
 */
export function resolveMainTabPagerSettleVelocity(input: {
  position: number
  targetPosition: number
  velocity: number
  width: number
}): number {
  "worklet"
  const { position, targetPosition, velocity, width } = input
  if (!Number.isFinite(velocity) || velocity === 0 || !(width > 0)) return 0
  const omega = Math.sqrt(MAIN_TAB_PAGER_SPRING.stiffness / MAIN_TAB_PAGER_SPRING.mass)
  const remaining = targetPosition - position
  const towardTarget = remaining !== 0 && Math.sign(remaining) === Math.sign(velocity)
  const limit = towardTarget
    ? omega * Math.abs(remaining) + omega * Math.E * MAIN_TAB_PAGER_SETTLE.maxOvershootFraction * width
    : omega * Math.E * MAIN_TAB_PAGER_SETTLE.maxAwayExcursionFraction * width
  return Math.sign(velocity) * Math.min(Math.abs(velocity), limit)
}

/**
 * Reanimated's spring ends when its energy falls to `energyThreshold` times
 * its starting energy. The default (6e-9) keeps a page "settling" for about
 * 0.65 s although it looks still after about 0.25 s, so the settle ends
 * instead once it is within `restDistance` and slower than `restSpeed`.
 * Energies match Reanimated's: ½·k·x² + ½·m·v².
 */
export function resolveMainTabPagerSpringEnergyThreshold(input: {
  displacement: number
  velocity: number
}): number {
  "worklet"
  const { stiffness, mass } = MAIN_TAB_PAGER_SPRING
  const { restDistance, restSpeed } = MAIN_TAB_PAGER_SETTLE
  const initial = 0.5 * stiffness * input.displacement ** 2 + 0.5 * mass * input.velocity ** 2
  const rest = 0.5 * stiffness * restDistance ** 2 + 0.5 * mass * restSpeed ** 2
  if (!Number.isFinite(initial) || initial <= rest) return 1
  return Math.max(6e-9, rest / initial)
}

/**
 * Whether a touch that lands during a settle catches the pages where they
 * are (so the finger can drag them on). In the last few pixels the page
 * lands at once instead: the page looks still there, and the touch is meant
 * for it.
 */
export function shouldMainTabPagerTouchCatchSettle(input: {
  position: number
  targetPosition: number
}): boolean {
  "worklet"
  const distance = Math.abs(input.targetPosition - input.position)
  return Number.isFinite(distance) && distance > MAIN_TAB_PAGER_SETTLE.landDistance
}

/** Nearest swipeable page to a (possibly mid-animation) position. */
export function resolveMainTabPagerBaseIndex(position: number, width: number): number {
  "worklet"
  if (!(width > 0)) return MAIN_TAB_SWIPE_MIN_INDEX
  return clampIndex(Math.round(position / width), MAIN_TAB_SWIPE_MIN_INDEX, MAIN_TAB_SWIPE_MAX_INDEX)
}

/**
 * Visibility of a page while the pager moves. A page outside the swipeable
 * range (none today; kept for a page that opts out) is shown only while it
 * is the committed page.
 */
export function getMainTabPageOpacity(pageIndex: number, committedIndex: number): number {
  "worklet"
  return isMainTabPageSwipeable(pageIndex) || pageIndex === committedIndex ? 1 : 0
}

// ── Selection state shared by taps, swipes and navigation ───────────────
//
// One source of truth: the native-stack slot route name. The UI thread keeps
// `committedIndex` as its view of that value. A tap shows its page at once and
// asks JS to commit it straight away. A released swipe decides its page at
// once too, but asks JS to commit it only when the settle has ended: the
// commit re-renders the navigator, the bottom bar and the two pages whose
// selection flips, and fires page focus work, none of which may compete with
// the settle's frames. The UI thread resynchronises from the route when
// navigation changed it elsewhere (deep link, back, notification).

export interface MainTabPagerUiState {
  /** Page the UI thread shows: being settled on, tapped, or synced from navigation. */
  committedIndex: number
  /** Incremented to invalidate an in-flight gesture or settle animation. */
  epoch: number
  /**
   * Page whose commit JS has been asked to dispatch and whose route has not
   * arrived yet, or -1. Route syncs of earlier commits (rapid taps or swipes)
   * are ignored until this one lands, so the pager never jumps back through
   * intermediate pages.
   */
  pendingCommitIndex: number
  /**
   * Page a released swipe is settling on whose commit waits for the settle to
   * end, or -1. Navigation has not been asked yet, so a route change that
   * arrives meanwhile came from elsewhere and wins.
   */
  deferredCommitIndex: number
}

export interface MainTabPagerUiTransition {
  state: MainTabPagerUiState
  /** Page JS must commit to navigation, or null. */
  commitIndex: number | null
  /** Whether the position must jump to `state.committedIndex` now. */
  snap: boolean
  /** Whether any running settle animation or drag must stop. */
  interrupt: boolean
}

export function createMainTabPagerUiState(committedIndex: number): MainTabPagerUiState {
  "worklet"
  return { committedIndex, epoch: 0, pendingCommitIndex: -1, deferredCommitIndex: -1 }
}

/**
 * A bottom-bar tap: stop any drag or settle so it can never commit after the
 * tap, then commit the tapped page once. A page that is already mounted is
 * shown at once on the UI thread (optimistic snap), so the tap never waits
 * for the JS navigation round trip; a never-visited page waits for the route
 * sync that mounts it, so the pager never shows an empty page. Tapping the
 * page already shown only returns an interrupted pager to it (and commits it
 * if a swipe had chosen it but its settle never ended).
 */
export function reduceMainTabPagerTap(
  state: MainTabPagerUiState,
  index: number,
  targetMounted: boolean
): MainTabPagerUiTransition {
  "worklet"
  const epoch = state.epoch + 1
  if (index === state.committedIndex) {
    const deferred = state.deferredCommitIndex
    return {
      state: {
        committedIndex: state.committedIndex,
        epoch,
        pendingCommitIndex: deferred >= 0 ? deferred : state.pendingCommitIndex,
        deferredCommitIndex: -1
      },
      commitIndex: deferred >= 0 ? deferred : null,
      snap: true,
      interrupt: true
    }
  }
  if (targetMounted) {
    return {
      state: { committedIndex: index, epoch, pendingCommitIndex: index, deferredCommitIndex: -1 },
      commitIndex: index,
      snap: true,
      interrupt: true
    }
  }
  return {
    state: { committedIndex: state.committedIndex, epoch, pendingCommitIndex: -1, deferredCommitIndex: -1 },
    commitIndex: index,
    snap: false,
    interrupt: true
  }
}

/**
 * A released drag starts settling on `index`. The UI thread shows that page
 * from now on (the bottom bar's pill follows it), but navigation is asked
 * only when the settle ends (reduceMainTabPagerSettleEnd). The page takes
 * touches the whole time: touches never depend on the committed route, and a
 * touch near the end of a settle lands it at once (see
 * shouldMainTabPagerTouchCatchSettle).
 */
export function reduceMainTabPagerSettleStart(
  state: MainTabPagerUiState,
  index: number
): MainTabPagerUiTransition {
  "worklet"
  if (index === state.committedIndex) {
    return { state, commitIndex: null, snap: false, interrupt: false }
  }
  return {
    state: {
      committedIndex: index,
      epoch: state.epoch,
      pendingCommitIndex: state.pendingCommitIndex,
      deferredCommitIndex: index
    },
    commitIndex: null,
    snap: false,
    interrupt: false
  }
}

/**
 * The settle came to rest (or was landed by a touch): commit the page the
 * release chose, once. Nothing happens when the release returned to the page
 * navigation already shows.
 */
export function reduceMainTabPagerSettleEnd(state: MainTabPagerUiState): MainTabPagerUiTransition {
  "worklet"
  const deferred = state.deferredCommitIndex
  if (deferred < 0) return { state, commitIndex: null, snap: false, interrupt: false }
  return {
    state: {
      committedIndex: state.committedIndex,
      epoch: state.epoch,
      pendingCommitIndex: deferred,
      deferredCommitIndex: -1
    },
    commitIndex: deferred,
    snap: false,
    interrupt: false
  }
}

/**
 * Navigation now selects `routeIndex`. When the UI already shows it (the
 * commit of its own swipe or tap) nothing moves, so a follow-up swipe that
 * already started is not interrupted. While a commit is pending, the commits
 * of earlier rapid taps land first and are ignored; the pending commit's own
 * route clears it. Otherwise the change came from elsewhere (also while a
 * settle still waits to commit: navigation was not asked yet) and the pager
 * jumps to it, invalidating any drag or settle.
 */
export function reduceMainTabPagerRouteSync(
  state: MainTabPagerUiState,
  routeIndex: number
): MainTabPagerUiTransition {
  "worklet"
  if (routeIndex < 0) {
    return { state, commitIndex: null, snap: false, interrupt: false }
  }
  if (state.pendingCommitIndex >= 0) {
    if (routeIndex !== state.pendingCommitIndex) {
      return { state, commitIndex: null, snap: false, interrupt: false }
    }
    return {
      state: {
        committedIndex: state.committedIndex,
        epoch: state.epoch,
        pendingCommitIndex: -1,
        deferredCommitIndex: state.deferredCommitIndex
      },
      commitIndex: null,
      snap: false,
      interrupt: false
    }
  }
  if (routeIndex === state.committedIndex) {
    if (state.deferredCommitIndex < 0) return { state, commitIndex: null, snap: false, interrupt: false }
    // Navigation selected the page the settle is going to: let it land, commit nothing.
    return {
      state: { committedIndex: state.committedIndex, epoch: state.epoch, pendingCommitIndex: -1, deferredCommitIndex: -1 },
      commitIndex: null,
      snap: false,
      interrupt: false
    }
  }
  return {
    state: { committedIndex: routeIndex, epoch: state.epoch + 1, pendingCommitIndex: -1, deferredCommitIndex: -1 },
    commitIndex: null,
    snap: true,
    interrupt: true
  }
}

/**
 * JS could not commit (navigation already shows another answer): drop any
 * pending commit and follow the route navigation actually shows.
 */
export function reduceMainTabPagerCommitRejected(
  state: MainTabPagerUiState,
  routeIndex: number
): MainTabPagerUiTransition {
  "worklet"
  return reduceMainTabPagerRouteSync(
    { committedIndex: state.committedIndex, epoch: state.epoch, pendingCommitIndex: -1, deferredCommitIndex: -1 },
    routeIndex
  )
}

/**
 * App backgrounding, a layout change or a cancelled gesture: land on the
 * committed page now, and commit it if a settle was still waiting to.
 */
export function reduceMainTabPagerSettleToCommitted(
  state: MainTabPagerUiState
): MainTabPagerUiTransition {
  "worklet"
  const deferred = state.deferredCommitIndex
  return {
    state: {
      committedIndex: state.committedIndex,
      epoch: state.epoch + 1,
      pendingCommitIndex: deferred >= 0 ? deferred : state.pendingCommitIndex,
      deferredCommitIndex: -1
    },
    commitIndex: deferred >= 0 ? deferred : null,
    snap: true,
    interrupt: true
  }
}

/** JS side of a commit: the route to select, or null when navigation already shows it. */
export function resolveMainTabPagerCommitRoute(
  currentSlotRouteName: string | undefined,
  index: number
): MainTabRouteName | null {
  const page = MAIN_TAB_PAGES[index]
  if (!page || currentSlotRouteName === undefined) return null
  return page.routeName === currentSlotRouteName ? null : page.routeName
}

// ── Mount policy ─────────────────────────────────────────────────────────

/** Swipe neighbours of a page: pages one drag away. */
export function getMainTabPageNeighbours(index: number): number[] {
  if (!isMainTabPageSwipeable(index)) return []
  return [index - 1, index + 1].filter(isMainTabPageSwipeable)
}

/**
 * Pages to keep mounted. A page mounts on its first selection and stays
 * mounted (its own focus-aware effects pause while it is not selected).
 * Never-visited swipe neighbours are added only when `includeNeighbours` is
 * set, which the pager does when a drag starts before the idle warm-up
 * (resolveMainTabPagerNextIdleMount) reached them.
 */
export function resolveMainTabPagerMountedPages(input: {
  mounted: readonly boolean[]
  selectedIndex: number
  includeNeighbours: boolean
}): boolean[] {
  const next = MAIN_TAB_PAGES.map((_, index) => input.mounted[index] === true)
  if (input.selectedIndex >= 0 && input.selectedIndex < next.length) next[input.selectedIndex] = true
  if (input.includeNeighbours) {
    for (const neighbour of getMainTabPageNeighbours(input.selectedIndex)) next[neighbour] = true
  }
  return next
}

/**
 * The page to warm in the next idle slot after launch: the never-mounted
 * page closest to the selected one (the left one first on a tie), or -1
 * once every page is mounted. Pages warm one per slot, so no slot renders
 * more than one page.
 */
export function resolveMainTabPagerNextIdleMount(mounted: readonly boolean[], selectedIndex: number): number {
  let best = -1
  for (let index = 0; index < MAIN_TAB_PAGES.length; index += 1) {
    if (mounted[index] === true) continue
    if (best < 0 || Math.abs(index - selectedIndex) < Math.abs(best - selectedIndex)) best = index
  }
  return best
}

/** Mounted pages plus `index`. */
export function withMainTabPageMounted(mounted: readonly boolean[], index: number): boolean[] {
  return MAIN_TAB_PAGES.map((_, page) => mounted[page] === true || page === index)
}

export function areMainTabPagerMountedPagesEqual(a: readonly boolean[], b: readonly boolean[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** Mounted pages as one number the UI thread can read (bit `index` set = mounted). */
export function getMainTabPagerMountedMask(mounted: readonly boolean[]): number {
  return mounted.reduce((mask, isMounted, index) => (isMounted ? mask | (1 << index) : mask), 0)
}

export function isMainTabPageInMountedMask(mask: number, index: number): boolean {
  "worklet"
  return index >= 0 && (mask & (1 << index)) !== 0
}

// ── Accessibility ────────────────────────────────────────────────────────

export interface MainTabPageAccessibility {
  accessibilityElementsHidden: boolean
  importantForAccessibility: "auto" | "no-hide-descendants"
  pointerEvents: "auto"
}

/**
 * Only the selected page is reachable by assistive technology. It takes the
 * page's own selection, not the selected index, so a tab change reaches only
 * the two pages whose selection flips.
 *
 * Touch is never gated on the selection: a swipe commits its route only when
 * its settle ends, and the page it landed on must take a tap at once. Pages
 * off screen cannot be hit anyway (the pager clips them), and while a drag
 * shows two pages the pager's pan owns the touch.
 */
export function getMainTabPageAccessibility(selected: boolean): MainTabPageAccessibility {
  return {
    accessibilityElementsHidden: !selected,
    importantForAccessibility: selected ? "auto" : "no-hide-descendants",
    pointerEvents: "auto"
  }
}
