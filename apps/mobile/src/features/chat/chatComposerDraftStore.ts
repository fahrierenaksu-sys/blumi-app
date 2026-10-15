/**
 * Unsent 1:1 chat drafts, kept so leaving a conversation and coming back
 * shows what was being typed (ChatComposer).
 *
 * Memory only: drafts are never written to disk, logged or sent anywhere.
 * They belong to one signed-in account; a read or write for another account
 * drops every draft first, and sign-out (resetChatStore) clears them all. A
 * conversation that becomes unreachable (the partner is blocked, an unmatch
 * or the server stops listing it) loses its draft through
 * clearChatComposerDrafts / keepOnlyChatComposerDrafts. MiniRoom keeps its
 * own draft.
 *
 * Bounded: at most CHAT_COMPOSER_DRAFT_LIMIT conversations keep a draft (the
 * least recently written goes first), and a draft is never longer than the
 * composer accepts (CHAT_COMPOSER_MAX_LENGTH).
 */

/** The longest text the 1:1 composer accepts, and so the longest draft. */
export const CHAT_COMPOSER_MAX_LENGTH = 500
/** How many conversations of one account may keep an unsent draft. */
export const CHAT_COMPOSER_DRAFT_LIMIT = 20

interface ChatComposerDraftBook {
  readonly accountId: string | null
  readonly drafts: ReadonlyMap<string, string>
}

const EMPTY_BOOK: ChatComposerDraftBook = { accountId: null, drafts: new Map() }

let book: ChatComposerDraftBook = EMPTY_BOOK

/** The book for `accountId`, emptied when another account owned it. */
function bookFor(accountId: string): ChatComposerDraftBook {
  if (book.accountId === accountId) return book
  book = { accountId, drafts: new Map() }
  return book
}

/** The unsent draft of one conversation, or "" when there is none. */
export function readChatComposerDraft(accountId: string, threadId: string): string {
  if (!accountId || !threadId) return ""
  return bookFor(accountId).drafts.get(threadId) ?? ""
}

/** Remembers the composer text; an empty text forgets the draft. */
export function writeChatComposerDraft(accountId: string, threadId: string, text: string): void {
  if (!accountId || !threadId) return
  const current = bookFor(accountId)
  const draft = text.slice(0, CHAT_COMPOSER_MAX_LENGTH)
  if ((current.drafts.get(threadId) ?? "") === draft) return
  // Delete first so a rewritten draft moves to the most recent end.
  const others = [...current.drafts].filter(([id]) => id !== threadId)
  const entries: [string, string][] = draft ? [...others, [threadId, draft]] : others
  book = { accountId, drafts: new Map(entries.slice(-CHAT_COMPOSER_DRAFT_LIMIT)) }
}

/** Forgets the drafts of conversations the user can no longer open. */
export function clearChatComposerDrafts(threadIds: readonly string[]): void {
  if (!threadIds.some((threadId) => book.drafts.has(threadId))) return
  const removed = new Set(threadIds)
  book = { accountId: book.accountId, drafts: new Map([...book.drafts].filter(([threadId]) => !removed.has(threadId))) }
}

/**
 * A complete thread list arrived: forgets the drafts of every conversation it
 * no longer contains (unmatch, hidden by the server) except `keepThreadId`,
 * the conversation open right now, which may be newer than the list request.
 */
export function keepOnlyChatComposerDrafts(listedThreadIds: ReadonlySet<string>, keepThreadId: string | null): void {
  const gone = [...book.drafts.keys()].filter((threadId) => !listedThreadIds.has(threadId) && threadId !== keepThreadId)
  clearChatComposerDrafts(gone)
}

/** Sign-out and account change: every draft goes. */
export function resetChatComposerDrafts(): void {
  book = EMPTY_BOOK
}
