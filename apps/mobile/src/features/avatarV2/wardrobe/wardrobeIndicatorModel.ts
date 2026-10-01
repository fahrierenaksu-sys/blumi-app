/**
 * WRD-3: geometry for the wardrobe's sliding selection indicators and the
 * live page dots. The indicators move with a UI-thread spring; the dots
 * follow the list's scroll offset frame by frame on the UI thread.
 */
export interface WardrobeIndicatorFrame {
  x: number
  width: number
}

/** Category tabs: `flex: 1` with a max width, left-aligned with a fixed gap. */
export const WARDROBE_TAB_GAP = 4
export const WARDROBE_TAB_MAX_WIDTH = 84

export function getWardrobeTabIndicatorFrame(input: {
  rowWidth: number
  count: number
  index: number
  gap?: number
  maxTabWidth?: number
}): WardrobeIndicatorFrame | null {
  const gap = input.gap ?? WARDROBE_TAB_GAP
  const maxTabWidth = input.maxTabWidth ?? WARDROBE_TAB_MAX_WIDTH
  if (!(input.rowWidth > 0) || !(input.count > 0) || input.index < 0 || input.index >= input.count) return null
  const width = Math.min(maxTabWidth, (input.rowWidth - gap * (input.count - 1)) / input.count)
  if (!(width > 0)) return null
  return { x: input.index * (width + gap), width }
}

/** Section switcher: equal halves inside a padded track. */
export function getWardrobeSegmentIndicatorFrame(input: {
  trackWidth: number
  padding: number
  count: number
  index: number
}): WardrobeIndicatorFrame | null {
  if (!(input.trackWidth > 0) || !(input.count > 0) || input.index < 0 || input.index >= input.count) return null
  const width = (input.trackWidth - input.padding * 2) / input.count
  if (!(width > 0)) return null
  return { x: input.index * width, width }
}

export const WARDROBE_PAGE_DOT_SIZE = 6
export const WARDROBE_PAGE_DOT_ACTIVE_WIDTH = 16

/**
 * Width of page dot `index` while the list sits at `position` pages (the
 * scroll offset divided by the page width). The active dot is a pill; a dot
 * grows and shrinks continuously as a page slides in, so the row's total
 * width never changes mid-swipe.
 */
export function getWardrobePageDotWidth(position: number, index: number): number {
  "worklet"
  const distance = Math.abs((Number.isFinite(position) ? position : 0) - index)
  const presence = Math.max(0, 1 - distance)
  return WARDROBE_PAGE_DOT_SIZE + (WARDROBE_PAGE_DOT_ACTIVE_WIDTH - WARDROBE_PAGE_DOT_SIZE) * presence
}
