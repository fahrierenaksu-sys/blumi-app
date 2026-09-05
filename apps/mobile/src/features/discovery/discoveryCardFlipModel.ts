export const DISCOVERY_CARD_FLIP_DURATION = 360
export const DISCOVERY_CARD_FLIP_EASING = "easeInOut" as const

export interface DiscoveryCardFlipState {
  readonly frontRotation: `${number}deg`
  readonly backRotation: `${number}deg`
  readonly frontVisible: boolean
  readonly backVisible: boolean
}

export interface DiscoveryCardBackContent {
  readonly prompt: string | null
  readonly interests: readonly string[]
  readonly badges: readonly string[]
}

export function getDiscoveryCardFlipState(
  progress: number,
  reduceMotion: boolean
): DiscoveryCardFlipState {
  const normalized = clamp(progress, 0, 1)
  const committed = normalized >= 0.5
  if (reduceMotion) {
    return committed
      ? {
          frontRotation: "180deg",
          backRotation: "360deg",
          frontVisible: false,
          backVisible: true
        }
      : {
          frontRotation: "0deg",
          backRotation: "180deg",
          frontVisible: true,
          backVisible: false
        }
  }

  const degrees = Math.round(normalized * 180)
  return {
    frontRotation: `${degrees}deg`,
    backRotation: `${180 + degrees}deg`,
    frontVisible: !committed,
    backVisible: committed
  }
}

export function normalizeDiscoveryCardBack(input: {
  prompt?: string
  interests?: readonly string[]
  badges?: readonly string[]
}): DiscoveryCardBackContent {
  return {
    prompt: normalizeText(input.prompt),
    interests: uniqueText(input.interests),
    badges: uniqueText(input.badges)
  }
}

function normalizeText(value: string | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? ""
  return normalized ? normalized : null
}

function uniqueText(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values ?? []) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result.slice(0, 3)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0))
}
