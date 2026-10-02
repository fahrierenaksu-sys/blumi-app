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
 * After the shown page is up, every other page is mounted once, one page per
 * idle slot: this delay, then the next idle callback. A slot never renders
 * while a drag or settle moves the pages, so no first render competes with
 * a swipe or a tab switch.
 */
export const MAIN_TAB_PAGER_IDLE_MOUNT_DELAY_MS = 350

/** A page that a drag had to mount while showing it fades its content in this fast. */
export const MAIN_TAB_PAGE_FADE_IN_MS = 160
