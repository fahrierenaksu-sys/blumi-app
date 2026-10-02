import assert from "node:assert/strict"
import test from "node:test"
import pg from "pg"
import { startSocialLoop } from "./socialLoopHarness"

/**
 * GET /v1/threads/:threadId/room-invites on PostgreSQL. The chat screen asks
 * for it on every open; it used to cost about nine sequential round trips
 * (session, request budget, thread twice, block, match, connection, partner
 * account and moderation, invites, persona). With the session cache and the
 * in-process request budget it is one statement.
 *
 * Runs through the isolated gate (`npm run verify:postgres`).
 */

const requirePostgres = {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !process.env.DATABASE_URL
}

const recorded: string[] = []
let recording = false
const originalQuery = pg.Client.prototype.query
pg.Client.prototype.query = function recordQuery(this: pg.Client, ...args: unknown[]) {
  if (recording) {
    const first = args[0] as string | { text?: string }
    recorded.push((typeof first === "string" ? first : first?.text ?? "").replace(/\s+/g, " ").trim())
  }
  return (originalQuery as (...values: unknown[]) => unknown).apply(this, args)
} as typeof pg.Client.prototype.query

/** Statements this read could issue; periodic workers' own polls are ignored. */
const READ_TABLES = /blumi_(chat_threads|chat_thread_participants|mini_room_invites|matches|connection_matches|safety_blocks|sessions|accounts|test_personas|shared_rate_budgets)\b/

test("PostgreSQL: listing a thread's room invites is one statement", requirePostgres, async () => {
  const harness = await startSocialLoop({ storage: "postgres" })
  try {
    const ada = await harness.signUp("Ada")
    const bora = await harness.signUp("Bora", { gender: "man" })
    const socket = await ada.connect()
    const { threadId } = await harness.matchPair(ada, bora)
    // The match's thread is created after the like is answered.
    await socket.waitFor("chat.thread_created", (event) => event.payload.threadId === threadId)
    await socket.close()
    const sent = await ada.http("POST", `/v1/threads/${threadId}/room-invites`, {})
    assert.equal(sent.status, 201, JSON.stringify(sent.body))

    const counts: number[] = []
    for (let attempt = 0; attempt < 3; attempt += 1) {
      recorded.length = 0
      recording = true
      const listed = await bora.http("GET", `/v1/threads/${threadId}/room-invites`)
      recording = false
      assert.equal(listed.status, 200, JSON.stringify(listed.body))
      assert.equal((listed.body.invites as unknown[]).length, 1)
      const relevant = recorded.filter((text) => READ_TABLES.test(text))
      counts.push(relevant.length)
      if (attempt > 0) assert.ok(relevant.some((text) => text.startsWith("WITH thread AS")), relevant.join("\n"))
    }
    // The first request also reads the session; later ones answer it from the cache.
    assert.equal(Math.min(...counts.slice(1)), 1, `statements per read: ${counts.join(", ")}`)
  } finally {
    recording = false
    await harness.close()
  }
})
