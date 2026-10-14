import assert from "node:assert/strict"
import test from "node:test"
import type { Pool } from "pg"
import { AdminUserNotFoundError } from "../admin/adminUsersService"
import { createPostgresAdminUserRepository } from "./postgresAdminUserRepository"

const QUOTA_INPUT = {
  userId: "user_missing",
  operatorId: "operator_1",
  tokenId: "token_1",
  reason: "support request",
  now: new Date("2026-10-14T10:00:00Z")
}

function createFakePool(options: { rollbackError?: Error }) {
  const released: unknown[] = []
  const client = {
    async query(text: string) {
      if (text === "ROLLBACK" && options.rollbackError) throw options.rollbackError
      // Every other statement succeeds; the account lookup finds nobody.
      return { rowCount: 0, rows: [] }
    },
    release(error?: Error) {
      released.push(error)
    }
  }
  const pool = { connect: async () => client } as unknown as Pool
  return { pool, released }
}

test("a failed ROLLBACK destroys the connection instead of returning it to the pool, and the first error still surfaces", async () => {
  const rollbackError = new Error("connection lost during ROLLBACK")
  const { pool, released } = createFakePool({ rollbackError })

  await assert.rejects(
    createPostgresAdminUserRepository(pool).resetQuota(QUOTA_INPUT),
    AdminUserNotFoundError
  )

  assert.equal(released.length, 1)
  assert.equal(released[0], rollbackError)
})

test("a clean ROLLBACK releases the connection for reuse", async () => {
  const { pool, released } = createFakePool({})

  await assert.rejects(
    createPostgresAdminUserRepository(pool).grantQuota({ ...QUOTA_INPUT, amount: 5 }),
    AdminUserNotFoundError
  )

  assert.deepEqual(released, [undefined])
})
