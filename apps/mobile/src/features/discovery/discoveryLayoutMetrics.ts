export interface DiscoveryCardLayoutMetrics {
  readonly avatarSize: number
  readonly avatarBottomInset: number
  readonly infoOverlayBottom: number
  readonly infoOverlayPaddingVertical: number
  readonly nameFontSize: number
  readonly ageFontSize: number
}

export interface DiscoveryActionLayoutMetrics {
  readonly bottom: number
  readonly horizontalPadding: number
  readonly verticalPadding: number
  readonly secondarySize: number
  readonly primarySize: number
}

export interface DiscoveryLayoutMetrics {
  readonly deckHeight: number
  readonly showProgress: boolean
  readonly card: DiscoveryCardLayoutMetrics
  readonly action: DiscoveryActionLayoutMetrics
}

const MIN_VIEWPORT_WIDTH = 320
const MAX_VIEWPORT_WIDTH = 480
const REFERENCE_VIEWPORT_WIDTH = 402
const REFERENCE_DECK_HEIGHT = 548
const COMPACT_VIEWPORT_MAX_HEIGHT = 720

export function resolveDiscoveryLayoutMetrics(
  viewportWidth: number,
  viewportHeight: number
): DiscoveryLayoutMetrics {
  const safeViewportWidth = clamp(
    Number.isFinite(viewportWidth) ? viewportWidth : MIN_VIEWPORT_WIDTH,
    MIN_VIEWPORT_WIDTH,
    MAX_VIEWPORT_WIDTH
  )
  const scale = safeViewportWidth / REFERENCE_VIEWPORT_WIDTH
  const compact = Number.isFinite(viewportHeight) &&
    viewportHeight <= COMPACT_VIEWPORT_MAX_HEIGHT

  if (compact) {
    return {
      deckHeight: 448,
      showProgress: false,
      card: {
        avatarSize: 224,
        avatarBottomInset: 128,
        infoOverlayBottom: 96,
        infoOverlayPaddingVertical: 9,
        nameFontSize: 25,
        ageFontSize: 18
      },
      action: {
        bottom: 24,
        horizontalPadding: 12,
        verticalPadding: 8,
        secondarySize: 52,
        primarySize: 60
      }
    }
  }

  return {
    deckHeight: scaleMetric(REFERENCE_DECK_HEIGHT, scale),
    showProgress: true,
    card: {
      avatarSize: scaleMetric(268, scale),
      avatarBottomInset: scaleMetric(152, scale),
      infoOverlayBottom: scaleMetric(120, scale),
      infoOverlayPaddingVertical: scaleMetric(12, scale),
      nameFontSize: scaleMetric(29, scale),
      ageFontSize: scaleMetric(20, scale)
    },
    action: {
      bottom: scaleMetric(30, scale),
      horizontalPadding: scaleMetric(14, scale),
      verticalPadding: scaleMetric(10, scale),
      secondarySize: scaleMetric(56, scale),
      primarySize: scaleMetric(64, scale)
    }
  }
}

function scaleMetric(value: number, scale: number): number {
  return roundToHundredth(value * scale)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100
}
