/**
 * Unsent 1:1 chat drafts, kept so leaving a conversation and coming back
 * shows what was being typed (ChatComposer).
 *
 * Memory only: drafts are never written to disk, logged or sent anywhere.
 * They belong to one signed-in account; a read or write for another account
 * drops every draft first, and sign-out (resetChatStore) clears them all. A
 * conversation that becomes unreachable (the partner is blocked) loses its
 * draft through clearChatComposerDrafts. MiniRoom keeps its own draft.
 */

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
  if ((current.drafts.get(threadId) ?? "") === text) return
  const drafts = new Map(current.drafts)
  if (text) drafts.set(threadId, text)
  else drafts.delete(threadId)
  book = { accountId, drafts }
}

/** Forgets the drafts of conversations the user can no longer open. */
export function clearChatComposerDrafts(threadIds: readonly string[]): void {
  if (!threadIds.some((threadId) => book.drafts.has(threadId))) return
  const removed = new Set(threadIds)
  book = { accountId: book.accountId, drafts: new Map([...book.drafts].filter(([threadId]) => !removed.has(threadId))) }
}

/** Sign-out and account change: every draft goes. */
export function resetChatComposerDrafts(): void {
  book = EMPTY_BOOK
}
