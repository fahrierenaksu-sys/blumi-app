import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresRealtimeTicketStore } from "./postgresRealtimeTicketStore"

test("postgres realtime tickets use parameterized insert and atomic consume", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const store = createPostgresRealtimeTicketStore({
    async query(text, values) {
      calls.push({ text, values })
      return {
        rows: text.includes("DELETE")
          ? [{ session_token_hash: "a".repeat(64) }]
          : [{ ticket_digest: "digest_a" }]
      }
    }
  })

  assert.equal(await store.issue({
    digest: "digest_a",
    sessionTokenHash: "a".repeat(64),
    expiresAtMs: 2_000
  }), true)
  assert.equal(
    await store.consume("digest_a", new Date(1_000)),
    "a".repeat(64)
  )
  assert.match(calls[0]?.text ?? "", /ON CONFLICT \(ticket_digest\) DO NOTHING/)
  assert.doesNotMatch(calls[0]?.text ?? "", /\bsession_token\b/)
  assert.deepEqual(calls[0]?.values?.[1], "a".repeat(64))
  assert.match(calls[1]?.text ?? "", /DELETE FROM blumi_realtime_tickets/)
  assert.match(calls[1]?.text ?? "", /RETURNING session_token_hash/)
  assert.match(calls[1]?.text ?? "", /expires_at > \$2/)
  assert.deepEqual(calls[1]?.values?.[0], "digest_a")
})

test("ticket expiry cleanup uses a bounded skip-locked batch and preserves valid tickets", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const store = createPostgresRealtimeTicketStore({ async query(text, values) {
    calls.push({ text, values }); return { rows: [{ ticket_digest: "expired" }] }
  } })
  assert.equal(await store.purgeExpired(new Date(2000), 100), 1)
  assert.match(calls[0]!.text, /expires_at <= \$1/)
  assert.match(calls[0]!.text, /LIMIT \$2/)
  assert.match(calls[0]!.text, /FOR UPDATE SKIP LOCKED/)
  assert.equal(calls[0]!.values![1], 100)
  await assert.rejects(store.purgeExpired(new Date(), 0), /batch/i)
})
