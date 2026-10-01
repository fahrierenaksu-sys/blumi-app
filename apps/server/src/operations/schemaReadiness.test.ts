import assert from "node:assert/strict"
import test from "node:test"
import { createSchemaReadinessCheck, OPTIONAL_READINESS_MIGRATIONS } from "./schemaReadiness"

test("schema readiness rejects missing or mismatched deployed migrations", async () => {
  const expected = [{ id: "001.sql", checksum: "abc" }, { id: "002.sql", checksum: "def" }]
  let rows: Array<{ id: string; checksum: string }> = []
  const check = createSchemaReadinessCheck({ async query(sql: string) {
    return { rows: sql.includes("blumi_migrations") ? rows : [] }
  } }, expected)
  await assert.rejects(check(), /migration/i)
  rows = [{ id: "001.sql", checksum: "abc" }, { id: "002.sql", checksum: "wrong" }]
  await assert.rejects(check(), /migration/i)
  rows = expected
  await check()
})

test("an optional additive migration may be absent but never applied with another checksum", async () => {
  const expected = [{ id: "001.sql", checksum: "abc" }, { id: "070.sql", checksum: "def" }]
  let rows: Array<{ id: string; checksum: string }> = [{ id: "001.sql", checksum: "abc" }]
  const check = createSchemaReadinessCheck({ async query(sql: string) {
    return { rows: sql.includes("blumi_migrations") ? rows : [] }
  } }, expected, ["070.sql"])
  await check()
  rows = [{ id: "001.sql", checksum: "abc" }, { id: "070.sql", checksum: "changed" }]
  await assert.rejects(check(), /migration/i)
  rows = expected
  await check()
  // A required migration stays required even when an optional one is present.
  rows = [{ id: "070.sql", checksum: "def" }]
  await assert.rejects(check(), /migration/i)
})

test("the chat receipts migration is the only optional readiness migration", () => {
  assert.deepEqual([...OPTIONAL_READINESS_MIGRATIONS], ["070_chat_delivery_receipts.sql"])
})

test("schema readiness rejects absent runtime tables even when migration metadata exists", async () => {
  const check = createSchemaReadinessCheck({ async query(sql: string) {
    return { rows: sql.includes("blumi_migrations") ? [{ id: "001.sql", checksum: "abc" }] : [{ relation: "blumi_accounts" }] }
  } }, [{ id: "001.sql", checksum: "abc" }])
  await assert.rejects(check(), /schema/i)
})

test("production readiness includes admin audit and realtime connection lease tables", async () => {
  const expected = [{ id: "064_admin_user_quota_audit.sql", checksum: "abc" }]
  let requiredRelations: string[] = []
  const check = createSchemaReadinessCheck({ async query(sql, values) {
    if (sql.includes("blumi_migrations")) return { rows: expected }
    requiredRelations = values?.[0] as string[]
    return { rows: [] }
  } }, expected)
  await check()
  assert.ok(requiredRelations.includes("blumi_admin_user_audit"))
  assert.ok(requiredRelations.includes("blumi_realtime_connection_leases"))
})
