import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createAccountRecoveryService } from "./accountRecoveryService"
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
      newPhoneNumber: "+905550000000", createdAt: "2026-09-05T10:00:00.000Z", status: "pending" })
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
