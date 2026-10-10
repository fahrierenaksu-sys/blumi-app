import assert from "node:assert/strict"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { Pool } from "pg"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "../db/disposablePostgres"
import { createPostgresSmsAdmission, SMS_ADMISSION_MIGRATION_ID, type SmsAdmissionEvent } from "./firebaseSmsAdmission"
import { createSmsOutcomeObserver } from "./firebaseSmsOutcomes"

const checksum = createHash("sha256").update(readFileSync(resolve(
  __dirname, "../../db/migrations", SMS_ADMISSION_MIGRATION_ID
))).digest("hex")
const input = (index = 1): SmsAdmissionEvent => ({
  eventId: randomUUID(), resource: "projects/fixture-project", smsType: "SIGN_IN_OR_SIGN_UP",
  timestamp: new Date().toISOString(), phoneNumber: `+1202555${String(100 + index % 100).padStart(4, "0")}`,
  ipAddress: "203.0.113.7"
})
const fixtureSecret = "fixture-key-with-at-least-32-bytes-long"
const digest = (scope: string, value: string) => createHmac("sha256", fixtureSecret)
  .update(JSON.stringify(["blumi-sms-v1", "fixture-project", scope, value])).digest("hex")
async function provisionPermit(pool: Pool, event: SmsAdmissionEvent) {
  const key = createHash("sha256").update(randomUUID()).digest("hex")
  const challenge = createHash("sha256").update(randomUUID()).digest("hex")
  const phone = digest("phone", event.phoneNumber)
  await pool.query("INSERT INTO blumi_sms_installations (installation_key, platform, created_at) VALUES ($1, 'android', clock_timestamp())", [key])
  await pool.query(`INSERT INTO blumi_sms_device_challenges
    (challenge_key, installation_key, phone_key, ip_key, platform, created_at, expires_at)
    VALUES ($1, $2, $3, $4, 'android', statement_timestamp(), statement_timestamp() + interval '2 minutes')`,
    [challenge, key, phone, digest("ip", event.ipAddress)])
  await pool.query(`INSERT INTO blumi_sms_device_permits (challenge_key, installation_key, phone_key, created_at, expires_at)
    VALUES ($1, $2, $3, statement_timestamp(), statement_timestamp() + interval '60 seconds')`, [challenge, key, phone])
}

async function fixture() {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const pools = [new Pool({ connectionString: process.env.DATABASE_URL, max: 4 }),
    new Pool({ connectionString: process.env.DATABASE_URL, max: 4 })]
  await pools[0]!.query("TRUNCATE blumi_sms_send_admissions")
  await pools[0]!.query("TRUNCATE blumi_sms_device_permits, blumi_sms_device_challenges, blumi_sms_installations")
  await pools[0]!.query("TRUNCATE blumi_sms_country_policy")
  await pools[0]!.query(`INSERT INTO blumi_sms_admission_config
    (singleton, enabled, ip_limit_15_minutes, ip_limit_24_hours, project_limit_24_hours,
      project_limit_15_minutes, cost_limit_24_hours_microusd, cost_limit_month_microusd, opening_month_utc, opening_cost_microusd)
    VALUES (true, true, 10, 50, 1500, 50, 6000000, 20000000, to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM'), 0) ON CONFLICT (singleton) DO UPDATE SET
    enabled = true, ip_limit_15_minutes = 10, ip_limit_24_hours = 50, project_limit_24_hours = 1500,
    project_limit_15_minutes = 50, cost_limit_24_hours_microusd = 6000000,
    cost_limit_month_microusd = 20000000, opening_month_utc = to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM'), opening_cost_microusd = 0,
    verification_outcomes_enabled = false`)
  await pools[0]!.query(`INSERT INTO blumi_sms_country_policy
    (country, enabled, price_microusd, price_valid_until, limit_24_hours, cost_limit_24_hours_microusd)
    VALUES ('US', true, 10000, clock_timestamp() + interval '7 days', 1500, 2000000)`)
  const rawReserve = pools.map(pool => createPostgresSmsAdmission({ pool, projectId: "fixture-project",
    hmacSecret: fixtureSecret, expectedMigrationChecksum: checksum }))
  // These admission-policy tests provision a trusted permit explicitly; the
  // attestation and device-budget gate has its own integration/crypto tests.
  const reserve = rawReserve.map(handler => async (event: SmsAdmissionEvent) => {
    await provisionPermit(pools[0]!, event)
    return handler(event)
  })
  return { pools, reserve, rawReserve, close: () => Promise.all(pools.map(pool => pool.end())) }
}

test("provider budgets start disabled and never permit a mismatched schema lock", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await f.pools[0]!.query("DELETE FROM blumi_sms_admission_config")
    assert.equal((await f.reserve[0]!(input())).reason, "disabled")
    await f.pools[0]!.query("INSERT INTO blumi_sms_admission_config (singleton) VALUES (true)")
    assert.equal((await f.reserve[0]!(input())).reason, "disabled")
    const badLock = createPostgresSmsAdmission({ pool: f.pools[0]!, projectId: "fixture-project",
      hmacSecret: "fixture-key-with-at-least-32-bytes-long", expectedMigrationChecksum: "0".repeat(64) })
    await assert.rejects(badLock(input()), /schema is unavailable/)
    assert.equal((await f.pools[0]!.query("SELECT count(*)::int AS total FROM blumi_sms_send_admissions")).rows[0].total, 0)
  } finally { await f.close() }
})

test("activation subtracts existing month spend and never assumes an unknown opening balance is free", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET opening_month_utc = NULL")
    await assert.rejects(f.reserve[0]!(input()), /opening balance/)
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET opening_month_utc = to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM'), opening_cost_microusd = 19990000")
    assert.equal((await f.reserve[0]!(input())).allowed, true)
    assert.equal((await f.reserve[1]!(input(2))).reason, "monthly_cost_limit")
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET opening_month_utc = to_char((clock_timestamp() AT TIME ZONE 'UTC') - interval '1 month', 'YYYY-MM')")
    assert.equal((await f.reserve[1]!(input(2))).allowed, true)
  } finally { await f.close() }
})

test("concurrent same-phone sends across independent instances reserve only one SMS", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => f.reserve[i % 2]!(input())))
    assert.equal(results.filter(result => result.allowed).length, 1)
    assert.ok(results.filter(result => !result.allowed).every(result => result.reason === "phone_cooldown"))
  } finally { await f.close() }
})

test("one phone has three reservations per rolling 24 hours across instances and IP changes", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    for (let i = 0; i < 3; i++) {
      assert.equal((await f.reserve[i % 2]!({ ...input(), ipAddress: `203.0.113.${10 + i}` })).allowed, true)
      await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = admitted_at - interval '61 seconds'")
    }
    assert.equal((await f.reserve[1]!({ ...input(), ipAddress: "198.51.100.1" })).reason, "phone_limit")
    await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = clock_timestamp() - interval '24 hours' - interval '1 second'")
    assert.equal((await f.reserve[1]!(input())).allowed, true)
    const row = (await f.pools[0]!.query("SELECT * FROM blumi_sms_send_admissions LIMIT 1")).rows[0]
    const serialized = JSON.stringify(row)
    assert.equal(serialized.includes(input().phoneNumber), false)
    assert.equal(serialized.includes(input().ipAddress), false)
    assert.ok(/^[0-9a-f]{64}$/.test(row.phone_key))
  } finally { await f.close() }
})

test("rotating destination numbers exhausts one shared IP budget", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    // Isolate the hard IP budget below the adaptive step-up threshold.
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET ip_limit_15_minutes = 4")
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => f.reserve[i % 2]!(input(i + 1))))
    assert.equal(results.filter(result => result.allowed).length, 4)
    assert.ok(results.filter(result => !result.allowed).every(result => result.reason === "ip_limit"))
    assert.equal((await f.reserve[0]!({ ...input(100), ipAddress: "198.51.100.1" })).allowed, true)
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET ip_limit_24_hours = 4")
    await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = admitted_at - interval '16 minutes'")
    assert.equal((await f.reserve[1]!(input(101))).reason, "ip_limit")
  } finally { await f.close() }
})

test("rotating both phone and IP cannot exceed the project budget", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET project_limit_24_hours = 5")
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      f.reserve[i % 2]!({ ...input(i + 1), ipAddress: `203.0.113.${20 + i}` })))
    assert.equal(results.filter(result => result.allowed).length, 5)
    assert.ok(results.filter(result => !result.allowed).every(result => result.reason === "project_limit"))
  } finally { await f.close() }
})

test("replayed or stale provider events cannot authorize a second send", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    // Provider IDs are opaque strings, not file names or URL path segments.
    const event = { ...input(), eventId: "opaque:event/id.1" }
    assert.equal((await f.reserve[0]!(event)).allowed, true)
    assert.equal((await f.reserve[1]!(event)).reason, "replay")
    assert.equal((await f.reserve[0]!({ ...input(2), timestamp: new Date(Date.now() - 360_000).toISOString() })).reason, "invalid_event")
    assert.equal((await f.reserve[0]!({ ...input(3), timestamp: new Date(Date.now() + 60_000).toISOString() })).reason, "invalid_event")
  } finally { await f.close() }
})

test("the function identity cannot disable budgets or erase recent reservations", disposablePostgresSkip(), async () => {
  const f = await fixture()
  const restricted = new Pool({ connectionString: process.env.DATABASE_URL,
    options: "-c role=blumi_sms_defense", max: 1 })
  try {
    const reserve = createPostgresSmsAdmission({ pool: restricted, projectId: "fixture-project",
      hmacSecret: "fixture-key-with-at-least-32-bytes-long", expectedMigrationChecksum: checksum })
    await provisionPermit(f.pools[0]!, input())
    assert.equal((await reserve(input())).allowed, true)
    assert.equal((await reserve(input())).reason, "phone_cooldown")
    const client = await f.pools[0]!.connect()
    try {
      await client.query("SET ROLE blumi_sms_defense")
      assert.equal((await client.query("SELECT count(*)::int AS total FROM blumi_sms_send_admissions")).rows[0].total, 1)
      await assert.rejects(client.query("UPDATE blumi_sms_admission_config SET enabled = false"), /permission denied/)
      await assert.rejects(client.query("DELETE FROM blumi_sms_send_admissions"), /permission denied/)
      await assert.rejects(client.query("UPDATE blumi_sms_country_policy SET price_microusd = 1"), /permission denied/)
      await client.query("SELECT blumi_sms_prune_expired()")
      assert.equal((await client.query("SELECT count(*)::int AS total FROM blumi_sms_send_admissions")).rows[0].total, 1)
      await client.query("RESET ROLE")
      for (const role of ["anon", "authenticated"]) {
        const row = (await client.query("SELECT has_table_privilege($1, 'blumi_sms_send_admissions', 'SELECT') AS permitted", [role])).rows[0]
        assert.equal(row.permitted, false)
      }
    } finally { client.release() }
  } finally { await restricted.end(); await f.close() }
})

test("direct provider calls require a fresh destination-bound permit and consume it once", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    assert.equal((await f.rawReserve[0]!(input())).reason, "device_permit_required")
    await provisionPermit(f.pools[0]!, input())
    assert.equal((await f.rawReserve[1]!(input(2))).reason, "device_permit_required")
    assert.equal((await f.rawReserve[0]!(input())).allowed, true)
    await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = admitted_at - interval '61 seconds'")
    assert.equal((await f.rawReserve[1]!(input())).reason, "device_permit_required")
    await provisionPermit(f.pools[0]!, input(3))
    await f.pools[0]!.query("UPDATE blumi_sms_device_permits SET expires_at = created_at + interval '1 microsecond'")
    assert.equal((await f.rawReserve[1]!(input(3))).reason, "device_permit_required")
  } finally { await f.close() }
})

test("a permit that expired less than a millisecond ago never admits a send", disposablePostgresSkip(), async () => {
  // PostgreSQL keeps microseconds; a JavaScript Date keeps milliseconds. The
  // expiry check must use the database clock at full precision, so a permit
  // that expired within the current millisecond is refused every time.
  const f = await fixture()
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const event = input(10 + attempt)
      await provisionPermit(f.pools[0]!, event)
      await f.pools[0]!.query(`UPDATE blumi_sms_device_permits SET expires_at = created_at + interval '1 microsecond'
        WHERE consumed_at IS NULL`)
      assert.equal((await f.rawReserve[attempt % 2]!(event)).reason, "device_permit_required")
    }
    assert.equal((await f.pools[0]!.query("SELECT count(*)::int AS total FROM blumi_sms_send_admissions")).rows[0].total, 0)
  } finally { await f.close() }
})

test("parallel requests with rotating phones and IPs cannot overdraw daily money", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET cost_limit_24_hours_microusd = 25000")
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      f.reserve[i % 2]!({ ...input(i + 1), ipAddress: `198.51.100.${i + 1}` })))
    assert.equal(results.filter(result => result.allowed).length, 2)
    assert.ok(results.filter(result => !result.allowed).every(result => result.reason === "daily_cost_limit"))
    assert.equal((await f.pools[0]!.query("SELECT sum(charge_microusd)::text AS spent FROM blumi_sms_send_admissions")).rows[0].spent, "20000")
  } finally { await f.close() }
})

test("the monthly budget preserves historical charges and is not reset by a tariff update", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET cost_limit_month_microusd = 20000")
    assert.equal((await f.reserve[0]!(input(1))).allowed, true)
    await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'")
    await f.pools[0]!.query("SELECT blumi_sms_prune_expired()")
    await f.pools[0]!.query("UPDATE blumi_sms_country_policy SET price_microusd = 5000")
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      f.reserve[i % 2]!({ ...input(i + 2), ipAddress: `198.51.100.${i + 1}` })))
    assert.equal(results.filter(result => result.allowed).length, 2)
    assert.ok(results.filter(result => !result.allowed).every(result => result.reason === "monthly_cost_limit"))
    assert.equal((await f.pools[0]!.query("SELECT sum(charge_microusd)::text AS spent FROM blumi_sms_send_admissions")).rows[0].spent, "20000")
    // A prior UTC calendar month is excluded, while the rolling-day limits
    // still include that reservation if it is less than 24 hours old.
    await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = (date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '1 second'")
    assert.equal((await f.reserve[1]!({ ...input(20), ipAddress: "203.0.113.99" })).allowed, true)
  } finally { await f.close() }
})

test("country allowlist, price freshness, country count and cost limits cannot be bypassed", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await f.pools[0]!.query("DELETE FROM blumi_sms_country_policy")
    assert.equal((await f.reserve[0]!(input())).reason, "country_unavailable")
    await f.pools[0]!.query(`INSERT INTO blumi_sms_country_policy VALUES
      ('US', false, 10000, clock_timestamp() + interval '1 day', 1, 5000)`)
    assert.equal((await f.reserve[0]!(input())).reason, "country_unavailable")
    await f.pools[0]!.query("UPDATE blumi_sms_country_policy SET enabled = true, price_valid_until = clock_timestamp() - interval '1 second'")
    assert.equal((await f.reserve[0]!(input())).reason, "country_unavailable")
    await f.pools[0]!.query("UPDATE blumi_sms_country_policy SET price_valid_until = clock_timestamp() + interval '1 day'")
    assert.equal((await f.reserve[0]!(input())).reason, "country_cost_limit")
    await f.pools[0]!.query("UPDATE blumi_sms_country_policy SET cost_limit_24_hours_microusd = 20000")
    assert.equal((await f.reserve[0]!(input())).allowed, true)
    assert.equal((await f.reserve[1]!(input(2))).reason, "country_limit")
    await f.pools[0]!.query("UPDATE blumi_sms_country_policy SET limit_24_hours = 10, cost_limit_24_hours_microusd = 15000")
    assert.equal((await f.reserve[1]!(input(2))).reason, "country_cost_limit")
  } finally { await f.close() }
})

test("a project burst cannot consume the full monthly budget in parallel", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET project_limit_15_minutes = 3")
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      f.reserve[i % 2]!({ ...input(i + 1), ipAddress: `198.51.100.${i + 1}` })))
    assert.equal(results.filter(result => result.allowed).length, 3)
    assert.ok(results.filter(result => !result.allowed).every(result => result.reason === "project_burst_limit"))
    await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = admitted_at - interval '16 minutes'")
    assert.equal((await f.reserve[1]!(input(30))).allowed, true)
  } finally { await f.close() }
})

test("normal traffic has no hourly dollar ceiling while daily and monthly budgets remain", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await f.pools[0]!.query("UPDATE blumi_sms_country_policy SET price_microusd = 600000")
    assert.equal((await f.reserve[0]!(input())).allowed, true)
    assert.equal((await f.reserve[1]!(input(2))).allowed, true)
    assert.equal((await f.pools[0]!.query("SELECT sum(charge_microusd)::text AS spent FROM blumi_sms_send_admissions")).rows[0].spent, "1200000")
  } finally { await f.close() }
})

async function provisionProjectSurge(f: Awaited<ReturnType<typeof fixture>>) {
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    f.reserve[i % 2]!({ ...input(i + 1), ipAddress: `198.51.100.${i + 1}` })))
  assert.ok(results.every(result => result.allowed))
  await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = clock_timestamp() - interval '2 minutes'")
}

test("project surge requires genuine provider bot confidence and rejects missing or malformed scores", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await provisionProjectSurge(f)
    for (const recaptchaScore of [undefined, null, "0.9", {}, NaN, Infinity, -1, 1.1, 0.699]) {
      assert.equal((await f.reserve[0]!({ ...input(30), recaptchaScore })).reason, "risk_verification_required")
    }
    assert.equal((await f.pools[0]!.query("SELECT count(*)::int AS total FROM blumi_sms_send_admissions")).rows[0].total, 20)
    assert.equal((await f.pools[0]!.query("SELECT count(*)::int AS total FROM blumi_sms_device_permits WHERE consumed_at IS NOT NULL")).rows[0].total, 20)
    assert.equal((await f.reserve[1]!({ ...input(30), recaptchaScore: 0.7 })).allowed, true)
    // Step-up approval cannot bypass the original phone cooldown or budget.
    assert.equal((await f.reserve[0]!({ ...input(30), recaptchaScore: 1 })).reason, "phone_cooldown")
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET cost_limit_24_hours_microusd = 210000")
    assert.equal((await f.reserve[0]!({ ...input(31), recaptchaScore: 1 })).reason, "daily_cost_limit")
  } finally { await f.close() }
})

test("surge pacing is atomic across devices and instances and relaxes when traffic subsides", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await provisionProjectSurge(f)
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      f.reserve[i % 2]!({ ...input(i + 30), ipAddress: `203.0.113.${i + 30}`, recaptchaScore: 0.9 })))
    assert.equal(results.filter(result => result.allowed).length, 6)
    assert.ok(results.filter(result => !result.allowed).every(result => result.reason === "adaptive_rate_limit"))
    await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = clock_timestamp() - interval '6 minutes'")
    assert.equal((await f.reserve[1]!(input(60))).allowed, true)
  } finally { await f.close() }
})

test("an IP surge steps up and slows only that source, not unrelated normal traffic", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    for (let i = 1; i <= 5; i++) assert.equal((await f.reserve[i % 2]!(input(i))).allowed, true)
    assert.equal((await f.reserve[0]!(input(6))).reason, "risk_verification_required")
    assert.equal((await f.reserve[1]!({ ...input(6), recaptchaScore: 0.9 })).reason, "adaptive_rate_limit")
    assert.equal((await f.reserve[1]!({ ...input(7), ipAddress: "198.51.100.1" })).allowed, true)
    await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = clock_timestamp() - interval '61 seconds'")
    assert.equal((await f.reserve[0]!({ ...input(8), recaptchaScore: 0.9 })).allowed, true)
    assert.equal((await f.reserve[1]!({ ...input(9), recaptchaScore: 0.9 })).reason, "adaptive_rate_limit")
  } finally { await f.close() }
})

test("only fresh signed phone completion credits the latest send once, without refunding costs", disposablePostgresSkip(), async () => {
  const f = await fixture()
  const restricted = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c role=blumi_sms_observer", max: 1 })
  try {
    const record = createSmsOutcomeObserver({ pool: restricted, projectId: "fixture-project", hmacSecret: fixtureSecret, expectedMigrationChecksum: checksum })
    const sent = input()
    await f.reserve[0]!(sent)
    await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = clock_timestamp() - interval '2 minutes'")
    await f.reserve[0]!(input())
    const event = { resource: sent.resource, eventId: randomUUID(), timestamp: new Date().toISOString(), providerId: "phone", phoneNumber: sent.phoneNumber }
    for (const change of [{ providerId: "password" }, { resource: "projects/other-project" },
      { timestamp: new Date(Date.now() - 360_000).toISOString() }, { phoneNumber: input(2).phoneNumber }]) {
      assert.equal(await record({ ...event, ...change }), false)
    }
    assert.equal(await record(event), true)
    assert.equal(await record(event), false)
    assert.equal(await record({ ...event, eventId: randomUUID() }), false)
    assert.equal((await f.pools[0]!.query("SELECT count(*)::int AS total FROM blumi_sms_send_admissions WHERE verified_at IS NOT NULL")).rows[0].total, 1)
    assert.equal((await f.pools[0]!.query("SELECT sum(charge_microusd)::text AS spent FROM blumi_sms_send_admissions")).rows[0].spent, "20000")
    await assert.rejects(restricted.query("DELETE FROM blumi_sms_send_admissions"), /permission denied/)
    await assert.rejects(restricted.query("UPDATE blumi_sms_admission_config SET enabled = false"), /permission denied/)
    await assert.rejects(restricted.query("UPDATE blumi_sms_send_admissions SET charge_microusd = 1"), /permission denied/)
  } finally { await restricted.end(); await f.close() }
})

test("completion risk waits for ten mature attempts and never treats a single missed completion as abuse", disposablePostgresSkip(), async () => {
  const f = await fixture()
  try {
    await f.pools[0]!.query("UPDATE blumi_sms_admission_config SET verification_outcomes_enabled = true")
    // Spread accepted sends across time to isolate completion risk from surge.
    for (let i = 1; i <= 10; i++) {
      assert.equal((await f.reserve[0]!(input(i))).allowed, true)
      await f.pools[0]!.query("UPDATE blumi_sms_send_admissions SET admitted_at = clock_timestamp() - interval '16 minutes'")
    }
    assert.equal((await f.reserve[1]!(input(11))).reason, "risk_verification_required")
    assert.equal((await f.reserve[1]!({ ...input(11), recaptchaScore: 0.9 })).allowed, true)
    await f.pools[0]!.query(`UPDATE blumi_sms_send_admissions SET verified_at = clock_timestamp(), verification_key = event_key
      WHERE event_key IN (SELECT event_key FROM blumi_sms_send_admissions ORDER BY admitted_at LIMIT 3)`)
    // Seven of ten mature attempts lack completion: below the 80% threshold.
    assert.equal((await f.reserve[0]!(input(12))).allowed, true)
  } finally { await f.close() }
})
