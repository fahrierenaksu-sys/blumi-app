import {
  MAIN_TAB_PAGER_RUBBER_BAND_COEFFICIENT,
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

/** Offset shown for `overscroll` px past an edge; always smaller than the finger travel. */
export function rubberBand(
  overscroll: number,
  dimension: number,
  coefficient: number = MAIN_TAB_PAGER_RUBBER_BAND_COEFFICIENT
): number {
  "worklet"
  if (dimension <= 0 || overscroll === 0) return 0
  const distance = Math.abs(overscroll)
  const banded = (1 - 1 / ((distance * coefficient) / dimension + 1)) * dimension
  return overscroll < 0 ? -banded : banded
}

/**
 * Visible pager position (px, page index * width) for a raw finger position.
 * The drag follows the finger 1:1 within one page of its base page, meets a
 * hard stop one page away (a settle can only move one page), and rubber-bands
 * past the first or last swipeable page.
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
  if (rawPosition < lower) {
    return lowerIndex < minIndex
      ? lower + rubberBand(rawPosition - lower, width)
      : lower
  }
  if (rawPosition > upper) {
    return upperIndex > maxIndex
      ? upper + rubberBand(rawPosition - upper, width)
      : upper
  }
  return rawPosition
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

/** Nearest swipeable page to a (possibly mid-animation) position. */
export function resolveMainTabPagerBaseIndex(position: number, width: number): number {
  "worklet"
  if (!(width > 0)) return MAIN_TAB_SWIPE_MIN_INDEX
  return clampIndex(Math.round(position / width), MAIN_TAB_SWIPE_MIN_INDEX, MAIN_TAB_SWIPE_MAX_INDEX)
}

/**
 * Visibility of a page while the pager moves. A page outside the swipeable
 * range is shown only while it is the committed page, so the Chats rubber band
 * reveals the background instead of the unreachable Discover page.
 */
export function getMainTabPageOpacity(pageIndex: number, committedIndex: number): number {
  "worklet"
  return isMainTabPageSwipeable(pageIndex) || pageIndex === committedIndex ? 1 : 0
}

// ── Selection state shared by taps, swipes and navigation ───────────────
//
// One source of truth: the native-stack slot route name. The UI thread keeps
// `committedIndex` as its view of that value, advances it only when a settle
// animation finishes (then asks JS to commit once), and resynchronises from
// the route when navigation changed it elsewhere (tap, deep link, back).

export interface MainTabPagerUiState {
  /** Page the UI thread last settled on or synced from navigation. */
  committedIndex: number
  /** Incremented to invalidate an in-flight gesture or settle animation. */
  epoch: number
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
  return { committedIndex, epoch: 0 }
}

/**
 * A bottom-bar tap: stop any drag or settle so it can never commit after the
 * tap, then commit the tapped page (the route sync that follows moves the
 * pager). Tapping the committed page only returns an interrupted pager to it.
 */
export function reduceMainTabPagerTap(
  state: MainTabPagerUiState,
  index: number
): MainTabPagerUiTransition {
  "worklet"
  const alreadyCommitted = index === state.committedIndex
  return {
    state: { committedIndex: state.committedIndex, epoch: state.epoch + 1 },
    commitIndex: alreadyCommitted ? null : index,
    snap: alreadyCommitted,
    interrupt: true
  }
}

/** A settle animation reached `index`: commit it once if it changed the page. */
export function reduceMainTabPagerSettled(
  state: MainTabPagerUiState,
  index: number
): MainTabPagerUiTransition {
  "worklet"
  if (index === state.committedIndex) {
    return { state, commitIndex: null, snap: false, interrupt: false }
  }
  return {
    state: { committedIndex: index, epoch: state.epoch },
    commitIndex: index,
    snap: false,
    interrupt: false
  }
}

/**
 * Navigation now selects `routeIndex`. When the UI already settled there (the
 * commit of its own swipe) nothing happens, so a follow-up swipe that already
 * started is not interrupted. Otherwise the change came from elsewhere and the
 * pager jumps to it, invalidating any drag or settle.
 */
export function reduceMainTabPagerRouteSync(
  state: MainTabPagerUiState,
  routeIndex: number
): MainTabPagerUiTransition {
  "worklet"
  if (routeIndex < 0 || routeIndex === state.committedIndex) {
    return { state, commitIndex: null, snap: false, interrupt: false }
  }
  return {
    state: { committedIndex: routeIndex, epoch: state.epoch + 1 },
    commitIndex: null,
    snap: true,
    interrupt: true
  }
}

/** App backgrounding or a cancelled gesture: return to the committed page. */
export function reduceMainTabPagerSettleToCommitted(
  state: MainTabPagerUiState
): MainTabPagerUiTransition {
  "worklet"
  return {
    state: { committedIndex: state.committedIndex, epoch: state.epoch + 1 },
    commitIndex: null,
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

/** Swipe neighbours of a page: pages one drag away. Discover has none. */
export function getMainTabPageNeighbours(index: number): number[] {
  if (!isMainTabPageSwipeable(index)) return []
  return [index - 1, index + 1].filter(isMainTabPageSwipeable)
}

/**
 * Pages to keep mounted. A page mounts on its first selection and stays
 * mounted (its own focus-aware effects pause while it is not selected).
 * Never-visited swipe neighbours are added only when `includeNeighbours` is
 * set, which the pager does after the selected page settled and idled, or
 * when a drag starts before that happened.
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

export function areMainTabPagerMountedPagesEqual(a: readonly boolean[], b: readonly boolean[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

// ── Accessibility ────────────────────────────────────────────────────────

export interface MainTabPageAccessibility {
  accessibilityElementsHidden: boolean
  importantForAccessibility: "auto" | "no-hide-descendants"
  pointerEvents: "auto" | "none"
}

/** Only the selected page is reachable by touch and assistive technology. */
export function getMainTabPageAccessibility(
  pageIndex: number,
  selectedIndex: number
): MainTabPageAccessibility {
  const selected = pageIndex === selectedIndex
  return {
    accessibilityElementsHidden: !selected,
    importantForAccessibility: selected ? "auto" : "no-hide-descendants",
    pointerEvents: selected ? "auto" : "none"
  }
}
