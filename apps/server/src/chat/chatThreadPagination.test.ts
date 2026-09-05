import assert from "node:assert/strict"
import test from "node:test"
import { encodeThreadCursor, normalizeThreadPage, type ChatThreadPageOptions } from "./chatThreadPagination"

test("chat page boundaries reject malformed payloads and versioned foreign cursors", () => {
  for (const value of [null, [], "oops", { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { cursor: "bad!" }, { cursor: "e30" }]) {
    assert.throws(() => normalizeThreadPage("a", value as ChatThreadPageOptions))
  }
  const valid = { userId: "a", threadId: "one", createdAt: "2026-09-05T10:00:00.123456Z" }
  assert.deepEqual(normalizeThreadPage("a", { limit: 1, cursor: encodeThreadCursor(valid) }), { limit: 1, cursor: valid })
  assert.throws(() => normalizeThreadPage("b", { cursor: encodeThreadCursor(valid) }))
  assert.throws(() => normalizeThreadPage("a", { cursor: encodeThreadCursor({ ...valid, createdAt: "1" }) }))
  assert.deepEqual(normalizeThreadPage("a"), { limit: 50 })
})
