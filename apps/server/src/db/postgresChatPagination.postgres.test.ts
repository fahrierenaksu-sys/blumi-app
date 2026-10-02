import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { createChatService } from "../chat/chatService"

test("chat pagination reads a constant number of times per page, preserves microsecond cursor and durable unread across connections", { skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" }, async () => {
  assert.ok(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const other = new Pool({ connectionString: process.env.DATABASE_URL })
  const service = createChatService({ repository: createPostgresChatRepository(pool) })
  try {
    for (let index = 0; index < 103; index++) await service.createThread({ threadId: `page_${String(index).padStart(3, "0")}`, miniRoomId: "room", participantUserIds: ["a", "b"], participants: [{ userId: "a" }, { userId: "b" }] }, new Date("2026-09-05T10:00:00Z"))
    await pool.query("UPDATE blumi_chat_threads SET created_at = '2026-09-05T10:00:00.000123Z'")
    await service.sendMessage("a", "page_102", "offline", new Date("2026-09-05T10:00:01Z"))
    let reads = 0
    const counted = createPostgresChatRepository({ query: (...args: unknown[]) => { reads++; return (pool.query as Function).apply(pool, args) } } as unknown as Pool)
    const first = await counted.listThreadsPage("b", { limit: 100 })
    const firstPageReads = reads
    assert.equal(first.threads.length, 100)
    assert.equal(first.threads[0].unreadCount, 1)
    await service.sendMessage("a", "page_000", "new activity", new Date("2026-09-05T10:00:02Z"))
    const second = await counted.listThreadsPage("b", { limit: 100, cursor: first.nextCursor! })
    const secondPageReads = reads - firstPageReads
    // No N+1: the 100-thread page costs the same as the 3-thread page.
    assert.equal(firstPageReads, secondPageReads)
    assert.ok(firstPageReads <= 4, `a thread page took ${firstPageReads} reads`)
    assert.equal(second.threads.length, 3)
    assert.equal(new Set([...first.threads, ...second.threads].map((thread) => thread.threadId)).size, 103)
    assert.equal(second.nextCursor, null)
    const secondDevice = createChatService({ repository: createPostgresChatRepository(other) })
    await secondDevice.markThreadRead("b", "page_102", new Date("2026-09-05T10:01:00Z"))
    await service.markThreadRead("b", "page_102", new Date("2026-09-05T10:00:00Z"))
    const refreshed = await service.listThreadsPage("b")
    assert.equal(refreshed.threads[0].unreadCount, 0)
    assert.equal(refreshed.threads[0].lastReadAt, "2026-09-05T10:01:00.000Z")
    await assert.rejects(counted.listThreadsPage("a", { cursor: first.nextCursor! }), /invalid/)
  } finally { await other.end(); await pool.end() }
})
