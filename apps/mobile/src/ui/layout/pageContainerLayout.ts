export const PAGE_CONTAINER_SPACING = Object.freeze({
  compactHorizontalInset: 16,
  regularHorizontalInset: 20,
  wideHorizontalInset: 24,
  maxContentWidth: 680
})

export const PAGE_COMPONENT_SPACING = Object.freeze({
  controlGap: 8,
  componentGap: 12,
  sectionGap: 24,
  cardPadding: 16
})

export interface PageContainerLayout {
  horizontalInset: number
  contentWidth: number
  maxContentWidth: number
}

function normalizeWidth(width: number): number {
  return Number.isFinite(width) ? Math.max(0, width) : 0
}

export function resolvePageContainerLayout(width: number): PageContainerLayout {
  const viewportWidth = normalizeWidth(width)
  const baseInset = viewportWidth >= 375
    ? PAGE_CONTAINER_SPACING.regularHorizontalInset
    : PAGE_CONTAINER_SPACING.compactHorizontalInset
  const uncappedContentWidth = Math.max(0, viewportWidth - baseInset * 2)
  const contentWidth = Math.min(
    uncappedContentWidth,
    PAGE_CONTAINER_SPACING.maxContentWidth
  )
  const horizontalInset = contentWidth === PAGE_CONTAINER_SPACING.maxContentWidth
    ? (viewportWidth - contentWidth) / 2
    : baseInset

  return {
    horizontalInset,
    contentWidth,
    maxContentWidth: PAGE_CONTAINER_SPACING.maxContentWidth
  }
}

/** A PageSafeArea-owned gutter must not be subtracted a second time. */
export function resolvePageContentWidth(width: number, parentHasGutter: boolean): number | "100%" {
  return parentHasGutter ? "100%" : resolvePageContainerLayout(width).contentWidth
}

export function resolvePageScrollBottomPadding(input: {
  bottomContentInset: number
  safeAreaBottom: number
  safeAreaBottomIncluded: boolean
}): number {
  const inset = Number.isFinite(input.bottomContentInset) ? Math.max(0, input.bottomContentInset) : 0
  const safeBottom = Number.isFinite(input.safeAreaBottom) ? Math.max(0, input.safeAreaBottom) : 0
  return Math.max(0, inset - (input.safeAreaBottomIncluded ? safeBottom : 0))
}
