/**
 * The composer's text right after a send (ChatComposer).
 *
 * A send clears the input, but iOS refuses a clear that is older than the
 * input's newest native change: React Native tags every text update with the
 * native event count it has seen, and a keystroke already on its way (Send
 * and a letter pressed together) makes the clear stale. That keystroke then
 * arrives carrying the sent text plus the new letter, and the old message
 * would come back with the letter added.
 *
 * Until the first change that is not the sent text with something inserted
 * into it, such a change is read as "the sent text + new characters" and
 * only the new characters are kept. The guard belongs to one send (its
 * draft) and ends at the first ordinary edit, never on a timer.
 */

export interface ComposerTextAfterSend {
  /** What the input shows. */
  readonly text: string
  /** The sent draft still guarded, or null once an ordinary edit arrived. */
  readonly sentDraft: string | null
}

/**
 * The characters inserted into `base` to make `next` (one contiguous run,
 * anywhere: the caret need not be at the end), or null when `next` is not
 * `base` with an insertion.
 */
export function getInsertedText(base: string, next: string): string | null {
  if (next.length < base.length) return null
  let prefix = 0
  while (prefix < base.length && base[prefix] === next[prefix]) prefix += 1
  const suffix = base.slice(prefix)
  if (!next.endsWith(suffix)) return null
  return next.slice(prefix, next.length - suffix.length)
}

/**
 * `current` is what the input shows now (empty right after the send, or the
 * new characters already kept from a late change).
 */
export function reconcileComposerTextAfterSend(input: {
  next: string
  current: string
  sentDraft: string | null
}): ComposerTextAfterSend {
  const { next, current, sentDraft } = input
  if (!sentDraft) return { text: next, sentDraft: null }
  // Typing on top of what the input shows now is an ordinary edit.
  if (current.length > 0 && getInsertedText(current, next) !== null) return { text: next, sentDraft: null }
  const inserted = getInsertedText(sentDraft, next)
  if (inserted === null) return { text: next, sentDraft: null }
  // The sent text again, unchanged: a late echo of the old value. A one
  // character message is the exception: typing that same character again
  // into the cleared input looks identical and must be kept.
  if (inserted.length === 0 && sentDraft.length === 1) return { text: next, sentDraft: null }
  return { text: inserted, sentDraft }
}
