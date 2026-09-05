import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createSchemaReadinessCheck } from "./schemaReadiness"

test("real PostgreSQL readiness rejects incomplete migrations and missing runtime schema", { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    const check = createSchemaReadinessCheck(client)
    await check()
    await client.query("BEGIN")
    await client.query("DELETE FROM blumi_migrations WHERE id = (SELECT max(id) FROM blumi_migrations)")
    await assert.rejects(check(), /migration/i)
    await client.query("ROLLBACK")
    await client.query("BEGIN")
    await client.query("ALTER TABLE blumi_accounts RENAME TO blumi_accounts_readiness_test")
    await assert.rejects(check(), /schema/i)
    await client.query("ROLLBACK")
    await check()
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end() }
})
