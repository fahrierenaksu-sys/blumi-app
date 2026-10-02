import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresEconomyRepository } from "./postgresEconomyRepository"

test("a store webhook transaction whose ROLLBACK fails destroys its connection instead of returning it to the pool", async () => {
  const releases: unknown[] = []
  const lost = new Error("connection lost")
  const client = {
    async query(text: string) {
      if (text === "BEGIN") return { rows: [] }
      if (text === "ROLLBACK") throw lost
      throw new Error("statement failed")
    },
    release(error?: unknown) { releases.push(error) }
  }
  const pool = { async query() { return { rows: [] } }, async connect() { return client } }
  await assert.rejects(createPostgresEconomyRepository(pool).applyCoinTransaction({
    provider: "revenuecat", eventId: "event_1", transactionId: "transaction_1", userId: "user_a",
    productId: "com.blumi.mobile.coins.500", store: "ios", kind: "credit", coins: 500,
    payloadHash: "a".repeat(64), occurredAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z"
  }), /statement failed/)
  assert.deepEqual(releases, [lost], "release(error) makes node-postgres destroy the broken client")
})
