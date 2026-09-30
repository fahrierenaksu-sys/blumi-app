/**
 * Pure rules for how conversation rows enter the inbox list.
 *
 * The staggered entrance plays once, for the first non-empty list the screen
 * shows. Rows that arrive later (a new match, a new thread) get one short
 * entrance of their own, and rows already on screen are never replayed.
 */

export const INBOX_STAGGER_STEP_MS = 60
export const INBOX_STAGGER_DURATION_MS = 400
/** Rows past the first screenful share the last delay instead of queueing. */
export const INBOX_STAGGER_MAX_STEPS = 7
export const INBOX_LATE_ROW_DURATION_MS = 180
export const INBOX_ENTRANCE_TRANSLATE_Y = 20
export const INBOX_SKELETON_ROW_COUNT = 5
export const INBOX_SKELETON_FADE_MS = 180
export const INBOX_SKELETON_PULSE_HALF_MS = 800
export const INBOX_SKELETON_PULSE_MIN_OPACITY = 0.55

export type InboxRowEntranceKind = "stagger" | "late" | "none"

export interface InboxRowEntrance {
  key: string
  kind: InboxRowEntranceKind
  delayMs: number
  durationMs: number
}

export interface InboxEntrancePlanInput {
  hasPlayedStagger: boolean
  knownKeys: ReadonlySet<string>
  nextKeys: readonly string[]
  reduceMotion: boolean
}

export interface InboxEntrancePlan {
  /** One entry per key that was not known before, in list order. */
  entrances: InboxRowEntrance[]
  /** Keys that left the list and whose animation state can be dropped. */
  removedKeys: string[]
  hasPlayedStagger: boolean
}

export function shouldPlayStaggerEntrance(
  hasPlayedStagger: boolean,
  itemCount: number
): boolean {
  return !hasPlayedStagger && itemCount > 0
}

export function getInboxStaggerDelayMs(index: number): number {
  if (!Number.isFinite(index) || index <= 0) return 0
  return Math.min(Math.floor(index), INBOX_STAGGER_MAX_STEPS) * INBOX_STAGGER_STEP_MS
}

function settled(key: string): InboxRowEntrance {
  return { key, kind: "none", delayMs: 0, durationMs: 0 }
}

export function planInboxEntrance(input: InboxEntrancePlanInput): InboxEntrancePlan {
  const { hasPlayedStagger, knownKeys, nextKeys, reduceMotion } = input
  const nextKeySet = new Set(nextKeys)
  const removedKeys = [...knownKeys].filter((key) => !nextKeySet.has(key))
  const newKeys = [...nextKeySet].filter((key) => !knownKeys.has(key))
  const playsStagger = shouldPlayStaggerEntrance(hasPlayedStagger, nextKeys.length)
  // A list first shown under Reduce Motion counts as shown: turning the
  // preference off later must not replay the entrance over visible rows.
  const nextHasPlayedStagger = hasPlayedStagger || nextKeys.length > 0

  if (reduceMotion) {
    return {
      entrances: newKeys.map(settled),
      removedKeys,
      hasPlayedStagger: nextHasPlayedStagger
    }
  }

  const entrances = newKeys.map((key): InboxRowEntrance => {
    if (playsStagger) {
      return {
        key,
        kind: "stagger",
        delayMs: getInboxStaggerDelayMs(nextKeys.indexOf(key)),
        durationMs: INBOX_STAGGER_DURATION_MS
      }
    }
    return { key, kind: "late", delayMs: 0, durationMs: INBOX_LATE_ROW_DURATION_MS }
  })

  return { entrances, removedKeys, hasPlayedStagger: nextHasPlayedStagger }
}

/** The skeleton stands in only while there is nothing to show yet. */
export function shouldShowInboxSkeleton(
  status: "idle" | "loading" | "ready" | "failed",
  itemCount: number
): boolean {
  return itemCount === 0 && (status === "idle" || status === "loading")
}
