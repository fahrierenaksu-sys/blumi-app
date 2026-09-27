import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

test("Discovery quota migration is UTC-day scoped and consumes decisions atomically", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/037_discovery_decision_quota.sql"),
    "utf8"
  )

  assert.match(sql, /CREATE TABLE IF NOT EXISTS blumi_discovery_decision_quotas/i)
  assert.match(sql, /PRIMARY KEY \(user_id, quota_day\)/i)
  assert.match(sql, /10 \+ extension_decisions/i)
  assert.match(sql, /AT TIME ZONE 'UTC'/i)
  assert.match(sql, /pg_advisory_xact_lock/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION blumi_consume_discovery_decision/i)
  assert.match(sql, /INSERT INTO blumi_discovery_decisions/i)
  assert.match(sql, /p_reconsideration_decided_at TIMESTAMPTZ DEFAULT NULL/i)
  assert.match(sql, /UPDATE blumi_discovery_decisions/i)
  assert.match(sql, /UPDATE blumi_discovery_decision_quotas/i)
})

test("Discovery decision repair qualifies quota columns that shadow output parameters", async () => {
  const sql = await readFile(
    resolve(__dirname, "../../db/migrations/061_qualify_discovery_decision_quota_columns.sql"),
    "utf8"
  )

  assert.match(sql, /CREATE OR REPLACE FUNCTION blumi_consume_discovery_decision/i)
  assert.match(sql, /SELECT q\.used_decisions, q\.extension_decisions/i)
  assert.match(sql, /AND q\.quota_day = v_quota_day/i)
  assert.match(sql, /RETURNING q\.used_decisions INTO v_used/i)
})
