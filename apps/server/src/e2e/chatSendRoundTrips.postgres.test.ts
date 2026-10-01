import assert from "node:assert/strict"
import test from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import pg from "pg"
import { startSocialLoop, type SimSocket, type SimUser, type SocialLoopHarness } from "./socialLoopHarness"

/**
 * Database round trips per chat message on PostgreSQL, for the HTTP route and
 * the realtime `chat.send_message` (2026-10-01). Every statement a send issues
 * counts, from the request to the end of its inline delivery (fanout, push
 * enqueue, outbox completion). Latency and pool capacity are both bounded by
 * this number times the distance to the database
 * (docs/quality/REALTIME_CAPACITY_2026-10-01.md), so it may only go down.
 *
 * Baseline before the merged send statement (recipient with a push device):
 * HTTP 8 statements up to the persisting one and 16 in total, realtime 5 and 13.
 *
 * Statements that belong to other periodic work are left out: the outbox
 * worker's untargeted poll and realtime lease, sweep and peer traffic. A
 * `pg_notify` per delivery happens only while another instance listens (or
 * during the first peer interval after start), so it is left out as well.
 *
 * Runs through the isolated gate (`npm run verify:postgres`).
 */

const requirePostgres = {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !process.env.DATABASE_URL
}

/** Upper bounds per send (the measured maximum over SENDS sends). */
const BUDGET = {
  http: { beforeAck: 3, total: 8 },
  realtime: { beforeAck: 1, total: 6 }
} as const
const SENDS = 5

interface RecordedQuery { text: string; values: readonly unknown[] }

const recorded: RecordedQuery[] = []
let recording = false
const originalQuery = pg.Client.prototype.query
pg.Client.prototype.query = function recordQuery(this: pg.Client, ...args: unknown[]) {
  if (recording) {
    const [first, second] = args as [string | { text?: string; values?: unknown[] }, unknown]
    const text = typeof first === "string" ? first : first?.text ?? ""
    const values = Array.isArray(second) ? second : (typeof first === "object" && first?.values) || []
    recorded.push({ text: text.replace(/\s+/g, " ").trim(), values })
  }
  return (originalQuery as (...values: unknown[]) => unknown).apply(this, args)
} as typeof pg.Client.prototype.query

function isUnrelatedPeriodicWork(query: RecordedQuery): boolean {
  if (/pg_notify/.test(query.text)) return true
  if (/blumi_realtime_connection_leases|blumi_realtime_tickets/.test(query.text)) return true
  if (/FROM unnest\(\$1::text\[\], \$2::text\[\]\) AS wanted/.test(query.text)) return true
  // The outbox worker's poll claims any due job; the send path claims its own.
  return /^WITH due AS/.test(query.text) && query.values[3] === null
}

const shortText = (query: RecordedQuery) => query.text.slice(0, 100)

async function measureSend(send: () => Promise<{ messageId: string }>): Promise<{ beforeAck: number; total: number; queries: string[] }> {
  recorded.length = 0
  recording = true
  try {
    const { messageId } = await send()
    const completed = () => recorded.some((query) =>
      /^UPDATE blumi_chat_delivery_outbox SET completed_at/.test(query.text) && query.values[0] === messageId)
    for (let attempt = 0; attempt < 200 && !completed(); attempt += 1) await delay(10)
    assert.ok(completed(), "the inline delivery completed the outbox job")
    // Work the old pipeline did after completing the job (test-persona lookup).
    await delay(150)
    const counted = recorded.filter((query) => !isUnrelatedPeriodicWork(query))
    // The acknowledgement waits for the statement that persists the message;
    // everything after it is delivery work that runs after the answer.
    const beforeAck = counted.findIndex((query) => /INSERT INTO blumi_chat_messages/.test(query.text)) + 1
    assert.ok(beforeAck > 0, "the send persisted a message")
    return { beforeAck, total: counted.length, queries: counted.map(shortText) }
  } finally {
    recording = false
  }
}

async function sendOverHttp(user: SimUser, threadId: string, index: number) {
  const response = await user.http("POST", `/v1/threads/${threadId}/messages`, {
    body: `counted http ${index}`, clientMessageId: `rt-count-http-${String(index).padStart(4, "0")}`
  })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  return { messageId: response.body.message.messageId as string }
}

async function sendOverSocket(socket: SimSocket, threadId: string, index: number) {
  const clientMessageId = `rt-count-socket-${String(index).padStart(4, "0")}`
  const since = socket.mark()
  socket.send("chat.send_message", { threadId, body: `counted socket ${index}`, clientMessageId })
  const ack = await socket.waitFor("chat.message_received",
    (event) => (event.payload as { clientMessageId?: string }).clientMessageId === clientMessageId, { since })
  return { messageId: ack.event.payload.messageId }
}

async function preparePair(harness: SocialLoopHarness) {
  const ada = await harness.signUp("Ada")
  const bora = await harness.signUp("Bora", { gender: "man" })
  const [sa, sb] = await Promise.all([ada.connect(), bora.connect()])
  const { threadId } = await harness.matchPair(ada, bora)
  await sb.waitFor("chat.thread_created", (event) => event.payload.threadId === threadId)
  // Production recipients usually have a device: count the push enqueue too.
  const device = await bora.http("POST", "/v1/devices", { platform: "ios", pushToken: `ExponentPushToken[rt-${bora.userId.slice(-8)}]` })
  assert.equal(device.status, 201, JSON.stringify(device.body))
  return { ada, bora, sa, sb, threadId }
}

test("PostgreSQL: a chat send stays within its database round-trip budget on both paths", requirePostgres, async (t) => {
  const harness = await startSocialLoop({ storage: "postgres" })
  try {
    const { ada, sa, sb, threadId } = await preparePair(harness)
    const results: Record<"http" | "realtime", Array<{ beforeAck: number; total: number; queries: string[] }>> = { http: [], realtime: [] }
    for (let index = 1; index <= SENDS; index += 1) {
      const sinceB = sb.mark()
      results.http.push(await measureSend(() => sendOverHttp(ada, threadId, index)))
      await sb.waitFor("chat.message_received", (event) => event.payload.body === `counted http ${index}`, { since: sinceB })
      results.realtime.push(await measureSend(() => sendOverSocket(sa, threadId, index)))
    }
    for (const path of ["http", "realtime"] as const) {
      const worst = results[path].reduce((max, entry) => entry.total > max.total ? entry : max)
      const beforeAck = Math.max(...results[path].map((entry) => entry.beforeAck))
      t.diagnostic(`${path}: ${beforeAck} round trips before the acknowledgement, ${worst.total} in total (max of ${SENDS})`)
      for (const query of worst.queries) t.diagnostic(`  ${path}: ${query}`)
      assert.ok(beforeAck <= BUDGET[path].beforeAck,
        `${path}: ${beforeAck} round trips before the acknowledgement (budget ${BUDGET[path].beforeAck})\n${worst.queries.join("\n")}`)
      assert.ok(worst.total <= BUDGET[path].total,
        `${path}: ${worst.total} round trips per send (budget ${BUDGET[path].total})\n${worst.queries.join("\n")}`)
    }
    assert.deepEqual(harness.deliveryErrors, [])
    await Promise.all([sa.close(), sb.close()])
  } finally {
    await harness.close()
  }
})
