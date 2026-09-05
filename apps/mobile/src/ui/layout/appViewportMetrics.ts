import {
  MIN_TOUCH_TARGET_SIZE,
  resolveBottomNavLayout,
  type BottomNavLayoutMetrics,
} from "./bottomNavLayout"
import { resolvePageContainerLayout } from "./pageContainerLayout"

const MIN_LAYOUT_SCALE = 0.82
const MAX_LAYOUT_SCALE = 1.08
const REFERENCE_CONTENT_WIDTH = 350
const REFERENCE_CONTENT_HEIGHT = 690
const LARGE_TEXT_FONT_SCALE = 1.2
const MAX_READABILITY_FONT_SCALE = 1.6

export interface AppViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface AppViewportMetricsInput {
  width: number
  height: number
  fontScale: number
  safeAreaInsets: AppViewportInsets
  bottomNavVisible: boolean
}

export interface AppViewportMetrics {
  width: number
  height: number
  fontScale: number
  safeAreaInsets: AppViewportInsets
  safeWidth: number
  safeHeight: number
  contentWidth: number
  contentHeight: number
  bottomContentInset: number
  horizontalGutter: number
  layoutScale: number
  readabilityScale: number
  usesLargeText: boolean
  minTouchTarget: number
  bottomNav: BottomNavLayoutMetrics
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function normalizeFontScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function resolveAppViewportMetrics(
  input: AppViewportMetricsInput
): AppViewportMetrics {
  const width = finiteNonNegative(input.width)
  const height = finiteNonNegative(input.height)
  const fontScale = normalizeFontScale(input.fontScale)
  const safeAreaInsets = {
    top: finiteNonNegative(input.safeAreaInsets.top),
    right: finiteNonNegative(input.safeAreaInsets.right),
    bottom: finiteNonNegative(input.safeAreaInsets.bottom),
    left: finiteNonNegative(input.safeAreaInsets.left),
  }
  const safeWidth = Math.max(
    0,
    width - safeAreaInsets.left - safeAreaInsets.right
  )
  const safeHeight = Math.max(
    0,
    height - safeAreaInsets.top - safeAreaInsets.bottom
  )
  const pageContainer = resolvePageContainerLayout(safeWidth)
  const horizontalGutter = pageContainer.horizontalInset
  const contentWidth = pageContainer.contentWidth
  const bottomNav = resolveBottomNavLayout({
    viewportWidth: width,
    safeAreaBottom: safeAreaInsets.bottom,
    visible: input.bottomNavVisible,
  })
  const bottomContentInset = bottomNav.contentInset
  const contentHeight = Math.max(
    0,
    height - safeAreaInsets.top - bottomContentInset
  )
  const naturalScale = Math.min(
    contentWidth / REFERENCE_CONTENT_WIDTH,
    contentHeight / REFERENCE_CONTENT_HEIGHT
  )
  const layoutScale = clamp(
    Number.isFinite(naturalScale) ? naturalScale : MIN_LAYOUT_SCALE,
    MIN_LAYOUT_SCALE,
    MAX_LAYOUT_SCALE
  )
  const readabilityFontScale = clamp(
    fontScale,
    1,
    MAX_READABILITY_FONT_SCALE
  )
  const readabilityScale = layoutScale / Math.sqrt(readabilityFontScale)

  return {
    width,
    height,
    fontScale,
    safeAreaInsets,
    safeWidth,
    safeHeight,
    contentWidth,
    contentHeight,
    bottomContentInset,
    horizontalGutter,
    layoutScale,
    readabilityScale,
    usesLargeText: fontScale >= LARGE_TEXT_FONT_SCALE,
    minTouchTarget: MIN_TOUCH_TARGET_SIZE,
    bottomNav,
  }
}
