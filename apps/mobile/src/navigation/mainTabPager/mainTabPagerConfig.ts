import type { BottomNavKey } from "../../ui/bottomNav"

/**
 * Single rollback switch for the finger-driven main-page pager.
 *
 * `true`: the four bottom-navigation destinations share one native-stack slot
 * route that hosts `MainTabPager`; taps and swipes select pages inside it.
 * `false`: the previous behaviour, four separate native-stack routes switched
 * with `navigate(..., { pop: true, merge: true })`, is restored unchanged.
 */
export const MAIN_TAB_PAGER_ENABLED: boolean = true

export type MainTabRouteName = "Lobby" | "Inbox" | "MyRoom" | "CosmeticShop"

export interface MainTabPageConfig {
  readonly key: BottomNavKey
  readonly routeName: MainTabRouteName
  /**
   * Whether a horizontal finger drag may move this page. A page that sets
   * this to false is reached by the bottom bar only, and the pager is
   * disabled while it is selected. Horizontal interactions inside a
   * swipeable page own their drags through a Gesture Handler relation
   * (ui/MainTabPagerGestureOwnership.tsx) instead.
   */
  readonly swipeable: boolean
}

/**
 * Page order equals the bottom bar order, and all four pages form one
 * contiguous swipeable range (owner decision 2026-09-30: Chats swipes right
 * to Discover). A drag that starts on the Discover card stays a like/pass
 * swipe because the card's pan blocks the pager (useDiscoverCardSwipe); a
 * drag anywhere else on Discover moves the page. Discover and Shop stop
 * at the outer edges without exposing an empty background.
 */
export const MAIN_TAB_PAGES: readonly MainTabPageConfig[] = Object.freeze([
  Object.freeze({ key: "discover", routeName: "Lobby", swipeable: true }),
  Object.freeze({ key: "chats", routeName: "Inbox", swipeable: true }),
  Object.freeze({ key: "myroom", routeName: "MyRoom", swipeable: true }),
  Object.freeze({ key: "shop", routeName: "CosmeticShop", swipeable: true })
] as const)

export const MAIN_TAB_ROUTE_NAMES: readonly MainTabRouteName[] = Object.freeze(
  MAIN_TAB_PAGES.map((page) => page.routeName)
)

/** First and last page index a drag can reach. The range is contiguous. */
export const MAIN_TAB_SWIPE_MIN_INDEX = 0
export const MAIN_TAB_SWIPE_MAX_INDEX = 3

/**
 * Pan activation. The pager activates only after a small horizontal slop and
 * fails as soon as the finger travels vertically first, so vertical lists and
 * diagonal starts keep scrolling and small horizontal jitter never moves it.
 */
export const MAIN_TAB_PAGER_ACTIVE_OFFSET_X = 12
export const MAIN_TAB_PAGER_FAIL_OFFSET_Y = 12
/**
 * The drag's direction decides, not which axis crosses its slop first. A
 * fast flick reports its first move already past both slops, and a natural
 * thumb arc drifts vertically; fixed per-axis offsets then failed those
 * swipes. The pager activates once the drag is at least this much more
 * horizontal than vertical (about 41 degrees from the horizontal).
 */
export const MAIN_TAB_PAGER_AXIS_RATIO = 1.15
/** A drag still undecided after this much vertical travel is a scroll. */
export const MAIN_TAB_PAGER_UNDECIDED_FAIL_Y = 30

export const MAIN_TAB_PAGER_SETTLE = Object.freeze({
  /** Seconds of release velocity added to the position before rounding. */
  projectionSeconds: 0.18,
  /** Release speed (px/s) that counts as a flick in its own direction. */
  flickVelocity: 450,
  /** A flick must also have moved at least this far (px) from its base page. */
  flickMinDistance: 20,
  /** Largest overshoot past the target page, as a fraction of page width. */
  maxOvershootFraction: 0.015,
  /** Largest extra excursion when the release velocity points away from the target. */
  maxAwayExcursionFraction: 0.08,
  /**
   * A touch that lands while a settle is this close (px) to its page lands
   * the page at once instead of catching it, and the touch reaches the page.
   */
  landDistance: 12,
  /** The settle is at rest (its spring ends) within this distance (px)... */
  restDistance: 0.5,
  /** ...and below this speed (px/s). */
  restSpeed: 10
})

/**
 * Critically damped spring (damping = 2 * sqrt(stiffness * mass)). It starts
 * with the release velocity so the page keeps its speed, reaches ~95% of the
 * way in about 240 ms and never oscillates; the velocity cap above bounds the
 * single possible overshoot.
 */
export const MAIN_TAB_PAGER_SPRING = Object.freeze({
  stiffness: 380,
  mass: 1,
  damping: 2 * Math.sqrt(380)
})

/**
 * A released swipe commits its page to navigation when the settle spring
 * ends (about 250 ms). Should that end never be reported, the page is
 * committed this long after the release anyway.
 */
export const MAIN_TAB_PAGER_SETTLE_COMMIT_FALLBACK_MS = 600

/**
 * Delay before each idle slot of the root navigator's deferred screen-bundle
 * preload (RootNavigator). The pager's own page warm-up uses
 * MAIN_TAB_PAGER_WARM below.
 */
export const MAIN_TAB_PAGER_IDLE_MOUNT_DELAY_MS = 350

/**
 * Page warm-up. A swipe or tab tap must never land on a page that is still
 * unmounted, so every page mounts soon after launch: the shown page's swipe
 * neighbours right after its first frame, then the farther pages, one page per
 * idle slot and back to back. A slot never runs while a drag or settle moves
 * the pages.
 */
export const MAIN_TAB_PAGER_WARM = Object.freeze({
  /** About one frame: the previous commit reaches the screen before the next slot. */
  slotDelayMs: 16,
  /** Longest a busy JS thread may postpone a neighbour's slot (startup work never keeps it cold). */
  neighbourIdleTimeoutMs: 150,
  /** Longest a busy JS thread may postpone a farther page's slot. */
  farIdleTimeoutMs: 600,
  /**
   * While a detail screen covers the pager, warm-up continues gently: after
   * the push has settled, and only in real idle time (no forced deadline), so
   * it never competes with the screen on top.
   */
  coveredDelayMs: 400
})

/**
 * A page whose content arrives after the page was drawn (its shell was on
 * screen or one swipe away) crossfades over the shell this fast. Opacity
 * only, so it also runs under Reduce Motion (motion token `crossfade`).
 */
export const MAIN_TAB_PAGE_CROSSFADE_MS = 200
