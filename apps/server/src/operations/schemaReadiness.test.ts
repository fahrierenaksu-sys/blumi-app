import assert from "node:assert/strict"
import test from "node:test"
import { createSchemaReadinessCheck } from "./schemaReadiness"

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

test("schema readiness rejects absent runtime tables even when migration metadata exists", async () => {
  const check = createSchemaReadinessCheck({ async query(sql: string) {
    return { rows: sql.includes("blumi_migrations") ? [{ id: "001.sql", checksum: "abc" }] : [{ relation: "blumi_accounts" }] }
  } }, [{ id: "001.sql", checksum: "abc" }])
  await assert.rejects(check(), /schema/i)
})
