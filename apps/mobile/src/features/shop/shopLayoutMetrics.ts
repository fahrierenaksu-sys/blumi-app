export type ShopLayoutMetrics = {
  hierarchy: "live-preview"
  minimumTouchTarget: number
  horizontalInset: number
  contentWidth: number
  sectionGap: number
  showcasePadding: number
  preview: {
    cardPadding: number
    cardGap: number
    heroGap: number
    avatarStageHeight: number
    roomStageHeight: number
    avatarWidth: number
    overlayInset: number
  }
  catalog: {
    cardPadding: number
    bodyGap: number
    categoryRailWidth: number
    columnGap: number
    productCardWidth: number
    productCardHeight: number
    productThumbHeight: number
    productShelfWidth: number
  }
}

type ShopViewport = {
  width: number
  height: number
  horizontalInset?: number
  minimumTouchTarget?: number
}

const MINIMUM_TOUCH_TARGET = 44
const MINIMUM_VIEWPORT_WIDTH = 320
const MINIMUM_VIEWPORT_HEIGHT = 568
const MINIMUM_PRODUCT_CARD_WIDTH = 88
const MINIMUM_CATEGORY_RAIL_WIDTH = 64

export function getShopLayoutMetrics(
  viewport: ShopViewport
): ShopLayoutMetrics {
  const width = finiteAtLeast(viewport.width, MINIMUM_VIEWPORT_WIDTH)
  finiteAtLeast(viewport.height, MINIMUM_VIEWPORT_HEIGHT)
  const widthProgress = inverseLerp(360, 440, width)
  const scaleProgress = widthProgress
  const horizontalInset = Number.isFinite(viewport.horizontalInset)
    ? metric(Math.max(0, viewport.horizontalInset ?? 0))
    : metric(lerp(14, 18, widthProgress))
  const minimumTouchTarget = Number.isFinite(viewport.minimumTouchTarget)
    ? Math.max(MINIMUM_TOUCH_TARGET, viewport.minimumTouchTarget ?? 0)
    : MINIMUM_TOUCH_TARGET
  const contentWidth = metric(Math.max(0, width - horizontalInset * 2))
  const catalogCardPadding = metric(lerp(7, 10, scaleProgress))
  const catalogBodyGap = metric(lerp(6, 10, widthProgress))
  const columnGap = metric(lerp(7, 10, widthProgress))
  const minimumProductShelfWidth = MINIMUM_PRODUCT_CARD_WIDTH * 2 + columnGap
  const maximumCategoryRailWidth = Math.max(
    MINIMUM_CATEGORY_RAIL_WIDTH,
    contentWidth - catalogCardPadding * 2 - catalogBodyGap
      - minimumProductShelfWidth
  )
  const categoryRailWidth = metric(clamp(
    lerp(90, 98, widthProgress),
    MINIMUM_CATEGORY_RAIL_WIDTH,
    maximumCategoryRailWidth
  ))
  const productShelfWidth = metric(Math.max(
    minimumProductShelfWidth,
    contentWidth - catalogCardPadding * 2 - categoryRailWidth - catalogBodyGap
  ))
  const productCardWidth = metric(clamp(
    (productShelfWidth - columnGap) / 2,
    MINIMUM_PRODUCT_CARD_WIDTH,
    112
  ))

  return {
    hierarchy: "live-preview",
    minimumTouchTarget,
    horizontalInset,
    contentWidth,
    sectionGap: metric(lerp(6, 10, scaleProgress)),
    showcasePadding: metric(lerp(7, 10, scaleProgress)),
    preview: {
      cardPadding: metric(lerp(4, 7, scaleProgress)),
      cardGap: metric(lerp(3, 7, scaleProgress)),
      heroGap: metric(lerp(6, 10, scaleProgress)),
      avatarStageHeight: metric(lerp(176, 216, scaleProgress)),
      roomStageHeight: metric(lerp(214, 254, scaleProgress)),
      avatarWidth: metric(lerp(146, 178, scaleProgress)),
      overlayInset: metric(lerp(8, 12, scaleProgress))
    },
    catalog: {
      cardPadding: catalogCardPadding,
      bodyGap: catalogBodyGap,
      categoryRailWidth,
      columnGap,
      productCardWidth,
      productCardHeight: metric(lerp(122, 132, scaleProgress)),
      productThumbHeight: metric(lerp(60, 68, scaleProgress)),
      productShelfWidth
    }
  }
}

function finiteAtLeast(value: number, minimum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.max(minimum, value)
}

function inverseLerp(minimum: number, maximum: number, value: number): number {
  return clamp((value - minimum) / (maximum - minimum), 0, 1)
}

function lerp(minimum: number, maximum: number, progress: number): number {
  return minimum + (maximum - minimum) * progress
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function metric(value: number): number {
  return Math.round(value * 10) / 10
}
