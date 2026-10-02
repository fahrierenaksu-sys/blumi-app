/**
 * Composer decisions of the MiniRoom text chat, kept pure so they are testable
 * without React Native.
 */

export type RoomComposerSubmit =
  /** Nothing to send: the composer keeps what it shows. */
  | { kind: "empty" }
  /** The chat refused the message (offline, rate limited): keep the text. */
  | { kind: "refused" }
  /** The chat accepted the message: clear the composer and show the bubble. */
  | { kind: "sent"; body: string }

export function resolveRoomComposerSubmit(
  text: string,
  send: (body: string) => boolean
): RoomComposerSubmit {
  const body = text.trim()
  if (!body) return { kind: "empty" }
  if (!send(body)) return { kind: "refused" }
  return { kind: "sent", body }
}

/**
 * A send and a key press can cross: the native field reports "sent text +
 * the new letter" after the composer was already cleared. The first change
 * after a send (its epoch) that still starts with the sent text keeps only
 * the new characters. Any later change is the person's own text.
 */
export function reconcileRoomComposerChange(text: string, sentDraft: string | null): string {
  if (sentDraft === null || sentDraft.length === 0 || !text.startsWith(sentDraft)) return text
  return text.slice(sentDraft.length)
}

export interface RoomComposerFailedMessage {
  clientMessageId: string
  body: string
}

/**
 * An unacknowledged message comes back into an empty composer, so sending the
 * same text again retries it with the same client id. Text the person is
 * typing is never replaced.
 */
export function resolveComposerRestore(
  current: string,
  failed: RoomComposerFailedMessage | null | undefined
): string {
  if (!failed?.clientMessageId) return current
  return current || failed.body
}
