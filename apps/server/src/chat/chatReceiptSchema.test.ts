import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  CHAT_RECEIPTS_MIGRATION_ID,
  createChatReceiptSchemaProbe
} from "./chatReceiptSchema"

function createLedger(initial: string | null) {
  let checksum = initial
  let failing = false
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  return {
    calls,
    set(next: string | null) { checksum = next },
    fail(next: boolean) { failing = next },
    pool: {
      async query(text: string, values?: readonly unknown[]) {
        calls.push({ text, values })
        if (failing) throw new Error("connection lost")
        return { rows: checksum === null ? [] : [{ checksum: `${checksum}  ` }] }
      }
    }
  }
}

test("receipts stay off until the 070 ledger row carries the packaged checksum", async () => {
  let clock = 0
  const ledger = createLedger(null)
  const probe = createChatReceiptSchemaProbe(ledger.pool, { checksum: "c070", ttlMs: 1000, now: () => clock })
  assert.equal(await probe.isReady(), false)
  assert.equal(ledger.calls[0]?.text, "SELECT checksum FROM blumi_migrations WHERE id = $1")
  assert.deepEqual(ledger.calls[0]?.values, [CHAT_RECEIPTS_MIGRATION_ID])

  ledger.set("other")
  clock = 1000
  assert.equal(await probe.isReady(), false, "a different checksum is not the reviewed migration")

  ledger.set("c070")
  clock = 1500
  assert.equal(await probe.isReady(), false, "cached inside the interval")
  clock = 2000
  assert.equal(await probe.isReady(), true, "applied: on without a redeploy")
  assert.equal(ledger.calls.length, 3)
})

test("peek answers from the cache, refreshes in the background, and never waits", async () => {
  let clock = 0
  const ledger = createLedger("c070")
  const probe = createChatReceiptSchemaProbe(ledger.pool, { checksum: "c070", ttlMs: 1000, now: () => clock })
  assert.equal(probe.peek(), false, "unknown before the first probe resolves")
  await new Promise<void>((resolveTick) => setImmediate(resolveTick))
  assert.equal(probe.peek(), true)
  assert.equal(ledger.calls.length, 1)
  ledger.set(null)
  clock = 5000
  assert.equal(probe.peek(), true, "stale answer while the refresh runs")
  await new Promise<void>((resolveTick) => setImmediate(resolveTick))
  assert.equal(probe.peek(), false, "a rolled-back migration turns receipts off again")
})

test("a failed ledger lookup fails closed and is retried on the next call", async () => {
  const ledger = createLedger("c070")
  const probe = createChatReceiptSchemaProbe(ledger.pool, { checksum: "c070", ttlMs: 60_000, now: () => 0 })
  ledger.fail(true)
  assert.equal(await probe.isReady(), false)
  ledger.fail(false)
  assert.equal(await probe.isReady(), true)
})

test("concurrent callers share one ledger query", async () => {
  const ledger = createLedger("c070")
  const probe = createChatReceiptSchemaProbe(ledger.pool, { checksum: "c070", now: () => 0 })
  assert.deepEqual(await Promise.all([probe.isReady(), probe.isReady(), probe.isReady()]), [true, true, true])
  assert.equal(ledger.calls.length, 1)
})

test("the default checksum is the packaged 070 file's SHA-256, as the migrator records it", async () => {
  const sql = readFileSync(resolve(__dirname, "../../db/migrations", CHAT_RECEIPTS_MIGRATION_ID), "utf8")
  const ledger = createLedger(createHash("sha256").update(sql).digest("hex"))
  assert.equal(await createChatReceiptSchemaProbe(ledger.pool).isReady(), true)
})
