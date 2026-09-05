export const MIN_TOUCH_TARGET_SIZE = 44
export const BOTTOM_NAV_ITEM_COUNT = 4
export const BOTTOM_NAV_HORIZONTAL_PADDING = 8
export const BOTTOM_NAV_VERTICAL_PADDING = 6
export const BOTTOM_NAV_BORDER_WIDTH = 1.5
export const BOTTOM_NAV_ITEM_HEIGHT = 45
export const BOTTOM_NAV_HEIGHT =
  BOTTOM_NAV_ITEM_HEIGHT
  + BOTTOM_NAV_VERTICAL_PADDING * 2
  + BOTTOM_NAV_BORDER_WIDTH * 2
export const BOTTOM_NAV_CONTENT_GAP = 16

const MIN_BOTTOM_OFFSET = 12
const SAFE_AREA_OFFSET_ADJUSTMENT = 2
const MIN_HORIZONTAL_INSET = 24
const MAX_HORIZONTAL_INSET = 42
const HORIZONTAL_INSET_RATIO = 0.08

export interface BottomNavLayoutInput {
  viewportWidth: number
  safeAreaBottom: number
  visible: boolean
}

export interface BottomNavLayoutMetrics {
  viewportWidth: number
  safeAreaBottom: number
  visible: boolean
  height: number
  itemHeight: number
  bottomOffset: number
  contentGap: number
  contentInset: number
  horizontalInset: number
  horizontalPadding: number
  navWidth: number
  tabWidth: number
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function resolveBottomNavLayout(
  input: BottomNavLayoutInput
): BottomNavLayoutMetrics {
  const viewportWidth = finiteNonNegative(input.viewportWidth)
  const safeAreaBottom = finiteNonNegative(input.safeAreaBottom)
  const minimumNavWidth =
    BOTTOM_NAV_ITEM_COUNT * MIN_TOUCH_TARGET_SIZE
    + BOTTOM_NAV_HORIZONTAL_PADDING * 2
  const idealHorizontalInset = clamp(
    viewportWidth * HORIZONTAL_INSET_RATIO,
    MIN_HORIZONTAL_INSET,
    MAX_HORIZONTAL_INSET
  )
  const maximumTargetSafeInset = Math.max(
    0,
    (viewportWidth - minimumNavWidth) / 2
  )
  const horizontalInset = Math.min(
    idealHorizontalInset,
    maximumTargetSafeInset
  )
  const navWidth = Math.max(0, viewportWidth - horizontalInset * 2)
  const tabWidth = Math.max(
    0,
    (navWidth - BOTTOM_NAV_HORIZONTAL_PADDING * 2) / BOTTOM_NAV_ITEM_COUNT
  )
  const bottomOffset = Math.max(
    safeAreaBottom - SAFE_AREA_OFFSET_ADJUSTMENT,
    MIN_BOTTOM_OFFSET
  )
  const contentInset = input.visible
    ? bottomOffset + BOTTOM_NAV_HEIGHT + BOTTOM_NAV_CONTENT_GAP
    : safeAreaBottom

  return {
    viewportWidth,
    safeAreaBottom,
    visible: input.visible,
    height: BOTTOM_NAV_HEIGHT,
    itemHeight: BOTTOM_NAV_ITEM_HEIGHT,
    bottomOffset,
    contentGap: BOTTOM_NAV_CONTENT_GAP,
    contentInset,
    horizontalInset,
    horizontalPadding: BOTTOM_NAV_HORIZONTAL_PADDING,
    navWidth,
    tabWidth,
  }
}
