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
    accessibilityLayout: boolean
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
  fontScale?: number
  horizontalInset?: number
  minimumTouchTarget?: number
}

const MINIMUM_TOUCH_TARGET = 44
const MINIMUM_VIEWPORT_WIDTH = 320
const MINIMUM_VIEWPORT_HEIGHT = 400
const MINIMUM_PRODUCT_CARD_WIDTH = 88
const MINIMUM_CATEGORY_RAIL_WIDTH = 64
export const SHOP_AVATAR_WIDTH_TO_HEIGHT_RATIO = 256 / 384

export function getShopLayoutMetrics(
  viewport: ShopViewport
): ShopLayoutMetrics {
  const width = finiteAtLeast(viewport.width, MINIMUM_VIEWPORT_WIDTH)
  const height = finiteAtLeast(viewport.height, MINIMUM_VIEWPORT_HEIGHT)
  const widthProgress = inverseLerp(360, 440, width)
  const largeTextProgress = Math.min(1, Math.max(0, (viewport.fontScale ?? 1) - 1))
  const accessibilityLayout = (viewport.fontScale ?? 1) >= 1.35
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
    lerp(66, 74, widthProgress),
    MINIMUM_CATEGORY_RAIL_WIDTH,
    maximumCategoryRailWidth
  ))
  const productShelfWidth = metric(contentWidth - catalogCardPadding * 2 - 2
    - (accessibilityLayout ? 0 : categoryRailWidth + catalogBodyGap))
  const productCardWidth = accessibilityLayout
    ? productShelfWidth
    : Math.floor(clamp(
      (productShelfWidth - columnGap) / 2,
      MINIMUM_PRODUCT_CARD_WIDTH,
      320
    ))
  const shortViewport = height < 600
  const preferredProductCardHeight = metric((shortViewport ? 124 : lerp(134, 144, scaleProgress))
    + (accessibilityLayout ? 90 : 48) * largeTextProgress)
  // Redistribute the same vertical budget before selection, so trying more pieces
  // cannot move the catalog. Short phones keep readable cards and use the pager.
  const productCardHeight = largeTextProgress > 0 ? preferredProductCardHeight : metric(Math.max(108,
    Math.min(preferredProductCardHeight, (height - 246 - 228) / 2)))
  // Height is the usable viewport, already excluding safe area and bottom navigation.
  // Two product rows, catalog heading, header/dock, card padding and section gaps.
  const avatarStageHeight = metric(clamp(height - productCardHeight * 2 - 246,
    Math.max(140, Math.ceil(26 * (viewport.fontScale ?? 1)) + 104), 256))
  const availableAvatarHeight = Math.min(avatarStageHeight,
    Math.max(110, height - preferredProductCardHeight * 2 - 246))

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
      avatarStageHeight,
      roomStageHeight: avatarStageHeight,
      avatarWidth: Math.floor(Math.min(
        178,
        contentWidth * 0.48,
        availableAvatarHeight * SHOP_AVATAR_WIDTH_TO_HEIGHT_RATIO
      ) * 10) / 10,
      overlayInset: metric(lerp(8, 12, scaleProgress))
    },
    catalog: {
      accessibilityLayout,
      cardPadding: catalogCardPadding,
      bodyGap: catalogBodyGap,
      categoryRailWidth,
      columnGap,
      productCardWidth,
      productCardHeight,
      productThumbHeight: Math.min(shortViewport ? 56 : metric(lerp(64, 70, scaleProgress)), productCardHeight - 64),
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
