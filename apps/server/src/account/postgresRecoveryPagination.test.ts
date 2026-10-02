import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createAccountRecoveryService, MAX_PENDING_RECOVERY_REQUESTS_PER_PHONE } from "./accountRecoveryService"
import { createPostgresAccountRecoveryRepository } from "../db/postgresAccountRecoveryRepository"
import { createAuthService } from "../auth/authService"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "../db/disposablePostgres"

test("PostgreSQL recovery cursor preserves tied timestamp requests across pages", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const repository = createPostgresAccountRecoveryRepository(pool)
    const service = createAccountRecoveryService({ repository, authService: createAuthService() })
    for (let i = 0; i < 105; i++) await repository.save({ requestId: `recovery_pg_${String(i).padStart(3, "0")}`,
      newPhoneNumber: `+90555000${String(i).padStart(4, "0")}`, createdAt: "2026-09-05T10:00:00.000Z", status: "pending" })
    const first = await service.listPage({ status: "pending", limit: 100 })
    assert.equal(first.requests.length, 100)
    assert.ok(first.nextCursor)
    await service.resolve({ requestId: first.requests[0]!.requestId, status: "rejected", operatorId: "test", tokenId: "test" })
    const second = await service.listPage({ status: "pending", limit: 100, cursor: first.nextCursor })
    assert.equal(second.requests.length, 5)
    assert.equal(second.nextCursor, null)
    assert.equal(new Set([...first.requests, ...second.requests].map(r => r.requestId)).size, 105)
    assert.equal((await service.listPage({ status: "rejected" })).requests.length, 1)
  } finally { await pool.end() }
})

test("PostgreSQL recovery requests are deduplicated and capped per verified phone", disposablePostgresSkip(), async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const repository = createPostgresAccountRecoveryRepository(pool)
    const phone = "+905557770000"
    const save = (requestId: string, claimedOldPhoneNumber?: string) => repository.save({
      requestId, newPhoneNumber: phone, ...(claimedOldPhoneNumber ? { claimedOldPhoneNumber } : {}),
      createdAt: new Date().toISOString(), status: "pending"
    })
    await save("dedupe_1", "+905551110001")
    await save("dedupe_2", "+905551110001")
    await save("dedupe_3")
    await save("dedupe_4")
    await save("dedupe_5", "+905551110002")
    await save("dedupe_6", "+905551110003")
    const rows = (await pool.query(
      "SELECT request_id FROM blumi_account_recovery_requests WHERE new_phone_number = $1 ORDER BY request_id", [phone]
    )).rows.map((row) => row.request_id)
    assert.deepEqual(rows, ["dedupe_1", "dedupe_3", "dedupe_5"])
    assert.equal(rows.length, MAX_PENDING_RECOVERY_REQUESTS_PER_PHONE)
  } finally { await pool.end() }
})
