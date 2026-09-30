/** Room avatar layers share one 256x384 canvas with transparent margins. */
const CANVAS_ASPECT = 256 / 384
/** Share of the canvas height covered by the visible character (hair to shoes). */
const VISIBLE_HEIGHT_FRACTION = 0.7
/** The visible character sits slightly below the canvas centre. */
const VISIBLE_CENTER_OFFSET_FRACTION = 0.057
const STAGE_FILL = 0.8
const MAX_CANVAS_WIDTH_SHARE = 0.86
const CIRCLE_WIDTH_SHARE = 0.63
const CIRCLE_HEIGHT_SHARE = 0.88
/** The visible character stays inside the circle behind it. */
const CHARACTER_IN_CIRCLE = 0.9

export interface WardrobeStageLayout {
  /** Width to hand AvatarPreview2D; its canvas height is `avatarHeight`. */
  avatarSize: number
  avatarHeight: number
  /** Upward shift that centres the visible character in the stage. */
  avatarOffsetY: number
  circleSize: number
}

/**
 * Sizes the character from the measured hero area so its visible body sits
 * inside the circle, whatever the viewport, instead of fixed pixel sizes.
 */
export function getWardrobeStageLayout(input: {
  heroWidth: number
  heroHeight: number
}): WardrobeStageLayout {
  const heroWidth = Math.max(0, input.heroWidth)
  const heroHeight = Math.max(0, input.heroHeight)
  const heightDriven = (heroHeight * STAGE_FILL) / VISIBLE_HEIGHT_FRACTION
  const circleSize = Math.min(heroWidth * CIRCLE_WIDTH_SHARE, heroHeight * CIRCLE_HEIGHT_SHARE)
  const avatarHeight = Math.min(
    heightDriven,
    (heroWidth * MAX_CANVAS_WIDTH_SHARE) / CANVAS_ASPECT,
    (circleSize * CHARACTER_IN_CIRCLE) / VISIBLE_HEIGHT_FRACTION
  )
  return {
    avatarSize: Math.round(avatarHeight * CANVAS_ASPECT),
    avatarHeight: Math.round(avatarHeight),
    avatarOffsetY: -Math.round(avatarHeight * VISIBLE_CENTER_OFFSET_FRACTION),
    circleSize: Math.round(circleSize)
  }
}

/** Product art height as a share of the card width (about 88pt on a 390pt phone). */
export const WARDROBE_ART_ASPECT = 0.82
/** Visible garment art is fitted into this box, centred in the card. */
export const WARDROBE_THUMB_BOX = { width: 100, height: 68 } as const

const GRID_COLUMNS = 3

/** Card width for a three-column grid measured from the list's own width. */
export function getWardrobeGridItemWidth(listWidth: number, gap: number): number {
  if (!Number.isFinite(listWidth) || listWidth <= 0) return 0
  return Math.max(0, Math.floor((listWidth - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS))
}

/** One row of three cards is visible at once; more products page sideways. */
export const WARDROBE_GRID_ROWS = 1
export const WARDROBE_PAGE_SIZE = GRID_COLUMNS * WARDROBE_GRID_ROWS
const NAME_MARGIN_TOP = 6
const NAME_LINE_HEIGHT = 16
const NAME_LINES = 2
/** Matches the card name's `maxFontSizeMultiplier`. */
const NAME_MAX_FONT_SCALE = 1.3

/** Fixed card height: product art plus room for a two-line name. */
export function getWardrobeCardHeight(itemWidth: number, fontScale = 1): number {
  if (!Number.isFinite(itemWidth) || itemWidth <= 0) return 0
  const scale = Math.min(Math.max(Number.isFinite(fontScale) ? fontScale : 1, 1), NAME_MAX_FONT_SCALE)
  return (
    Math.round(itemWidth * WARDROBE_ART_ASPECT) +
    NAME_MARGIN_TOP +
    Math.ceil(NAME_LINE_HEIGHT * NAME_LINES * scale)
  )
}

/** Height of one grid page: its card rows and the gaps between them. */
export function getWardrobeGridPageHeight(
  cardHeight: number,
  rowGap: number,
  rows = WARDROBE_GRID_ROWS
): number {
  if (cardHeight <= 0 || rows <= 0) return 0
  return cardHeight * rows + rowGap * (rows - 1)
}

/** Splits cards into pages, keeping the incoming order. */
export function chunkWardrobePages<T>(items: readonly T[], pageSize = WARDROBE_PAGE_SIZE): T[][] {
  if (pageSize <= 0) return []
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize))
  }
  return pages
}

/** Page index for a horizontal scroll offset, clamped to the existing pages. */
export function getWardrobePageIndex(offsetX: number, pageWidth: number, pageCount: number): number {
  if (pageWidth <= 0 || pageCount <= 0 || !Number.isFinite(offsetX)) return 0
  return Math.min(pageCount - 1, Math.max(0, Math.round(offsetX / pageWidth)))
}

/** Pages needed to show every card, one row at a time. */
export function getWardrobePageCount(cardCount: number): number {
  return cardCount > 0 ? Math.ceil(cardCount / WARDROBE_PAGE_SIZE) : 0
}
