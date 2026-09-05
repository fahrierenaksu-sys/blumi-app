import {
  ONBOARDING_PRIMARY_ACTION_LAYOUT,
  getOnboardingPrimaryActionMetrics
} from "../onboardingActionLayout"

export type PreAuthSetupStep = "profile" | "avatar" | "room" | "phone" | "otp"

export const SETUP_FLOW_STAGE_HEIGHT = Object.freeze({
  compact: 224,
  regular: 258
})

const VERY_COMPACT_SETUP_MAX_HEIGHT = 760
const DENSE_SETUP_MAX_HEIGHT = 900

// The setup flow has a persistent header and CTA dock. Standard-height iPhones
// need the compact stage budget even when their width is generous; Plus/Max
// viewports keep the roomier presentation.
const REGULAR_SETUP_MIN_HEIGHT = 920

export const SETUP_FLOW_COPY = {
  profile: {
    title: "Seni nasıl tanıyalım?",
    description: "İlk olarak sana nasıl sesleneceğimizi seçelim.",
    primaryAction: "Karakterimi hazırlayalım"
  },
  avatar: {
    title: "Karakterini hazırla",
    description: "Seni yansıtan ilk görünümü birlikte seçelim.",
    primaryAction: "Karakterim hazır"
  },
  room: {
    title: "İlk köşeni birlikte kuralım",
    description: "Yatağını yerleştir; sonra istediğin zaman değiştirebilirsin.",
    primaryAction: "Odam hazır"
  },
  phone: {
    title: "Dünyan kaybolmasın",
    description: "Telefonunla Blumi dünyanı güvende tut.",
    primaryAction: "Kod gönder"
  },
  otp: {
    title: "Mesajlarına bak",
    description: "Gönderdiğimiz 6 haneli kodu gir.",
    primaryAction: "Blumi’ye katıl"
  }
} as const satisfies Record<PreAuthSetupStep, {
  title: string
  description: string
  primaryAction: string
}>

export const SETUP_MOTION_TIMELINE_MS = {
  total: 440,
  oldPanelStart: 0,
  oldPanelEnd: 180,
  stageStart: 40,
  stageEnd: 400,
  newPanelStart: 140,
  newPanelEnd: 390,
  ctaStart: 190,
  ctaEnd: 430,
  reduced: 100
} as const

export interface SetupLayoutMetrics {
  compact: boolean
  dense: boolean
  horizontalInset: 16 | 20
  taskCardPadding: 18 | 20 | 24
  veryCompact: boolean
  stageHeight: number
  headerHeight: 56
  progressHeight: 4
  primaryActionHeight: 58
  shouldScroll: boolean
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function getSetupProgress(step: PreAuthSetupStep): {
  activeIndex: 0 | 1 | 2 | 3
  current: 1 | 2 | 3 | 4
  total: 4
} {
  const activeIndex = step === "profile"
    ? 0
    : step === "avatar"
      ? 1
      : step === "room"
        ? 2
        : 3

  return {
    activeIndex,
    current: (activeIndex + 1) as 1 | 2 | 3 | 4,
    total: 4
  }
}

export function getSetupLayoutMetrics({
  width,
  height,
  fontScale
}: {
  width: number
  height: number
  fontScale: number
}): SetupLayoutMetrics {
  const normalizedHeight = Number.isFinite(height) ? height : REGULAR_SETUP_MIN_HEIGHT
  const normalizedFontScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1
  const veryCompact =
    normalizedHeight < VERY_COMPACT_SETUP_MAX_HEIGHT ||
    normalizedFontScale >= 1.25
  const compact =
    width < 390 ||
    normalizedHeight < REGULAR_SETUP_MIN_HEIGHT ||
    normalizedFontScale > 1.15
  const dense =
    compact &&
    (veryCompact || normalizedHeight < DENSE_SETUP_MAX_HEIGHT || normalizedFontScale > 1.08)

  return {
    compact,
    dense,
    horizontalInset: getOnboardingPrimaryActionMetrics(width).horizontalInset,
    taskCardPadding: veryCompact ? 18 : compact ? 20 : 24,
    veryCompact,
    stageHeight: compact
      ? veryCompact
        ? 188
        : dense
          ? 208
          : SETUP_FLOW_STAGE_HEIGHT.compact
      : clamp(SETUP_FLOW_STAGE_HEIGHT.regular, 238, 258),
    headerHeight: 56,
    progressHeight: 4,
    primaryActionHeight: ONBOARDING_PRIMARY_ACTION_LAYOUT.height,
    shouldScroll: compact || normalizedFontScale > 1.15
  }
}

export interface SetupTransitionFrame {
  outgoingOpacity: number
  outgoingTranslateY: number
  stageProgress: number
  incomingOpacity: number
  incomingTranslateY: number
  ctaProgress: number
}

export function getOutgoingRetentionMs(reduceMotion: boolean): number {
  return reduceMotion
    ? SETUP_MOTION_TIMELINE_MS.reduced
    : SETUP_MOTION_TIMELINE_MS.total
}

export function shouldClearOutgoingForMotionPreference(
  previousReduceMotion: boolean,
  reduceMotion: boolean,
  hasOutgoing: boolean
): boolean {
  return hasOutgoing && !previousReduceMotion && reduceMotion
}

function clampProgress(elapsedMs: number, startMs: number, endMs: number): number {
  if (elapsedMs <= startMs) return 0
  if (elapsedMs >= endMs) return 1
  return (elapsedMs - startMs) / (endMs - startMs)
}

export function getSetupTransitionFrame(
  elapsedMs: number,
  reduceMotion: boolean
): SetupTransitionFrame {
  const safeElapsedMs = Math.max(0, elapsedMs)
  if (reduceMotion) {
    const progress = clampProgress(safeElapsedMs, 0, SETUP_MOTION_TIMELINE_MS.reduced)
    return {
      outgoingOpacity: 1 - progress,
      outgoingTranslateY: 0,
      stageProgress: progress,
      incomingOpacity: progress,
      incomingTranslateY: 0,
      ctaProgress: progress
    }
  }

  const outgoingProgress = clampProgress(
    safeElapsedMs,
    SETUP_MOTION_TIMELINE_MS.oldPanelStart,
    SETUP_MOTION_TIMELINE_MS.oldPanelEnd
  )
  const incomingProgress = clampProgress(
    safeElapsedMs,
    SETUP_MOTION_TIMELINE_MS.newPanelStart,
    SETUP_MOTION_TIMELINE_MS.newPanelEnd
  )

  return {
    outgoingOpacity: 1 - outgoingProgress,
    outgoingTranslateY: 12 * outgoingProgress,
    stageProgress: clampProgress(
      safeElapsedMs,
      SETUP_MOTION_TIMELINE_MS.stageStart,
      SETUP_MOTION_TIMELINE_MS.stageEnd
    ),
    incomingOpacity: incomingProgress,
    incomingTranslateY: 10 * (1 - incomingProgress),
    ctaProgress: clampProgress(
      safeElapsedMs,
      SETUP_MOTION_TIMELINE_MS.ctaStart,
      SETUP_MOTION_TIMELINE_MS.ctaEnd
    )
  }
}
