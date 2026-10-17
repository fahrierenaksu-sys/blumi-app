import type { ChatEmote } from "./chatEmoteMapper"

/**
 * The emotes on screen in the shared room: at most one per speaker, each shown
 * for its own lifetime from the moment it appears. Plain immutable data, so one
 * timer can serve the whole room and a test can walk it through time.
 */
export const MINI_ROOM_EMOTE_LIFETIME_MS = 1_500

export interface MiniRoomEmote {
  /** New for every emote, so the same emote twice plays twice. */
  readonly key: string
  readonly speakerUserId: string
  readonly emote: ChatEmote
  readonly startedAt: number
  readonly expiresAt: number
}

export type MiniRoomEmotes = Readonly<Record<string, MiniRoomEmote>>

export const EMPTY_MINI_ROOM_EMOTES: MiniRoomEmotes = Object.freeze({})

/** Shows `emote` over its speaker, replacing that speaker's previous one. */
export function showMiniRoomEmote(
  state: MiniRoomEmotes,
  input: { key: string; speakerUserId: string; emote: ChatEmote },
  now: number,
  lifetimeMs: number = MINI_ROOM_EMOTE_LIFETIME_MS
): MiniRoomEmotes {
  return {
    ...state,
    [input.speakerUserId]: {
      key: input.key,
      speakerUserId: input.speakerUserId,
      emote: input.emote,
      startedAt: now,
      expiresAt: now + Math.max(0, lifetimeMs)
    }
  }
}

/** Removes every emote whose lifetime has ended; the same object when none has. */
export function expireMiniRoomEmotes(state: MiniRoomEmotes, now: number): MiniRoomEmotes {
  const entries = Object.entries(state)
  if (!entries.some(([, emote]) => emote.expiresAt <= now)) return state
  return Object.fromEntries(entries.filter(([, emote]) => emote.expiresAt > now))
}

/** When the next emote ends, or undefined when none is shown. */
export function nextMiniRoomEmoteExpiry(state: MiniRoomEmotes): number | undefined {
  let next: number | undefined
  for (const emote of Object.values(state)) {
    if (next === undefined || emote.expiresAt < next) next = emote.expiresAt
  }
  return next
}
