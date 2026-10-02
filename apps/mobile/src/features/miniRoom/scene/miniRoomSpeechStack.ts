/**
 * MiniRoom speech bubbles as one stack per speaker (2026-10-02).
 *
 * Every line gets its own lifetime from the moment it is shown. A second line
 * from the same person joins that person's stack under the first one (newest
 * at the bottom, next to the chibi; older lines are pushed up), and each line
 * leaves on its own when its lifetime ends. Lines of the two partners never
 * replace each other. The stack of one speaker holds at most
 * `MINI_ROOM_SPEECH_STACK_LIMIT` lines: a burst drops that speaker's oldest
 * line early instead of growing off the room.
 */
export const MINI_ROOM_SPEECH_LIFETIME_MS = 4_000
export const MINI_ROOM_SPEECH_STACK_LIMIT = 3

export interface MiniRoomSpeechInput {
  key: string
  speakerUserId: string
  body: string
  lifetimeMs?: number
}

export interface MiniRoomSpeech {
  key: string
  speakerUserId: string
  body: string
  startedAt: number
  expiresAt: number
}

/** Every visible line, in the order it was shown. */
export type MiniRoomSpeechStack = readonly MiniRoomSpeech[]

export const EMPTY_MINI_ROOM_SPEECH_STACK: MiniRoomSpeechStack = Object.freeze([])

export function pushMiniRoomSpeech(
  stack: MiniRoomSpeechStack,
  speech: MiniRoomSpeechInput,
  now: number
): MiniRoomSpeechStack {
  if (stack.some((entry) => entry.key === speech.key)) return stack
  const next: MiniRoomSpeech[] = [...stack, {
    key: speech.key,
    speakerUserId: speech.speakerUserId,
    body: speech.body,
    startedAt: now,
    expiresAt: now + Math.max(0, speech.lifetimeMs ?? MINI_ROOM_SPEECH_LIFETIME_MS)
  }]
  let excess = next.filter((entry) => entry.speakerUserId === speech.speakerUserId).length -
    MINI_ROOM_SPEECH_STACK_LIMIT
  if (excess <= 0) return next
  return next.filter((entry) => {
    if (excess > 0 && entry.speakerUserId === speech.speakerUserId) {
      excess -= 1
      return false
    }
    return true
  })
}

/** Removes every line whose lifetime has ended; the same stack when none has. */
export function expireMiniRoomSpeech(stack: MiniRoomSpeechStack, now: number): MiniRoomSpeechStack {
  return stack.some((entry) => entry.expiresAt <= now)
    ? stack.filter((entry) => entry.expiresAt > now)
    : stack
}

/** Removes one line (a tap); the same stack when it is already gone. */
export function dismissMiniRoomSpeech(stack: MiniRoomSpeechStack, key: string): MiniRoomSpeechStack {
  return stack.some((entry) => entry.key === key)
    ? stack.filter((entry) => entry.key !== key)
    : stack
}

/** When the next line ends, so one timer serves the whole room. */
export function nextMiniRoomSpeechExpiry(stack: MiniRoomSpeechStack): number | undefined {
  let next: number | undefined
  for (const entry of stack) {
    if (next === undefined || entry.expiresAt < next) next = entry.expiresAt
  }
  return next
}

/** Each speaker's lines, oldest first (drawn top to bottom). */
export function groupMiniRoomSpeechBySpeaker<T extends { speakerUserId: string }>(
  lines: readonly T[]
): Readonly<Record<string, readonly T[]>> {
  const groups: Record<string, T[]> = {}
  for (const line of lines) (groups[line.speakerUserId] ??= []).push(line)
  return groups
}

export function hasMiniRoomSpeechFrom(stack: MiniRoomSpeechStack, speakerUserId: string): boolean {
  return stack.some((entry) => entry.speakerUserId === speakerUserId)
}
