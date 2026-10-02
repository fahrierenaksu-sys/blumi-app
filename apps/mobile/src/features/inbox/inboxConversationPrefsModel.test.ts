import assert from "node:assert/strict"
import test from "node:test"
import {
  arrangeInboxThreads,
  deleteConversationForMe,
  EMPTY_INBOX_CONVERSATION_PREFS,
  isConversationDeletedForMe,
  isConversationPinned,
  MAX_INBOX_PREF_ENTRIES,
  parseInboxConversationPrefs,
  pinConversation,
  serializeInboxConversationPrefs,
  unpinConversation,
  type InboxThreadLike
} from "./inboxConversationPrefsModel"

const thread = (threadId: string, lastSentAt?: string): InboxThreadLike => ({
  threadId,
  createdAt: "2026-10-01T08:00:00.000Z",
  ...(lastSentAt ? { lastMessage: { sentAt: lastSentAt } } : {})
})
// Server order: newest activity first.
const threads = [
  thread("a", "2026-10-02T10:05:00.000Z"),
  thread("b", "2026-10-02T10:04:00.000Z"),
  thread("c", "2026-10-02T10:03:00.000Z"),
  thread("d")
]
const ids = (list: readonly InboxThreadLike[]) => list.map((entry) => entry.threadId)
const at = (minute: number) => new Date(Date.UTC(2026, 9, 2, 11, minute))

test("pinned conversations stay on top, most recently pinned first; unpin returns a row to its place", () => {
  let prefs = pinConversation(EMPTY_INBOX_CONVERSATION_PREFS, "c", at(1))
  prefs = pinConversation(prefs, "d", at(2))
  assert.deepEqual(ids(arrangeInboxThreads(threads, prefs)), ["d", "c", "a", "b"])
  assert.equal(pinConversation(prefs, "d", at(9)), prefs, "pinning again keeps the original pin time")
  prefs = unpinConversation(prefs, "d")
  assert.deepEqual(ids(arrangeInboxThreads(threads, prefs)), ["c", "a", "b", "d"])
  assert.equal(isConversationPinned(prefs, "d"), false)
  assert.equal(unpinConversation(prefs, "d"), prefs)
})

test("a new message never pushes a row above the pinned ones", () => {
  const prefs = pinConversation(EMPTY_INBOX_CONVERSATION_PREFS, "c", at(1))
  const afterNewMessage = [thread("b", "2026-10-02T10:09:00.000Z"), threads[0]!, threads[2]!, threads[3]!]
  assert.deepEqual(ids(arrangeInboxThreads(afterNewMessage, prefs)), ["c", "b", "a", "d"])
})

test("delete for me hides the conversation and unpins it until a newer message arrives", () => {
  let prefs = pinConversation(EMPTY_INBOX_CONVERSATION_PREFS, "b", at(1))
  prefs = deleteConversationForMe(prefs, threads[1]!)
  assert.equal(isConversationPinned(prefs, "b"), false)
  assert.deepEqual(ids(arrangeInboxThreads(threads, prefs)), ["a", "c", "d"])
  const sameActivity = [threads[0]!, thread("b", "2026-10-02T10:04:00.000Z")]
  assert.equal(isConversationDeletedForMe(prefs, sameActivity[1]!), true, "the deleted messages do not bring it back")
  const newer = thread("b", "2026-10-02T10:20:00.000Z")
  assert.equal(isConversationDeletedForMe(prefs, newer), false, "a later message reopens it")
  assert.deepEqual(ids(arrangeInboxThreads([newer, threads[0]!], prefs)), ["b", "a"])
})

test("a conversation without messages is hidden through its creation time", () => {
  const prefs = deleteConversationForMe(EMPTY_INBOX_CONVERSATION_PREFS, threads[3]!)
  assert.equal(isConversationDeletedForMe(prefs, threads[3]!), true)
  assert.equal(isConversationDeletedForMe(prefs, thread("d", "2026-10-02T12:00:00.000Z")), false)
})

test("deleting again never moves the hide back in time", () => {
  const later = deleteConversationForMe(EMPTY_INBOX_CONVERSATION_PREFS, thread("a", "2026-10-02T10:30:00.000Z"))
  const again = deleteConversationForMe(later, thread("a", "2026-10-02T10:05:00.000Z"))
  assert.equal(again.deletedThrough.a, "2026-10-02T10:30:00.000Z")
})

test("stored preferences round-trip, and damaged or foreign data reads as empty", () => {
  let prefs = pinConversation(EMPTY_INBOX_CONVERSATION_PREFS, "a", at(1))
  prefs = deleteConversationForMe(prefs, threads[2]!)
  assert.deepEqual(parseInboxConversationPrefs(serializeInboxConversationPrefs(prefs)), prefs)
  for (const raw of [null, "", "{", "[]", "{\"version\":2}", JSON.stringify({ version: 1, pinned: "x" })]) {
    const parsed = parseInboxConversationPrefs(raw)
    assert.deepEqual(parsed.pinned, {})
    assert.deepEqual(parsed.deletedThrough, {})
  }
  const mixed = parseInboxConversationPrefs(JSON.stringify({
    version: 1,
    pinned: { ok: "2026-10-02T10:00:00.000Z", bad: 3, nodate: "soon", " ": "2026-10-02T10:00:00.000Z" },
    deletedThrough: []
  }))
  assert.deepEqual(Object.keys(mixed.pinned), ["ok"])
})

test("stored entries stay bounded, keeping the newest", () => {
  let prefs = EMPTY_INBOX_CONVERSATION_PREFS
  for (let index = 0; index < MAX_INBOX_PREF_ENTRIES + 5; index += 1) {
    prefs = pinConversation(prefs, `t${index}`, new Date(Date.UTC(2026, 9, 2, 0, 0, index)))
  }
  assert.equal(Object.keys(prefs.pinned).length, MAX_INBOX_PREF_ENTRIES)
  assert.equal(isConversationPinned(prefs, "t0"), false)
  assert.equal(isConversationPinned(prefs, `t${MAX_INBOX_PREF_ENTRIES + 4}`), true)
})
