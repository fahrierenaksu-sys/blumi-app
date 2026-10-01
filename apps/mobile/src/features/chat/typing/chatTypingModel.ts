import type { ChatTypingState, ChatTypingUpdated } from "@blumi/contracts"

/**
 * Typing indicator rules (2026-10-01), pure so they are node-tested.
 *
 * Sender: one `start` when the draft first changes, renewed at most every
 * CHAT_TYPING_RENEW_MS while it keeps changing; one `stop` on send, clear,
 * blur, background or leaving, but only while a sent `start` may still be
 * showing on the partner's phone. Receiver: show at once, lapse after the
 * server's `expiresInMs` without a renewal, clear on `stop` or on a message
 * from the typist.
 */
export const CHAT_TYPING_RENEW_MS = 3_000
/** Used when the server lifetime is missing or out of the sane range. */
export const CHAT_TYPING_DEFAULT_LIFETIME_MS = 6_000
const MIN_LIFETIME_MS = 1_000
const MAX_LIFETIME_MS = 15_000
/** VoiceOver/TalkBack hear "typing" at most once in this window per thread. */
export const CHAT_TYPING_ANNOUNCE_COOLDOWN_MS = 30_000

export interface ChatTypingSenderState {
  threadId: string | null
  /** When the last `start` was sent; null when none may be showing. */
  startedAt: number | null
}

export const IDLE_TYPING_SENDER: ChatTypingSenderState = Object.freeze({ threadId: null, startedAt: null })

export interface ChatTypingPlan {
  next: ChatTypingSenderState
  /** The signal to send; commit `next` only if the send went out. */
  send?: { threadId: string; state: ChatTypingState }
}

function isStartShowing(state: ChatTypingSenderState, now: number): boolean {
  return state.startedAt !== null && now - state.startedAt < CHAT_TYPING_DEFAULT_LIFETIME_MS
}

/** The user changed the draft of `threadId` to `text`. */
export function planDraftChange(
  state: ChatTypingSenderState,
  input: { threadId: string; text: string; now: number }
): ChatTypingPlan {
  if (input.text.trim().length === 0) return planDraftEnd(state, input.now)
  if (state.threadId !== null && state.threadId !== input.threadId && isStartShowing(state, input.now)) {
    // Switching conversations: end the old one first; the next change starts.
    return planDraftEnd(state, input.now)
  }
  const sameThread = state.threadId === input.threadId
  if (sameThread && state.startedAt !== null && input.now - state.startedAt < CHAT_TYPING_RENEW_MS) {
    return { next: state }
  }
  return {
    next: { threadId: input.threadId, startedAt: input.now },
    send: { threadId: input.threadId, state: "start" }
  }
}

/** Send, clear, blur, background or leaving: stop if a start may be showing. */
export function planDraftEnd(state: ChatTypingSenderState, now: number): ChatTypingPlan {
  if (state.threadId === null || !isStartShowing(state, now)) return { next: IDLE_TYPING_SENDER }
  return { next: IDLE_TYPING_SENDER, send: { threadId: state.threadId, state: "stop" } }
}

/** Partner typing per thread on this device. */
export type PartnerTypingEntries = Readonly<Record<string, { userId: string; expiresAt: number }>>
export const NO_PARTNER_TYPING: PartnerTypingEntries = Object.freeze({})

function clampLifetime(expiresInMs: number): number {
  if (!Number.isFinite(expiresInMs) || expiresInMs < MIN_LIFETIME_MS || expiresInMs > MAX_LIFETIME_MS) {
    return CHAT_TYPING_DEFAULT_LIFETIME_MS
  }
  return expiresInMs
}

function withoutThread(entries: PartnerTypingEntries, threadId: string): PartnerTypingEntries {
  if (!(threadId in entries)) return entries
  const next = { ...entries }
  delete next[threadId]
  return next
}

export function applyTypingUpdate(
  entries: PartnerTypingEntries,
  payload: ChatTypingUpdated,
  context: { localUserId: string | undefined; now: number }
): PartnerTypingEntries {
  // My own signal is never shown back to me (another of my devices).
  if (!context.localUserId || payload.userId === context.localUserId) return entries
  if (payload.state === "stop") {
    const current = entries[payload.threadId]
    return current?.userId === payload.userId ? withoutThread(entries, payload.threadId) : entries
  }
  return {
    ...entries,
    [payload.threadId]: { userId: payload.userId, expiresAt: context.now + clampLifetime(payload.expiresInMs) }
  }
}

/** A message from the typist ends their indicator in that thread. */
export function clearTypingForMessage(
  entries: PartnerTypingEntries,
  message: { threadId: string; senderUserId: string }
): PartnerTypingEntries {
  return entries[message.threadId]?.userId === message.senderUserId
    ? withoutThread(entries, message.threadId)
    : entries
}

/** A confirmed block hides the person's indicator everywhere at once. */
export function clearTypingForUser(entries: PartnerTypingEntries, userId: string): PartnerTypingEntries {
  let next = entries
  for (const [threadId, entry] of Object.entries(entries)) {
    if (entry.userId === userId) next = withoutThread(next, threadId)
  }
  return next
}

export function pruneExpiredTyping(entries: PartnerTypingEntries, now: number): PartnerTypingEntries {
  let next = entries
  for (const [threadId, entry] of Object.entries(entries)) {
    if (entry.expiresAt <= now) next = withoutThread(next, threadId)
  }
  return next
}

export function nextTypingExpiry(entries: PartnerTypingEntries): number | null {
  let earliest: number | null = null
  for (const entry of Object.values(entries)) {
    if (earliest === null || entry.expiresAt < earliest) earliest = entry.expiresAt
  }
  return earliest
}

export function isPartnerTyping(
  entries: PartnerTypingEntries,
  threadId: string | undefined,
  partnerUserId: string | undefined,
  now: number
): boolean {
  if (!threadId || !partnerUserId) return false
  const entry = entries[threadId]
  return entry !== undefined && entry.userId === partnerUserId && entry.expiresAt > now
}

/** Announce a fresh start, but at most once per cooldown: never per keystroke. */
export function shouldAnnounceTyping(input: {
  isTyping: boolean
  wasTyping: boolean
  lastAnnouncedAt: number | null
  now: number
}): boolean {
  if (!input.isTyping || input.wasTyping) return false
  return input.lastAnnouncedAt === null || input.now - input.lastAnnouncedAt >= CHAT_TYPING_ANNOUNCE_COOLDOWN_MS
}
