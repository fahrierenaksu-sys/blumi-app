import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createSchemaReadinessCheck, OPTIONAL_READINESS_MIGRATIONS } from "./schemaReadiness"

test("real PostgreSQL readiness rejects incomplete migrations and missing runtime schema", { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    const check = createSchemaReadinessCheck(client)
    await check()
    await client.query("BEGIN")
    await client.query(
      "DELETE FROM blumi_migrations WHERE id = (SELECT max(id) FROM blumi_migrations WHERE id <> ALL($1::text[]))",
      [[...OPTIONAL_READINESS_MIGRATIONS]]
    )
    await assert.rejects(check(), /migration/i)
    await client.query("ROLLBACK")
    // The binary deploys before an optional migration is applied: a database
    // without its ledger row stays ready, one with a changed checksum does not.
    await client.query("BEGIN")
    await client.query("DELETE FROM blumi_migrations WHERE id = ANY($1::text[])", [[...OPTIONAL_READINESS_MIGRATIONS]])
    await check()
    await client.query("ROLLBACK")
    await client.query("BEGIN")
    await client.query("UPDATE blumi_migrations SET checksum = repeat('0', 64) WHERE id = ANY($1::text[])", [[...OPTIONAL_READINESS_MIGRATIONS]])
    await assert.rejects(check(), /migration/i)
    await client.query("ROLLBACK")
    await client.query("BEGIN")
    await client.query("ALTER TABLE blumi_accounts RENAME TO blumi_accounts_readiness_test")
    await assert.rejects(check(), /schema/i)
    await client.query("ROLLBACK")
    await check()
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end() }
})
