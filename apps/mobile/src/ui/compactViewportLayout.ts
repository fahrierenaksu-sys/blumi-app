export interface CompactViewportLayout {
  compact: boolean
  authAvatarSize: number
  authStageHeight: number
  discoverAvatarSize: number
  discoverDeckHeight: number
  showDiscoverProgress: boolean
}

const COMPACT_VIEWPORT_MAX_HEIGHT = 720

export function resolveCompactViewportLayout(
  viewportHeight: number,
  fontScale = 1
): CompactViewportLayout {
  const safeFontScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1
  const compact =
    viewportHeight <= COMPACT_VIEWPORT_MAX_HEIGHT ||
    safeFontScale > 1.15
  return compact
    ? {
        compact: true,
        authAvatarSize: 126,
        authStageHeight: 184,
        discoverAvatarSize: 224,
        discoverDeckHeight: 448,
        showDiscoverProgress: false
      }
    : {
        compact: false,
        authAvatarSize: 150,
        authStageHeight: 224,
        discoverAvatarSize: 268,
        discoverDeckHeight: 548,
        showDiscoverProgress: true
      }
}
