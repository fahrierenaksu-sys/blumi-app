// Direction-aware ownership of a horizontal drag that starts on a paged
// scroller inside a main-page pager page (MainTabPagerEdgeHandoffScrollOwner
// in ui/MainTabPagerGestureOwnership.tsx). Functions marked 'worklet' run in
// that owner's gesture on the UI thread; they are plain functions under
// node:test.

export const MAIN_TAB_PAGER_EDGE_HANDOFF = Object.freeze({
  /**
   * Travel (px) before the drag is assigned. Below the pager's own
   * activation offset (12 px), so the pager never waits on an undecided drag.
   */
  slop: 8,
  /** Distance (px) from an end of the scroll range that counts as the end. */
  edgeTolerance: 1
})

/**
 * - `wait`: not decided yet.
 * - `scroller`: the scroller can move in the drag's direction and keeps it.
 * - `release`: the scroller cannot move that way (or the drag is vertical);
 *   the main-page pager and the page's vertical scrolling decide.
 */
export type HorizontalScrollerDragOwner = "wait" | "scroller" | "release"

/**
 * Who owns a drag that started on a horizontal scroller. `dx` and `dy` are
 * the finger's travel since touch down (px; `dx > 0` moves right, towards the
 * previous page). The scroller keeps a mostly horizontal drag only when it
 * can still scroll that way; at its first page a drag towards a previous page
 * (and at its last page a drag towards a next page) goes to the pager.
 */
export function resolveHorizontalScrollerDragOwner(input: {
  dx: number
  dy: number
  /** Current horizontal content offset (px, 0 at the first page). */
  scrollOffset: number
  /** Largest content offset (px): (pages - 1) * page width. */
  maxScrollOffset: number
}): HorizontalScrollerDragOwner {
  "worklet"
  const { dx, dy, scrollOffset, maxScrollOffset } = input
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  const slop = MAIN_TAB_PAGER_EDGE_HANDOFF.slop
  if (absX < slop && absY < slop) return "wait"
  if (absY >= absX) return "release"
  // Unknown geometry: keep the previous behaviour (the scroller owns it).
  if (!Number.isFinite(scrollOffset) || !Number.isFinite(maxScrollOffset)) return "scroller"
  const tolerance = MAIN_TAB_PAGER_EDGE_HANDOFF.edgeTolerance
  const canScrollBackward = scrollOffset > tolerance
  const canScrollForward = scrollOffset < maxScrollOffset - tolerance
  if (dx > 0) return canScrollBackward ? "scroller" : "release"
  return canScrollForward ? "scroller" : "release"
}
