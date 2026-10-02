// Pure rules that let the bottom-bar indicator follow the main-page pager on
// the UI thread. Functions marked 'worklet' run inside Reanimated reactions;
// they are plain functions under node:test.

/**
 * Bottom-bar order. It must equal the main-page pager order (MAIN_TAB_PAGES),
 * because the pager's fractional page index drives the bar's indicator.
 */
export const BOTTOM_NAV_KEY_ORDER = Object.freeze(["discover", "chats", "myroom", "shop"] as const)

/** Shared values the pager writes and the bottom bar reads (see ui/mainTabPagerIndicator.ts). */
export interface MainTabPagerIndicatorValues {
  /** Fractional page index (0 = Discover ... 3 = Shop) last shown while tracking. */
  progress: { value: number }
  /** True while a finger drag or a settle animation moves the pages. */
  tracking: { value: boolean }
  /**
   * Page the pager shows on the UI thread (a tap snaps it before navigation
   * answers), or -1 while no pager is mounted. The bar animates its pill to
   * it in a UI-thread reaction, so a tap never waits for a JS render.
   */
  selection: { value: number }
}

/**
 * Whether the bar should place its pill for a newly committed `activeIndex`
 * from JS: not when the pager already placed it there on the UI thread.
 */
export function shouldPlaceBottomNavSelectionFromJs(pagerSelection: number, activeIndex: number): boolean {
  return pagerSelection !== activeIndex
}

export interface MainTabPagerIndicatorSample {
  progress: number
  tracking: boolean
}

/**
 * The pager's contribution to the bottom bar for one frame. It tracks only
 * while a drag or settle animation moves the pages; instant changes (a tap,
 * a route sync, Reduce Motion) are left to the bar's own selection motion,
 * which runs when the selected route changes.
 */
export function resolveMainTabPagerIndicatorSample(input: {
  position: number
  width: number
  dragging: boolean
  animating: boolean
}): MainTabPagerIndicatorSample {
  "worklet"
  const progress = input.width > 0 ? input.position / input.width : Number.NaN
  return {
    progress,
    tracking: (input.dragging || input.animating) && Number.isFinite(progress)
  }
}

export function publishMainTabPagerIndicator(
  indicator: MainTabPagerIndicatorValues,
  sample: MainTabPagerIndicatorSample
): void {
  "worklet"
  if (sample.tracking) indicator.progress.value = sample.progress
  indicator.tracking.value = sample.tracking
}

/**
 * Where the bar's pill sits for the pager's current values: on the pages'
 * fractional position while a finger drag (and the settle that finishes it)
 * moves them, otherwise exactly on the selected page. A selection change is
 * never animated: a tap, a route sync or the end of a settle lands at once.
 * Null when no pager is mounted (the bar then follows its own route).
 */
export function readMainTabPagerIndicatorTarget(indicator: MainTabPagerIndicatorValues): number | null {
  "worklet"
  if (indicator.tracking.value) return indicator.progress.value
  return indicator.selection.value >= 0 ? indicator.selection.value : null
}

/** Indicator position in tab units, kept on the bar through edge rubber bands. */
export function resolveBottomNavIndicatorIndex(progress: number, itemCount: number): number {
  "worklet"
  if (!Number.isFinite(progress) || itemCount <= 0) return 0
  return Math.min(itemCount - 1, Math.max(0, progress))
}

/** How strongly a tab shows its selected icon and label (0..1) for an indicator position. */
export function getBottomNavItemEmphasis(itemIndex: number, indicatorIndex: number): number {
  "worklet"
  return Math.max(0, 1 - Math.abs(indicatorIndex - itemIndex))
}
