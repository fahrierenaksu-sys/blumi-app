export interface ProfileSetupLayoutMetrics {
  avatarSize: number
  avatarStageHeight: number
  compact: boolean
  contentGap: number
  formGap: number
  formPadding: number
  horizontalPadding: number
  scrollFallback: boolean
  stackIdentityFields: boolean
  verticalPadding: number
  wrapGenderOptions: boolean
}

const MIN_INLINE_FIELD_WIDTH = 360
const MIN_NO_SCROLL_HEIGHT = 920
const MIN_INLINE_HEIGHT = 720
const MAX_INLINE_FONT_SCALE = 1.2

export function getProfileSetupLayoutMetrics(
  height: number,
  width: number,
  fontScale: number
): ProfileSetupLayoutMetrics {
  const shortViewport = height < MIN_NO_SCROLL_HEIGHT
  const stackIdentityFields =
    height < MIN_INLINE_HEIGHT ||
    width < MIN_INLINE_FIELD_WIDTH ||
    fontScale > MAX_INLINE_FONT_SCALE
  const wrapGenderOptions =
    stackIdentityFields || width < 360 || fontScale > 1.1
  const scrollFallback =
    shortViewport || stackIdentityFields
  const compact = scrollFallback

  return {
    avatarSize: compact ? 92 : 128,
    avatarStageHeight: compact ? 132 : 170,
    compact,
    contentGap: compact ? 6 : 8,
    formGap: compact ? 8 : 10,
    formPadding: compact ? 12 : 14,
    horizontalPadding: compact ? 8 : 10,
    scrollFallback,
    stackIdentityFields,
    verticalPadding: 8,
    wrapGenderOptions
  }
}
